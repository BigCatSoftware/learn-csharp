# Query Optimization

*Chapter 9.7 — T-SQL for Data Engineers*

## Overview

Knowing how to read an execution plan (lesson 125) is step one. This lesson covers
**why** SQL Server picks a particular plan and what you can do when it picks badly.

Topics:

- Statistics: what they are, how auto-update works, when it fails
- Parameter sniffing: causes, detection, and five fix strategies
- Query Store: enabling, monitoring regressions, forcing plans
- Cardinality estimator versions and compatibility levels
- Query hints and plan guides
- BNBuilders: taming parameter sniffing in nightly ETL

---

## Core Concepts

### Statistics

Statistics are histograms (up to 200 steps) that describe data distribution in a column
or set of columns. The optimizer uses them to estimate how many rows each operator will
produce.

**Auto-update triggers:**

| Table Size | Rows Changed to Trigger Update |
|---|---|
| < 500 rows | Any change |
| >= 500 rows (pre-2016) | 500 + 20% of table |
| >= 500 rows (2016+ with TF 2371 or compat >= 130) | sqrt(1000 * table rows) — much more frequent |

```sql
-- View statistics details
DBCC SHOW_STATISTICS('dbo.JobCostDetail', 'IX_JobCostDetail_PostDate');

-- Check last update time
SELECT
    s.name AS stat_name,
    sp.last_updated,
    sp.rows,
    sp.rows_sampled,
    sp.modification_counter
FROM sys.stats s
CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
WHERE s.object_id = OBJECT_ID('dbo.JobCostDetail')
ORDER BY sp.modification_counter DESC;

-- Manual update with full scan (most accurate)
UPDATE STATISTICS dbo.JobCostDetail WITH FULLSCAN;

-- Async auto-update (prevents queries from waiting on stats rebuild)
ALTER DATABASE BNBuilders SET AUTO_UPDATE_STATISTICS_ASYNC ON;
```

### The Ascending Key Problem

When a column has an always-increasing value (identity, datetime of insert), new values
fall outside the histogram's last step. The optimizer estimates 1 row for any value
beyond the histogram range — often catastrophically wrong.

```sql
-- Classic ascending key issue: JobCostDetail gets new PostDates daily
-- Statistics last updated 3 days ago; histogram max is 2025-06-15
-- Query for PostDate = '2025-06-18' estimates 1 row, actual = 50,000

-- Fix 1: Update stats more frequently
UPDATE STATISTICS dbo.JobCostDetail (IX_JobCostDetail_PostDate) WITH FULLSCAN;

-- Fix 2: Use trace flag 2389/2390 (older) or compat level 130+
-- which has the "quick stats update" for ascending keys

-- Fix 3: OPTION (RECOMPILE) to get a sniffed literal every time
SELECT * FROM dbo.JobCostDetail
WHERE PostDate = @RunDate
OPTION (RECOMPILE);
```

---

### Parameter Sniffing

When SQL Server compiles a stored procedure or parameterized query, it **sniffs** the
parameter values from the first execution and optimizes the plan for those values. That
plan is cached and reused for all subsequent executions.

**When it goes wrong:** The first execution uses an atypical parameter value, and the
resulting plan is terrible for typical values.

```sql
-- Example: Job 9999 has 3 rows; Job 4520 has 2 million rows
-- If Job 9999 is compiled first, plan uses Nested Loops + Key Lookup
-- That plan is catastrophic for Job 4520

CREATE PROCEDURE dbo.GetJobCosts
    @JobID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT jc.CostCodeID, jc.Amount, jc.PostDate, jc.Description
    FROM dbo.JobCostDetail jc
    WHERE jc.JobID = @JobID;
END;

-- First call — compiles plan optimized for small job
EXEC dbo.GetJobCosts @JobID = 9999;  -- 3 rows, Nested Loops plan cached

-- Second call — reuses wrong plan
EXEC dbo.GetJobCosts @JobID = 4520;  -- 2M rows, Nested Loops = disaster
```

#### Detecting Parameter Sniffing

```sql
-- Method 1: Compare estimated vs actual rows in actual plan
-- Huge discrepancy = likely sniffing

-- Method 2: Check cached plan's compile-time parameter values
SELECT
    qs.plan_handle,
    qs.execution_count,
    qs.total_logical_reads,
    qs.total_elapsed_time,
    qp.query_plan  -- look for ParameterCompiledValue vs ParameterRuntimeValue
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
WHERE qp.query_plan.exist('
    //StmtSimple[@StatementText[contains(., "JobCostDetail")]]
') = 1;

-- Method 3: Query Store (easiest)
-- Look for queries with multiple plans or high variation in duration
```

#### Five Fixes for Parameter Sniffing

```sql
-- Fix 1: OPTION (RECOMPILE) — recompile every execution
-- Best when: execution frequency is low, compilation cost is acceptable
SELECT jc.CostCodeID, jc.Amount
FROM dbo.JobCostDetail jc
WHERE jc.JobID = @JobID
OPTION (RECOMPILE);

-- Fix 2: OPTIMIZE FOR a typical value
-- Best when: one value is representative of most executions
SELECT jc.CostCodeID, jc.Amount
FROM dbo.JobCostDetail jc
WHERE jc.JobID = @JobID
OPTION (OPTIMIZE FOR (@JobID = 4520));

-- Fix 3: OPTIMIZE FOR UNKNOWN — use average density instead of sniffing
-- Best when: no single typical value, but distribution is roughly uniform
SELECT jc.CostCodeID, jc.Amount
FROM dbo.JobCostDetail jc
WHERE jc.JobID = @JobID
OPTION (OPTIMIZE FOR UNKNOWN);

-- Fix 4: Dynamic SQL with sp_executesql — each distinct value gets its own plan
-- Best when: small number of distinct parameter values
CREATE PROCEDURE dbo.GetJobCosts_v2
    @JobID INT
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_executesql
        N'SELECT jc.CostCodeID, jc.Amount
          FROM dbo.JobCostDetail jc
          WHERE jc.JobID = @jid',
        N'@jid INT',
        @jid = @JobID;
END;

-- Fix 5: Plan guides (last resort — forces a specific plan shape)
EXEC sp_create_plan_guide
    @name = N'Guide_GetJobCosts',
    @stmt = N'SELECT jc.CostCodeID, jc.Amount
              FROM dbo.JobCostDetail jc
              WHERE jc.JobID = @JobID',
    @type = N'OBJECT',
    @module_or_batch = N'dbo.GetJobCosts',
    @hints = N'OPTION (OPTIMIZE FOR (@JobID = 4520))';
```

---

### Query Store

Query Store is a flight recorder for query performance. It captures plans, runtime
stats, and wait stats per query.

```sql
-- Enable Query Store
ALTER DATABASE BNBuilders SET QUERY_STORE = ON (
    OPERATION_MODE = READ_WRITE,
    MAX_STORAGE_SIZE_MB = 2048,
    INTERVAL_LENGTH_MINUTES = 30,
    DATA_FLUSH_INTERVAL_SECONDS = 900,
    QUERY_CAPTURE_MODE = AUTO,       -- only captures meaningful queries
    SIZE_BASED_CLEANUP_MODE = AUTO,
    STALE_QUERY_THRESHOLD_DAYS = 30
);

-- Find regressed queries (high recent duration vs. historical)
SELECT
    q.query_id,
    qt.query_sql_text,
    rs.avg_duration / 1000.0 AS avg_duration_ms,
    rs.avg_logical_io_reads,
    rs.count_executions,
    p.plan_id,
    p.is_forced_plan
FROM sys.query_store_query q
JOIN sys.query_store_query_text qt ON qt.query_text_id = q.query_text_id
JOIN sys.query_store_plan p ON p.query_id = q.query_id
JOIN sys.query_store_runtime_stats rs ON rs.plan_id = p.plan_id
JOIN sys.query_store_runtime_stats_interval rsi
    ON rsi.runtime_stats_interval_id = rs.runtime_stats_interval_id
WHERE rsi.start_time >= DATEADD(HOUR, -24, GETUTCDATE())
ORDER BY rs.avg_duration DESC;

-- Force a known-good plan
EXEC sp_query_store_force_plan @query_id = 42, @plan_id = 7;

-- Unforce
EXEC sp_query_store_unforce_plan @query_id = 42, @plan_id = 7;
```

### Cardinality Estimator Versions

| Compat Level | CE Version | Behavior |
|---|---|---|
| 70-110 | Legacy CE (CE70) | Assumes independence between columns |
| 120+ | New CE (CE120) | Assumes some correlation between columns |
| 150+ | CE150 | Better handling of multi-predicate estimates |

```sql
-- Check current compat level
SELECT name, compatibility_level FROM sys.databases WHERE name = 'BNBuilders';

-- Use legacy CE for a specific query (if new CE gives bad estimates)
SELECT * FROM dbo.JobCostDetail
WHERE JobID = 4520 AND PostDate >= '2025-01-01'
OPTION (USE HINT('FORCE_LEGACY_CARDINALITY_ESTIMATION'));
```

---

## Code Examples

### Monitoring Query Store from C#

```csharp
using Microsoft.Data.SqlClient;

public record RegressedQuery(
    long QueryId,
    string SqlText,
    double AvgDurationMs,
    long AvgLogicalReads,
    long Executions);

public static async Task<List<RegressedQuery>> GetRegressedQueriesAsync(
    string connectionString, int topN = 20)
{
    const string sql = @"
        SELECT TOP (@TopN)
            q.query_id,
            SUBSTRING(qt.query_sql_text, 1, 500) AS sql_text,
            rs.avg_duration / 1000.0 AS avg_duration_ms,
            rs.avg_logical_io_reads,
            rs.count_executions
        FROM sys.query_store_query q
        JOIN sys.query_store_query_text qt
            ON qt.query_text_id = q.query_text_id
        JOIN sys.query_store_plan p ON p.query_id = q.query_id
        JOIN sys.query_store_runtime_stats rs ON rs.plan_id = p.plan_id
        JOIN sys.query_store_runtime_stats_interval rsi
            ON rsi.runtime_stats_interval_id = rs.runtime_stats_interval_id
        WHERE rsi.start_time >= DATEADD(HOUR, -24, GETUTCDATE())
        ORDER BY rs.avg_duration DESC;";

    var results = new List<RegressedQuery>();
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();
    await using var cmd = new SqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("@TopN", topN);

    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        results.Add(new RegressedQuery(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.GetDouble(2),
            reader.GetInt64(3),
            reader.GetInt64(4)));
    }
    return results;
}
```

---

## Common Patterns

### Pattern 1: The "Kitchen Sink" Procedure

A stored procedure with many optional parameters. Classic parameter sniffing victim.

```sql
CREATE PROCEDURE dbo.SearchJobCosts
    @JobID      INT = NULL,
    @CostCode   VARCHAR(20) = NULL,
    @StartDate  DATE = NULL,
    @EndDate    DATE = NULL,
    @MinAmount  DECIMAL(18,2) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT JobID, CostCodeID, Amount, PostDate
    FROM dbo.JobCostDetail
    WHERE (@JobID IS NULL OR JobID = @JobID)
      AND (@CostCode IS NULL OR CostCodeID = @CostCode)
      AND (@StartDate IS NULL OR PostDate >= @StartDate)
      AND (@EndDate IS NULL OR PostDate <= @EndDate)
      AND (@MinAmount IS NULL OR Amount >= @MinAmount)
    OPTION (RECOMPILE);  -- necessary for the OR pattern to optimize
END;
```

### Pattern 2: Stats Maintenance Job

```sql
-- Run nightly after ETL completes
EXEC sp_updatestats;  -- updates only statistics that have changed rows

-- For critical tables, use full scan
UPDATE STATISTICS dbo.JobCostDetail WITH FULLSCAN;
UPDATE STATISTICS dbo.Budget WITH FULLSCAN;
UPDATE STATISTICS dbo.LedgerDetail WITH FULLSCAN;
```

---

## Gotchas and Pitfalls

1. **OPTION (RECOMPILE) on hot-path queries kills CPU.** Each recompile costs 5-50ms
   of CPU. A query running 1,000 times/second should NOT use RECOMPILE.

2. **OPTIMIZE FOR UNKNOWN is not the same as no sniffing.** It uses the average density
   from statistics, which can be just as wrong as a sniffed value for skewed data.

3. **Forcing plans in Query Store can mask the real problem.** The forced plan may degrade
   over time as data changes. Use forcing as a band-aid while you fix the root cause.

4. **Changing database compatibility level changes the CE for ALL queries.** Test
   thoroughly with Query Store A/B comparison before changing compat level.

5. **Auto-stats updates block the query that triggers them** (unless async auto-stats
   is enabled). On big tables, this can cause multi-second delays.

6. **Plan guides break silently.** Schema changes can invalidate them. Monitor with
   `sys.plan_guides` and check `is_disabled`.

7. **Query Store `QUERY_CAPTURE_MODE = ALL` captures ad-hoc noise.** Use `AUTO` to
   filter out single-execution throwaway queries.

---

## Performance Considerations

- **Full-scan statistics** are most accurate but expensive on huge tables. Run them during
  maintenance windows (after nightly ETL, not during).
- **Incremental statistics** (on partitioned tables) update only changed partitions. Use
  `CREATE STATISTICS ... WITH INCREMENTAL = ON`.
- **Plan cache bloat** from un-parameterized queries wastes memory. Check with:
  ```sql
  SELECT objtype, COUNT(*) AS plan_count, SUM(size_in_bytes)/1024/1024 AS size_mb
  FROM sys.dm_exec_cached_plans
  GROUP BY objtype ORDER BY size_mb DESC;
  ```
- **Query Store storage** can grow large. Set `MAX_STORAGE_SIZE_MB` and enable
  `SIZE_BASED_CLEANUP_MODE = AUTO`.
- **TF 2371** (dynamic stats update threshold) is automatic at compat level 130+. If you
  are stuck on an older compat level, enable it as a startup trace flag.

---

## BNBuilders Context

### Scenario: Nightly ETL Parameter Sniffing

BNBuilders runs a nightly ETL that processes job cost records by date range. On the
1st of each month, the date range spans 30 days and processes 500K records. On other
nights, it processes only that day's records (typically 5K).

**Problem:** If the monthly run compiles first, the plan is optimized for 500K rows
(hash joins, parallel scans). On the next night's 5K-row run, this plan wastes resources.
Conversely, if a daily run compiles first, the monthly run gets a nested loops plan and
takes 45 minutes instead of 2 minutes.

```sql
-- The ETL proc
CREATE PROCEDURE dbo.ETL_LoadJobCosts
    @StartDate DATE,
    @EndDate   DATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Fix: RECOMPILE is acceptable here because ETL runs once per night
    INSERT INTO dbo.JobCostFact (JobKey, CostCodeKey, DateKey, Amount)
    SELECT
        dj.JobKey,
        dc.CostCodeKey,
        dd.DateKey,
        src.Amount
    FROM staging.JobCostDetail src
    INNER JOIN dbo.DimJob dj ON dj.JobID = src.JobID
    INNER JOIN dbo.DimCostCode dc ON dc.CostCodeID = src.CostCodeID
    INNER JOIN dbo.DimDate dd ON dd.FullDate = src.PostDate
    WHERE src.PostDate BETWEEN @StartDate AND @EndDate
    OPTION (RECOMPILE);
END;
```

### Oracle-to-SQL Server Migration

Oracle's optimizer has different statistics behavior (no 200-step histogram limit,
different auto-gather schedule via `DBMS_STATS`). After migrating CMiC data:
- Run full-scan statistics on all migrated tables
- Verify cardinality estimates match Oracle's by comparing execution plans
- Oracle's `bind variable peeking` is analogous to parameter sniffing — same problem,
  same category of fixes

---

## Interview / Senior Dev Questions

1. **Q: What is parameter sniffing and when does it become a problem?**
   A: Parameter sniffing is when SQL Server uses the actual parameter value from the
   first execution to optimize and cache the plan. It becomes a problem when data
   distribution is skewed — the cached plan is optimal for the sniffed value but
   terrible for other values.

2. **Q: How does OPTION (RECOMPILE) differ from OPTION (OPTIMIZE FOR UNKNOWN)?**
   A: RECOMPILE generates a fresh plan every execution using the current parameter
   values. OPTIMIZE FOR UNKNOWN uses the average density from statistics without
   looking at the actual parameter. Recompile gives perfect estimates but costs CPU.
   UNKNOWN avoids worst-case sniffing but may give mediocre plans for all values.

3. **Q: What is Query Store and how does it help with plan regressions?**
   A: Query Store captures query text, execution plans, and runtime statistics over
   time. For plan regressions, you can compare the new plan's metrics against the
   old plan's metrics and force the old (good) plan until the root cause is fixed.

4. **Q: When would you change database compatibility level, and what are the risks?**
   A: To get a newer cardinality estimator or language features. The risk is that
   the new CE changes estimates for many queries, potentially causing plan regressions
   across the board. Use Query Store's A/B comparison to test before committing.

---

## Quiz

### Question 1
Your nightly ETL stored proc runs in 2 minutes on Tuesday but 45 minutes on Wednesday
with identical data volumes. The plan cache was cleared Tuesday night. What's the most
likely cause?

<details>
<summary>Answer</summary>

**Parameter sniffing.** The plan was evicted Tuesday night. Wednesday's execution was
the first call after the cache clear. If Wednesday's parameters were atypical (e.g., a
very small or very large date range), the plan compiled for those values would be wrong
for subsequent executions. Check the compiled parameter values in the cached plan or
Query Store.
</details>

### Question 2
You see `modification_counter = 4,500,000` in `sys.dm_db_stats_properties` for a table
with 10 million rows at compat level 130. Have auto-statistics triggered an update?

<details>
<summary>Answer</summary>

At compat level 130+, the dynamic threshold is approximately `sqrt(1000 * rows)` which
is `sqrt(1000 * 10,000,000) = ~100,000`. Since 4.5M modifications far exceed 100K, the
auto-update **should** have triggered. If it hasn't, check whether `AUTO_UPDATE_STATISTICS`
is enabled and whether the query workload has actually touched that table since the
modifications happened (auto-update only triggers when a query needs the statistics).
</details>

### Question 3
A developer adds `OPTION (RECOMPILE)` to a query in a web API that handles 500
requests/second. Is this a good idea?

<details>
<summary>Answer</summary>

**No.** At 500 requests/second, each recompile adds CPU overhead (5-50ms of compile time).
This would consume a significant portion of server CPU on compilation alone. Better
alternatives: `OPTIMIZE FOR` a typical value, use `OPTIMIZE FOR UNKNOWN`, or restructure
with separate code paths for different parameter ranges.
</details>

### Question 4
You force a plan in Query Store. Six months later, users report the query is slow again.
What happened?

<details>
<summary>Answer</summary>

Data distribution has changed significantly since the plan was forced. The forced plan
was optimal six months ago but is now suboptimal for the current data. Forcing a plan
does **not** adapt to data changes. You should un-force the plan, update statistics,
and let the optimizer generate a new plan. Use Query Store to evaluate whether the new
plan is better.
</details>
