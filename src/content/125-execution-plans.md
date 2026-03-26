# Reading Execution Plans

*Chapter 9.6 — T-SQL for Data Engineers*

## Overview

Execution plans are the single most important tool for understanding **why** a query is
slow. SQL Server's query optimizer evaluates dozens (sometimes thousands) of candidate
plans and picks the one with the lowest estimated cost. Learning to read these plans lets
you move from guessing to diagnosing.

This lesson covers:

- Estimated vs. actual plans and when to use each
- The most common physical operators and what they mean
- How to interpret cost percentages, row counts, and warnings
- Using `SET STATISTICS IO` and `SET STATISTICS TIME` for hard numbers
- Real-world pattern: diagnosing a slow job-cost report at BNBuilders

---

## Core Concepts

### Estimated vs. Actual Plans

| Aspect | Estimated Plan | Actual Plan |
|---|---|---|
| **How to get it** | `Ctrl+L` in SSMS, or `SET SHOWPLAN_XML ON` | `Ctrl+M` then execute, or `SET STATISTICS XML ON` |
| **Executes the query?** | No | Yes |
| **Shows row counts?** | Estimated only | Estimated **and** actual |
| **Shows runtime stats?** | No | Yes (elapsed time, memory grant, spills) |
| **Safe on production?** | Yes — no data touched | Careful — query actually runs |

**Rule of thumb:** Use estimated plans for quick checks. Use actual plans when you need
to find discrepancies between estimated and actual row counts (the #1 source of bad plans).

### Plan Reading Direction

Plans read **right to left, top to bottom**. Data flows from the rightmost operators
(leaf nodes that touch tables/indexes) toward the leftmost operator (`SELECT`).

The percentages on each operator are the optimizer's **estimated** cost relative to the
entire batch. They are useful for identifying the most expensive step but are **not**
wall-clock time.

---

### Key Physical Operators

#### Access Methods (How SQL Server Reads Data)

| Operator | What It Does | Good or Bad? |
|---|---|---|
| **Index Seek** | B-tree traversal to a specific range of rows | Usually good — O(log n) |
| **Index Scan** | Reads entire index leaf level | Acceptable on small tables; red flag on large ones |
| **Table Scan** | Reads every page of a heap | Almost always a problem on big tables |
| **Clustered Index Scan** | Reads every page of a clustered index | Equivalent to a table scan on a clustered table |
| **Key Lookup** (Bookmark Lookup) | Goes back to the clustered index to fetch columns not in the covering index | Expensive when done millions of times; consider covering indexes |

```sql
-- Force an index seek for demonstration
SELECT JobID, CostCode, Amount
FROM dbo.JobCostDetail WITH (INDEX(IX_JobCostDetail_JobID))
WHERE JobID = 4520;
-- Plan: Index Seek (NonClustered) -> Key Lookup (Clustered) -> Nested Loops
```

#### Join Operators

| Operator | Best For | Memory Grant? |
|---|---|---|
| **Nested Loops** | Small outer input, indexed inner input | No |
| **Hash Match** | Large unsorted inputs, no useful indexes | Yes — can spill to tempdb |
| **Merge Join** | Both inputs pre-sorted on the join key | No (but needs sorted input) |

```sql
-- Nested Loops: small driving set
SELECT j.JobName, jc.Amount
FROM dbo.Job j
INNER JOIN dbo.JobCostDetail jc ON jc.JobID = j.JobID
WHERE j.JobID = 4520;

-- Hash Match: large unsorted sets
SELECT j.JobName, SUM(jc.Amount) AS TotalCost
FROM dbo.Job j
INNER JOIN dbo.JobCostDetail jc ON jc.JobID = j.JobID
GROUP BY j.JobName;

-- Merge Join: both sides sorted on join key
SELECT a.TransactionID, b.TransactionID
FROM dbo.LedgerA a
INNER JOIN dbo.LedgerB b ON a.PostDate = b.PostDate
ORDER BY a.PostDate;
```

#### Other Important Operators

| Operator | Purpose | Notes |
|---|---|---|
| **Sort** | Orders rows (ORDER BY, merge join prep, DISTINCT) | Needs memory grant; watch for spills |
| **Stream Aggregate** | Aggregation on pre-sorted input | Efficient, no memory grant |
| **Hash Aggregate** | Aggregation on unsorted input | Needs memory grant |
| **Spool (Eager)** | Materializes full result into tempdb before reading | Common in Halloween Protection for UPDATE |
| **Spool (Lazy)** | Caches rows on demand; re-reads from cache | Common in correlated subqueries |
| **Compute Scalar** | Evaluates an expression per row | Usually cheap; watch for hidden function calls |
| **Filter** | Applies a predicate to rows already fetched | If filtering late, suspect a missing index |
| **Parallelism (Gather Streams / Distribute Streams / Repartition Streams)** | Coordinates parallel threads | Look for skewed thread distribution |

---

### Warnings in Execution Plans

SSMS shows a yellow triangle warning icon on operators with issues.

| Warning | Meaning | Fix |
|---|---|---|
| **Missing Index** | Optimizer suggests an index that would help | Evaluate — don't blindly create |
| **Implicit Conversion** | Data type mismatch forces a CAST, killing seeks | Fix column types or CAST in the query |
| **No Join Predicate** | Cartesian product — usually a bug | Add the missing ON clause |
| **Excessive Memory Grant** | Query asked for way more memory than it used | Check cardinality estimates |
| **Spill to tempdb** | Sort or hash ran out of memory | Improve estimates or add memory |
| **Residual Predicate** | Seek predicate is only partial; filter does the rest | Improve index key columns |

```sql
-- Implicit conversion example: varchar column compared to nvarchar literal
-- This KILLS index seeks
SELECT * FROM dbo.Equipment
WHERE EquipmentCode = N'EX350';  -- EquipmentCode is varchar(20)

-- Fix: use the correct type
SELECT * FROM dbo.Equipment
WHERE EquipmentCode = 'EX350';   -- varchar literal matches column type
```

---

## Code Examples

### SET STATISTICS IO / TIME

```sql
SET STATISTICS IO ON;
SET STATISTICS TIME ON;

SELECT
    jc.JobID,
    j.JobName,
    cc.CostCodeDesc,
    SUM(jc.Amount) AS TotalAmount
FROM dbo.JobCostDetail jc
INNER JOIN dbo.Job j ON j.JobID = jc.JobID
INNER JOIN dbo.CostCode cc ON cc.CostCodeID = jc.CostCodeID
WHERE jc.PostDate >= '2025-01-01'
GROUP BY jc.JobID, j.JobName, cc.CostCodeDesc
ORDER BY TotalAmount DESC;

SET STATISTICS IO OFF;
SET STATISTICS TIME OFF;
```

**Reading the output:**

```
Table 'JobCostDetail'. Scan count 1, logical reads 14832, physical reads 0,
  read-ahead reads 0, lob logical reads 0.
Table 'Job'. Scan count 0, logical reads 952, physical reads 0.
Table 'CostCode'. Scan count 0, logical reads 476, physical reads 0.

SQL Server Execution Times:
  CPU time = 312 ms, elapsed time = 487 ms.
```

- **Logical reads** = pages read from buffer pool (memory). This is the key metric.
- **Physical reads** = pages read from disk (only on first run or memory pressure).
- **Scan count** = number of times the table was accessed.
- **CPU time** vs **elapsed time** — big gap means waiting on I/O or blocking.

### Capturing Plans Programmatically

```sql
-- Save actual plan XML for later analysis
SET STATISTICS XML ON;
-- ... your query ...
SET STATISTICS XML OFF;

-- Or use Query Store (see lesson 126)
SELECT
    qsq.query_id,
    qsp.plan_id,
    CAST(qsp.query_plan AS XML) AS query_plan_xml
FROM sys.query_store_query qsq
JOIN sys.query_store_plan qsp ON qsp.query_id = qsq.query_id
WHERE qsq.query_hash = 0xABC123;  -- find your query hash from sys.dm_exec_query_stats
```

### Reading the Plan in C# (for Automated Monitoring)

```csharp
using Microsoft.Data.SqlClient;
using System.Xml.Linq;

public static async Task<string> GetEstimatedPlanAsync(
    string connectionString, string sql)
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();

    // Turn on showplan
    await using (var cmd = new SqlCommand("SET SHOWPLAN_XML ON", conn))
        await cmd.ExecuteNonQueryAsync();

    // The query is NOT executed — we get the plan XML instead
    await using var planCmd = new SqlCommand(sql, conn);
    await using var reader = await planCmd.ExecuteReaderAsync();

    string planXml = null;
    if (await reader.ReadAsync())
        planXml = reader.GetString(0);

    // Turn off showplan
    await using (var cmd = new SqlCommand("SET SHOWPLAN_XML OFF", conn))
        await cmd.ExecuteNonQueryAsync();

    return planXml;
}

// Parse and check for warnings
public static void CheckPlanWarnings(string planXml)
{
    var doc = XDocument.Parse(planXml);
    XNamespace ns = "http://schemas.microsoft.com/sqlserver/2004/07/showplan";

    var warnings = doc.Descendants(ns + "Warnings");
    foreach (var warning in warnings)
    {
        Console.WriteLine($"WARNING: {warning}");
    }

    var missingIndexes = doc.Descendants(ns + "MissingIndexGroup");
    foreach (var mi in missingIndexes)
    {
        var impact = mi.Attribute("Impact")?.Value;
        Console.WriteLine($"Missing index suggestion (impact: {impact})");
    }
}
```

---

## Common Patterns

### Pattern 1: Key Lookup Elimination

```sql
-- Before: Index Seek + Key Lookup (expensive on many rows)
-- IX_JobCostDetail_PostDate covers only PostDate
SELECT JobID, CostCodeID, Amount, Description
FROM dbo.JobCostDetail
WHERE PostDate BETWEEN '2025-01-01' AND '2025-03-31';

-- Fix: Create a covering index
CREATE NONCLUSTERED INDEX IX_JobCostDetail_PostDate_Cover
ON dbo.JobCostDetail (PostDate)
INCLUDE (JobID, CostCodeID, Amount, Description);
```

### Pattern 2: Scan to Seek Conversion

```sql
-- Before: Clustered Index Scan (function on column prevents seek)
SELECT * FROM dbo.JobCostDetail
WHERE YEAR(PostDate) = 2025;

-- After: Index Seek (SARGable predicate)
SELECT * FROM dbo.JobCostDetail
WHERE PostDate >= '2025-01-01' AND PostDate < '2026-01-01';
```

### Pattern 3: Hash Match to Nested Loops

```sql
-- Before: Hash Match join on large result set
SELECT j.JobName, jc.Amount
FROM dbo.Job j
INNER JOIN dbo.JobCostDetail jc ON jc.JobID = j.JobID;

-- After: Filter early, get Nested Loops
SELECT j.JobName, jc.Amount
FROM dbo.Job j
INNER JOIN dbo.JobCostDetail jc ON jc.JobID = j.JobID
WHERE j.JobID = 4520;  -- small driving set now
```

---

## Gotchas and Pitfalls

1. **Cost percentages are estimates, not measured time.** A 1% operator can be the actual
   bottleneck if the row estimate is wildly wrong. Always compare estimated vs. actual rows.

2. **Actual plan row counts are per-execution.** If a Nested Loops inner side executes
   1,000 times, the "actual rows" shown is the total across all iterations, not per
   iteration.

3. **Parallel plans can hide problems.** A query might look fast at 8 threads but will
   destroy a server under concurrency. Check `MAXDOP` and thread distribution.

4. **Trivial plans skip optimization.** Very simple queries get a "trivial plan" — the
   optimizer doesn't even consider alternatives. Don't assume it was optimized.

5. **Plan caching means the first execution's parameters shape the plan.** This is
   parameter sniffing (covered in lesson 126). A plan that looks great for one parameter
   value can be disastrous for another.

6. **`SET STATISTICS IO` doesn't count worktable reads in tempdb clearly.** Watch for
   `Table 'Worktable'` entries — they indicate spills or spools.

7. **XML plans in Query Store can be truncated** for very complex queries. Use
   `sys.dm_exec_text_query_plan` with statement offsets for the full plan.

---

## Performance Considerations

- **Logical reads are the most reliable metric.** Reduce logical reads and you reduce CPU,
  memory, and I/O pressure simultaneously.
- **Physical reads matter on first-run or memory-constrained systems.** If your server
  can't cache the working set, physical I/O dominates.
- **Memory grants** for sorts and hashes come from a limited pool. Overestimated grants
  waste memory; underestimated grants cause tempdb spills.
- **Spills to tempdb** are the silent killer. A sort that spills is 10-100x slower than
  one that fits in memory. Look for the `SpillToTempDb` attribute in actual plans.
- **Operator times in actual plans (SQL Server 2016+)** show cumulative elapsed time.
  Use "actual time statistics" in SSMS to see per-operator breakdown.

---

## BNBuilders Context

### Scenario: Slow Job Cost Report

The monthly job-cost-to-budget comparison report runs against a 50M-row
`JobCostDetail` table joined to `Budget`, `Job`, and `CostCode`. Finance
complains it takes 4 minutes.

**Diagnostic steps:**

```sql
-- Step 1: Get actual plan + IO stats
SET STATISTICS IO ON;
SET STATISTICS TIME ON;
-- (run the report query with Actual Plan enabled)

-- Step 2: Look for the biggest logical read consumers
-- Example output:
-- Table 'JobCostDetail'. logical reads 148320
-- Table 'Budget'.        logical reads 89201
-- Table 'Job'.           logical reads 952

-- Step 3: In the plan, find the fattest arrow (most rows)
-- Likely: Clustered Index Scan on JobCostDetail
-- Reason: WHERE clause uses CONVERT(VARCHAR, PostDate, 101) — not SARGable

-- Step 4: Fix the predicate
-- Before:
SELECT * FROM dbo.JobCostDetail
WHERE CONVERT(VARCHAR, PostDate, 101) = '01/15/2025';
-- After:
SELECT * FROM dbo.JobCostDetail
WHERE PostDate >= '2025-01-15' AND PostDate < '2025-01-16';

-- Step 5: Add covering index for the report's column set
CREATE NONCLUSTERED INDEX IX_JobCost_Report
ON dbo.JobCostDetail (JobID, PostDate)
INCLUDE (CostCodeID, Amount, Phase, Category)
WHERE PostDate >= '2024-01-01';  -- filtered index for recent data
```

### CMiC / Oracle-to-SQL Server Migration

When migrating CMiC data from Oracle, execution plans help validate that:
- Indexes created on SQL Server match the Oracle originals in effectiveness
- NVarchar columns from Oracle don't cause implicit conversions against varchar joins
- Materialized views in Oracle map to indexed views with similar plan shapes

---

## Interview / Senior Dev Questions

1. **Q: What is the difference between an Index Seek and an Index Scan?**
   A: A Seek traverses the B-tree to find specific rows using the index key (O(log n)).
   A Scan reads the entire leaf level of the index. Seeks are preferred for selective
   queries; scans are acceptable when you need most of the table.

2. **Q: A query has a Key Lookup doing 500,000 executions. How do you fix it?**
   A: Create a covering index that INCLUDEs the columns fetched by the Key Lookup, or
   restructure the query to not require those columns.

3. **Q: Why might the optimizer choose a Scan over a Seek even when an index exists?**
   A: When estimated selectivity is low (the optimizer estimates most rows will match),
   a scan is cheaper than thousands of individual seeks. Also: implicit conversion on the
   seek column, outdated statistics, or a non-SARGable predicate.

4. **Q: What does a Sort operator with a warning triangle mean?**
   A: The sort ran out of its memory grant and spilled to tempdb. Causes include
   underestimated row counts. Fixes: update statistics, simplify the query, or add
   an index that provides pre-sorted data.

5. **Q: How do you find the most expensive queries on a server without execution plans?**
   A: Query `sys.dm_exec_query_stats` joined with `sys.dm_exec_sql_text` and
   `sys.dm_exec_query_plan`, ordered by `total_logical_reads` or `total_worker_time`.

---

## Quiz

### Question 1
You see a plan with: Index Seek -> Key Lookup -> Nested Loops, and the Key Lookup has
1.2 million actual executions. What should you do?

<details>
<summary>Answer</summary>

Create a **covering index** that includes the columns fetched by the Key Lookup in the
`INCLUDE` clause. This eliminates the need to go back to the clustered index for each
row. Alternatively, evaluate whether the query needs all those columns.
</details>

### Question 2
A WHERE clause uses `WHERE CAST(JobID AS VARCHAR) = @Filter`. The plan shows a Clustered
Index Scan on a 10M-row table. Why?

<details>
<summary>Answer</summary>

The `CAST` on the column makes the predicate **non-SARGable** — the optimizer cannot use
an index seek because the function is applied to every row. Fix by casting the parameter
instead: `WHERE JobID = CAST(@Filter AS INT)`, or better yet, pass the correct data type.
</details>

### Question 3
`SET STATISTICS IO` shows 0 physical reads but 85,000 logical reads. Is the query efficient?

<details>
<summary>Answer</summary>

Not necessarily. Zero physical reads means the data was already in the buffer pool (cache),
but 85,000 logical reads means SQL Server touched 85,000 8KB pages (~660 MB of data). This
is still a large amount of work and can cause CPU pressure. The query likely needs a better
index or predicate to reduce the working set.
</details>

### Question 4
You compare estimated rows (100) vs. actual rows (2.5 million) on a Hash Match operator.
What's the likely root cause, and what do you do?

<details>
<summary>Answer</summary>

The **statistics are stale or inaccurate**, causing a massive cardinality misestimate.
This leads to an undersized memory grant, which causes the Hash Match to spill to tempdb.
Fix by running `UPDATE STATISTICS` on the relevant tables, checking for ascending key
problems, or adding `OPTION (RECOMPILE)` if the data distribution varies per execution.
</details>

### Question 5
A plan shows Parallelism (Repartition Streams) with one thread processing 4M rows and
the other three threads processing under 1,000 rows each. What's happening?

<details>
<summary>Answer</summary>

This is **thread skew** — the data is not distributed evenly across parallel threads.
Common cause: a skewed distribution on the partitioning column. The query gets little
benefit from parallelism. Consider rewriting to avoid the skew, adding `OPTION (MAXDOP 1)`
if parallelism is counterproductive, or restructuring the join order so the parallel
distribution column is more evenly distributed.
</details>
