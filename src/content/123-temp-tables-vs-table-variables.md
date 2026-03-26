# Temp Tables vs Table Variables vs CTEs

*Chapter 9.4 — T-SQL for Data Engineers*

## Overview

Every Data Engineer eventually faces the question: "Should I use a temp table, a table variable, or a CTE here?" The answer depends on row count, scope, statistics, indexing needs, and what the optimizer can do with each option. Getting this wrong means either bloated TempDB usage for a trivial result set or catastrophic cardinality misestimation on a million-row intermediate result. This lesson gives you the definitive decision framework, grounded in the real-world ETL and reporting scenarios you hit at BNBuilders — staging Oracle extracts, breaking up complex transformations, and feeding BI pipelines.

## Core Concepts

### #Temp Tables (Local Temporary Tables)

Created with a `#` prefix. Stored physically in TempDB. Visible only to the session that created them. Dropped automatically when the session ends (or the scope that created them exits, for tables created inside a stored procedure).

```sql
-- Create and populate a temp table for staging
CREATE TABLE #JobCostStaging (
    JobCostID       INT NOT NULL,
    ProjectID       INT NOT NULL,
    CostCode        VARCHAR(20) NOT NULL,
    Amount          DECIMAL(18,2),
    PostingDate     DATE,
    SourceSystem    VARCHAR(10),
    LoadTimestamp   DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- Bulk insert from Oracle staging
INSERT INTO #JobCostStaging (JobCostID, ProjectID, CostCode, Amount, PostingDate, SourceSystem)
SELECT
    JobCostID, ProjectID, CostCode, Amount, PostingDate, 'CMiC'
FROM staging.CMiC_JobCost
WHERE ExtractDate = CAST(GETDATE() AS DATE);

-- Add an index for downstream joins
CREATE NONCLUSTERED INDEX IX_Staging_ProjectCost
    ON #JobCostStaging (ProjectID, CostCode);
```

Key properties:
- **Statistics**: SQL Server automatically creates and maintains statistics on temp tables, giving the optimizer accurate row counts.
- **Indexes**: You can create any type of index — clustered, nonclustered, filtered.
- **Constraints**: You can add PRIMARY KEY, UNIQUE, CHECK, and DEFAULT constraints.
- **Scope**: Visible within the creating session. If created inside a stored procedure, it is dropped when that procedure exits.
- **TempDB**: Physically stored in TempDB. Heavy usage can cause TempDB contention (PFS, GAM, SGAM page latch waits).
- **Parallelism**: Queries against temp tables can go parallel.
- **Transaction logging**: Changes are logged in the TempDB transaction log.

### ##Global Temp Tables

Created with a `##` prefix. Visible to all sessions. Dropped when the creating session ends AND no other session is referencing them.

```sql
-- Shared staging area for cross-session reporting (use sparingly)
CREATE TABLE ##DailyProjectSummary (
    ProjectID   INT,
    ReportDate  DATE,
    TotalSpend  DECIMAL(18,2)
);
```

Global temp tables are rarely appropriate. They create shared mutable state across sessions, which is a concurrency nightmare. Prefer regular tables in a staging schema.

### @Table Variables

Declared with `DECLARE @name TABLE (...)`. Stored in TempDB (contrary to the common myth that they live "in memory"). Do NOT have distribution statistics (until SQL Server 2019 with deferred compilation).

```sql
DECLARE @ProjectList TABLE (
    ProjectID   INT PRIMARY KEY,
    ProjectName NVARCHAR(200)
);

INSERT INTO @ProjectList
SELECT ProjectID, ProjectName
FROM dbo.Project
WHERE Region = 'Pacific Northwest'
  AND IsActive = 1;

-- Use in a join
SELECT
    pl.ProjectName,
    SUM(jc.Amount) AS TotalSpend
FROM @ProjectList AS pl
INNER JOIN dbo.JobCost AS jc ON jc.ProjectID = pl.ProjectID
GROUP BY pl.ProjectName;
```

Key properties:
- **Statistics**: No column-level statistics. The optimizer estimates 1 row (on versions before SQL Server 2019). This is the single biggest issue with table variables on large datasets.
- **SQL Server 2019+ table variable deferred compilation**: The optimizer defers compilation until first execution, so it knows the actual row count. This dramatically improves plans for table variables with many rows. Requires compatibility level 150+.
- **Indexes**: You can declare indexes inline (PRIMARY KEY, UNIQUE) but cannot create nonclustered indexes separately (until SQL Server 2014 added inline index syntax).
- **Scope**: The declaring batch only. Cannot be referenced across batches in a script.
- **Transaction behavior**: Table variable modifications are NOT rolled back by a ROLLBACK TRANSACTION. This is a critical difference.
- **Parallelism**: Queries against table variables historically could not go parallel. SQL Server 2019 relaxed this restriction somewhat.
- **Recompilation**: INSERT into a table variable does not trigger a recompile of subsequent queries referencing it. This means the optimizer may use stale cardinality estimates.

### Inline Index Syntax for Table Variables (SQL Server 2014+)

```sql
DECLARE @CostSummary TABLE (
    ProjectID   INT NOT NULL,
    CostCode    VARCHAR(20) NOT NULL,
    TotalAmount DECIMAL(18,2),
    INDEX IX_Project_Cost NONCLUSTERED (ProjectID, CostCode)
);
```

### CTEs (Quick Comparison)

Covered in detail in the CTE lesson. For this comparison:
- Not materialized — inlined by the optimizer.
- No statistics, no indexes, no physical storage.
- Scoped to a single statement.
- Best for readability and one-pass transformations.

### Head-to-Head Comparison

| Feature | #Temp Table | @Table Variable | CTE |
|---|---|---|---|
| Storage | TempDB (physical) | TempDB (physical) | Not materialized |
| Statistics | Yes (auto-created) | No (pre-2019); deferred (2019+) | N/A (uses base table) |
| Indexes | All types | Inline only (PK, UNIQUE, NCI) | None |
| Scope | Session / proc | Batch | Single statement |
| Row estimate (optimizer) | Accurate | 1 row (pre-2019) | Varies |
| Parallelism | Yes | Limited (pre-2019) | Yes |
| ROLLBACK behavior | Rolled back | NOT rolled back | N/A |
| Schema modification | ALTER TABLE OK | No ALTER | No |
| TempDB contention | Yes (heavy use) | Lighter | None |
| Best for | Large datasets, multi-step ETL | Small lookup lists (<1000 rows) | Readability, recursion |

## Code Examples

### ETL Staging Pipeline with Temp Tables

This is a realistic pattern for staging CMiC Oracle data into SQL Server at BNBuilders.

```sql
-- Step 1: Extract from Oracle via linked server into a temp table
SELECT
    jc.JOB_COST_ID      AS JobCostID,
    jc.PROJECT_ID        AS ProjectID,
    jc.COST_CODE         AS CostCode,
    jc.COST_TYPE         AS CostType,
    jc.AMOUNT            AS Amount,
    jc.POSTING_DATE      AS PostingDate,
    jc.VENDOR_ID         AS VendorID,
    jc.LAST_MODIFIED     AS SourceModifiedDate
INTO #RawExtract
FROM OPENQUERY(CMIC_ORACLE,
    'SELECT JOB_COST_ID, PROJECT_ID, COST_CODE, COST_TYPE,
            AMOUNT, POSTING_DATE, VENDOR_ID, LAST_MODIFIED
     FROM CMIC.JOB_COST
     WHERE LAST_MODIFIED >= TRUNC(SYSDATE) - 1') AS jc;

-- Step 2: Deduplicate (Oracle extract may have dupes from multi-table join)
SELECT *
INTO #Deduped
FROM (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY JobCostID
            ORDER BY SourceModifiedDate DESC
        ) AS rn
    FROM #RawExtract
) AS d
WHERE d.rn = 1;

CREATE CLUSTERED INDEX CIX_Deduped ON #Deduped (JobCostID);

-- Step 3: Data quality checks
SELECT
    'NULL ProjectID' AS Issue, COUNT(*) AS RowCount
FROM #Deduped WHERE ProjectID IS NULL
UNION ALL
SELECT
    'Negative Amount', COUNT(*)
FROM #Deduped WHERE Amount < 0
UNION ALL
SELECT
    'Future PostingDate', COUNT(*)
FROM #Deduped WHERE PostingDate > GETDATE();

-- Step 4: MERGE into production
MERGE dbo.JobCost AS tgt
USING #Deduped AS src ON tgt.JobCostID = src.JobCostID
WHEN MATCHED AND (
    tgt.Amount <> src.Amount
    OR tgt.PostingDate <> src.PostingDate
    OR tgt.CostCode <> src.CostCode
) THEN
    UPDATE SET
        tgt.Amount = src.Amount,
        tgt.PostingDate = src.PostingDate,
        tgt.CostCode = src.CostCode,
        tgt.CostType = src.CostType,
        tgt.VendorID = src.VendorID,
        tgt.LastModified = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (JobCostID, ProjectID, CostCode, CostType, Amount, PostingDate, VendorID, LastModified)
    VALUES (src.JobCostID, src.ProjectID, src.CostCode, src.CostType, src.Amount, src.PostingDate, src.VendorID, SYSUTCDATETIME());

-- Step 5: Clean up
DROP TABLE #RawExtract;
DROP TABLE #Deduped;
```

### Table Variable as a Parameter-Like Lookup List

```sql
-- Small lookup: active projects in a specific region
DECLARE @ActiveProjects TABLE (
    ProjectID INT PRIMARY KEY
);

INSERT INTO @ActiveProjects
SELECT ProjectID
FROM dbo.Project
WHERE Region = 'Pacific Northwest'
  AND IsActive = 1;
-- Typically < 50 rows for a regional filter

-- Use as a semi-join filter
SELECT
    jc.ProjectID,
    jc.CostCode,
    SUM(jc.Amount) AS TotalSpend
FROM dbo.JobCost AS jc
WHERE EXISTS (
    SELECT 1 FROM @ActiveProjects AS ap WHERE ap.ProjectID = jc.ProjectID
)
GROUP BY jc.ProjectID, jc.CostCode;
```

### When Table Variables Go Wrong

```sql
-- BAD: table variable with 500K rows, optimizer estimates 1 row
DECLARE @LargeResult TABLE (
    JobCostID INT,
    Amount DECIMAL(18,2)
);

INSERT INTO @LargeResult
SELECT JobCostID, Amount
FROM dbo.JobCost
WHERE PostingDate >= '2024-01-01';
-- 500,000 rows inserted

-- Optimizer estimates 1 row from @LargeResult, chooses nested loop join
-- against a 10M row table. Catastrophic performance.
SELECT lr.JobCostID, lr.Amount, v.VendorName
FROM @LargeResult AS lr
INNER JOIN dbo.Vendor AS v ON v.VendorID = lr.JobCostID; -- bad plan

-- FIX: Use a temp table instead
SELECT JobCostID, Amount
INTO #LargeResult
FROM dbo.JobCost
WHERE PostingDate >= '2024-01-01';

CREATE INDEX IX_LR ON #LargeResult (JobCostID);

SELECT lr.JobCostID, lr.Amount, v.VendorName
FROM #LargeResult AS lr
INNER JOIN dbo.Vendor AS v ON v.VendorID = lr.JobCostID; -- good plan
```

### OPTION (RECOMPILE) Workaround for Table Variables

```sql
-- If you must use a table variable but need accurate cardinality:
DECLARE @Result TABLE (ProjectID INT, Total DECIMAL(18,2));

INSERT INTO @Result
SELECT ProjectID, SUM(Amount)
FROM dbo.JobCost
GROUP BY ProjectID;

-- OPTION (RECOMPILE) forces the optimizer to peek at actual row count
SELECT r.ProjectID, r.Total, p.ProjectName
FROM @Result AS r
INNER JOIN dbo.Project AS p ON p.ProjectID = r.ProjectID
OPTION (RECOMPILE);
```

This works but adds compilation overhead per execution. For stored procedures called frequently, temp tables are better.

### Transaction Rollback Behavior Difference

```sql
-- Temp table: rolled back
CREATE TABLE #Demo (ID INT);
BEGIN TRAN;
    INSERT INTO #Demo VALUES (1);
ROLLBACK;
SELECT COUNT(*) FROM #Demo;  -- 0 rows (rolled back)

-- Table variable: NOT rolled back
DECLARE @Demo TABLE (ID INT);
BEGIN TRAN;
    INSERT INTO @Demo VALUES (1);
ROLLBACK;
SELECT COUNT(*) FROM @Demo;  -- 1 row (still there!)
```

This behavior makes table variables useful for audit/logging within a transaction that might fail — but it can also be a nasty surprise if you do not expect it.

## Common Patterns

### Temp table for parameter sniffing mitigation

```sql
-- Instead of passing a parameter that causes plan caching issues,
-- dump the filtered set into a temp table
CREATE PROCEDURE dbo.usp_ProjectCostReport
    @Region VARCHAR(50)
AS
BEGIN
    SELECT ProjectID
    INTO #RegionProjects
    FROM dbo.Project
    WHERE Region = @Region AND IsActive = 1;

    CREATE INDEX IX_RP ON #RegionProjects (ProjectID);

    -- Now the optimizer optimizes for the actual row count in #RegionProjects
    SELECT
        rp.ProjectID,
        cc.CostCode,
        SUM(jc.Amount) AS TotalSpend
    FROM #RegionProjects AS rp
    INNER JOIN dbo.JobCost AS jc ON jc.ProjectID = rp.ProjectID
    INNER JOIN dbo.CostCode AS cc ON cc.CostCode = jc.CostCode
    GROUP BY rp.ProjectID, cc.CostCode
    ORDER BY rp.ProjectID, cc.CostCode;

    DROP TABLE #RegionProjects;
END;
```

### SELECT INTO for quick temp table creation

```sql
-- SELECT INTO is faster than CREATE TABLE + INSERT because it is minimally logged
SELECT
    ProjectID,
    CostCode,
    SUM(Amount) AS TotalSpend,
    COUNT(*) AS TransactionCount
INTO #CostSummary
FROM dbo.JobCost
WHERE PostingDate >= '2025-01-01'
GROUP BY ProjectID, CostCode;
```

### Temp table as a "checkpoint" in long ETL procs

```sql
-- Checkpoint pattern: verify intermediate results before proceeding
SELECT *
INTO #Step1_Extracted
FROM ...;

-- Log row count
INSERT INTO dbo.ETLLog (StepName, RowCount, Timestamp)
VALUES ('Extract', (SELECT COUNT(*) FROM #Step1_Extracted), SYSUTCDATETIME());

-- Validate before proceeding
IF (SELECT COUNT(*) FROM #Step1_Extracted) = 0
BEGIN
    RAISERROR('No rows extracted. Aborting pipeline.', 16, 1);
    RETURN;
END;

-- Continue with transformation
SELECT *
INTO #Step2_Transformed
FROM #Step1_Extracted ...;
```

## Gotchas and Pitfalls

1. **Table variable cardinality = 1 (pre-2019)** — This is the most common performance trap. On SQL Server 2017 and earlier, the optimizer always estimates 1 row for table variables, regardless of actual content. This leads to nested loop joins against large tables, scanning millions of rows. Use temp tables for anything over a few hundred rows.

2. **Table variables are NOT in memory** — Common misconception. They are stored in TempDB, just like temp tables. The difference is statistics and optimization behavior, not storage location.

3. **TempDB contention** — Heavy temp table usage across many concurrent sessions can cause latch contention on TempDB allocation pages. Mitigations: enable TempDB with multiple data files (1 per CPU core, up to 8), enable trace flag 1118 (full extents), and use SQL Server 2016+ which has improved TempDB allocation.

4. **Temp table caching in stored procedures** — SQL Server caches temp table definitions inside stored procedures. If you ALTER a temp table's schema between proc executions, you may hit cached schema issues. Keep temp table structures consistent.

5. **Scope leaking** — A temp table created in a parent procedure is visible to child procedures. This can cause unexpected behavior.

```sql
-- Parent proc
CREATE PROCEDURE dbo.usp_Parent AS
BEGIN
    CREATE TABLE #Shared (ID INT);
    INSERT INTO #Shared VALUES (1);
    EXEC dbo.usp_Child;  -- can see #Shared!
END;

-- Child proc
CREATE PROCEDURE dbo.usp_Child AS
BEGIN
    SELECT * FROM #Shared;  -- works, but is it intentional?
END;
```

6. **TRUNCATE TABLE on table variables** — You cannot TRUNCATE a table variable. Use `DELETE FROM @var` instead (which is logged row-by-row). This matters for large table variables in loops.

## Performance Considerations

### Row Count Thresholds (Practical Guidance)

| Row Count | Recommended Approach | Why |
|---|---|---|
| 1 - 100 | Table variable or CTE | Small enough that cardinality estimation does not matter. Table variable avoids TempDB overhead of creating stats. |
| 100 - 10,000 | Table variable (with 2019+ deferred compilation) or temp table | If on SQL Server 2019+ at compat 150, table variables work well. Otherwise, temp table. |
| 10,000 - 1,000,000 | Temp table with index | Statistics are essential for correct join strategies. Add indexes for join columns. |
| 1,000,000+ | Temp table with clustered index | Definitely need statistics and indexes. Consider SELECT INTO for minimal logging. |

### Minimally Logged Operations

`SELECT INTO` and `INSERT ... SELECT` into temp tables can be minimally logged under the right conditions (simple or bulk-logged recovery model for TempDB, which is the default). This makes them significantly faster than row-by-row inserts.

### Memory Grants

Temp tables with statistics help the optimizer request accurate memory grants for sort and hash operations. Table variables with 1-row estimates get tiny memory grants, causing spills to disk. This is a hidden cost that does not show up as obvious slow queries but degrades throughput under load.

### ADO.NET Considerations

When calling stored procedures from C# ADO.NET code, temp tables inside the procedure work exactly as expected. Table-valued parameters (TVPs) are a better alternative to table variables when passing data from C# to SQL Server.

```csharp
// C# ADO.NET: Using a Table-Valued Parameter instead of inserting into a table variable
using var connection = new SqlConnection(connectionString);
using var command = new SqlCommand("dbo.usp_ProcessProjects", connection);
command.CommandType = CommandType.StoredProcedure;

var table = new DataTable();
table.Columns.Add("ProjectID", typeof(int));
foreach (var id in projectIds)
    table.Rows.Add(id);

var param = command.Parameters.AddWithValue("@ProjectIDs", table);
param.SqlDbType = SqlDbType.Structured;
param.TypeName = "dbo.IntList";  // must match a CREATE TYPE on the server

await connection.OpenAsync();
using var reader = await command.ExecuteReaderAsync();
```

```sql
-- Server side: Table-Valued Parameter type and procedure
CREATE TYPE dbo.IntList AS TABLE (ID INT NOT NULL PRIMARY KEY);
GO

CREATE PROCEDURE dbo.usp_ProcessProjects
    @ProjectIDs dbo.IntList READONLY
AS
BEGIN
    SELECT jc.ProjectID, SUM(jc.Amount) AS TotalSpend
    FROM dbo.JobCost AS jc
    INNER JOIN @ProjectIDs AS p ON p.ID = jc.ProjectID
    GROUP BY jc.ProjectID;
END;
```

## BNBuilders Context

At BNBuilders, temp tables and table variables appear in these specific scenarios:

- **Oracle-to-SQL Server ETL** — The nightly CMiC extract lands in staging tables, then gets cleaned and transformed through a chain of temp tables. Each temp table is a pipeline stage: `#RawExtract -> #Deduped -> #Validated -> #Conformed -> INSERT INTO production`. This pattern gives you checkpoint visibility and allows data quality checks between stages.

- **Report stored procedures** — Power BI calls stored procedures that build complex cost reports. These procs use temp tables to stage intermediate aggregations (cost by project, budget by project, committed by project) and then join them together. Using temp tables with statistics ensures the optimizer picks good join plans for the final multi-table join.

- **Batch processing** — Large Oracle tables (10M+ rows in JOB_COST) are migrated in chunks. A temp table holds the batch boundaries (start/end IDs), and a WHILE loop processes each chunk.

- **Parameter tables** — Small lookup sets (active projects for a region, cost codes for a division) use table variables because the row count is low and the scope is a single batch.

- **Reconciliation** — After migration, FULL OUTER JOINs between Oracle staging (#OracleData) and SQL Server production compare row counts, sums, and key columns. Temp tables make these multi-step comparisons readable and performant.

```sql
-- BNBuilders reconciliation pattern after Oracle migration
SELECT jc.JobCostID, jc.Amount, jc.PostingDate
INTO #SQLServerData
FROM dbo.JobCost AS jc
WHERE jc.ProjectID = 1001;

SELECT jc.JOB_COST_ID AS JobCostID, jc.AMOUNT AS Amount, jc.POSTING_DATE AS PostingDate
INTO #OracleData
FROM OPENQUERY(CMIC_ORACLE,
    'SELECT JOB_COST_ID, AMOUNT, POSTING_DATE
     FROM CMIC.JOB_COST WHERE PROJECT_ID = 1001') AS jc;

CREATE INDEX IX1 ON #SQLServerData (JobCostID);
CREATE INDEX IX2 ON #OracleData (JobCostID);

-- Compare
SELECT
    COALESCE(s.JobCostID, o.JobCostID) AS JobCostID,
    s.Amount AS SQL_Amount,
    o.Amount AS Oracle_Amount,
    CASE
        WHEN s.JobCostID IS NULL THEN 'Missing in SQL Server'
        WHEN o.JobCostID IS NULL THEN 'Missing in Oracle'
        WHEN s.Amount <> o.Amount THEN 'Amount Mismatch'
        ELSE 'Match'
    END AS Status
FROM #SQLServerData AS s
FULL OUTER JOIN #OracleData AS o ON o.JobCostID = s.JobCostID
WHERE s.JobCostID IS NULL
   OR o.JobCostID IS NULL
   OR s.Amount <> o.Amount;
```

## Interview / Senior Dev Questions

**Q1: A stored procedure uses a table variable with 200K rows and performs poorly. The same query with a temp table runs 50x faster. Explain why.**

The table variable has no column-level statistics, so the optimizer estimates 1 row. It chooses a nested loop join against a large table, scanning millions of rows per loop iteration. The temp table has auto-created statistics showing 200K rows, so the optimizer correctly chooses a hash join or merge join. The fix is to either switch to a temp table, use `OPTION (RECOMPILE)` so the optimizer can peek at the actual row count, or upgrade to SQL Server 2019+ with compatibility level 150 for table variable deferred compilation.

**Q2: When would you intentionally choose a table variable over a temp table?**

Three scenarios: (1) Very small datasets (under a few hundred rows) where the overhead of creating statistics is unnecessary. (2) When you need data to survive a ROLLBACK — table variable modifications are not affected by transaction rollback, which is useful for audit logging. (3) Inside a function — temp tables are not allowed in user-defined functions, but table variables are.

**Q3: Your ETL process creates 50 temp tables across multiple stored procedures and you see TempDB contention. What do you do?**

First, ensure TempDB has multiple data files (one per logical CPU core, up to 8) with equal sizes and autogrowth. Second, enable trace flag 1118 (full extent allocation) on pre-2016 instances, or upgrade to 2016+ where this is the default. Third, review the ETL to consolidate temp tables — can some steps be combined? Can temp tables be dropped earlier? Fourth, consider using `SELECT INTO` over `CREATE TABLE + INSERT` for minimal logging. Fifth, monitor with `sys.dm_os_wait_stats` for PAGELATCH waits on TempDB allocation pages.

**Q4: Explain the difference between `SELECT INTO #temp` and `CREATE TABLE #temp; INSERT INTO #temp`.**

`SELECT INTO` creates the table and inserts in one operation. It is minimally logged in TempDB (which uses simple recovery by default), making it faster for large datasets. It infers column definitions from the source query. `CREATE TABLE + INSERT` gives you control over column types, constraints, and indexes before data arrives. Use `SELECT INTO` for speed; use explicit `CREATE TABLE` when you need specific data types or pre-created indexes (e.g., a clustered index to control insert order).

## Quiz

**1. Are table variables stored in memory or in TempDB?**

<details>
<summary>Show Answer</summary>

TempDB. The myth that table variables are "in memory" is false. Both temp tables and table variables are physically stored in TempDB. The key differences are statistics (temp tables have them, table variables do not pre-2019), indexing capabilities, scope rules, and transaction rollback behavior.
</details>

**2. You INSERT 500,000 rows into a table variable, then ROLLBACK the transaction. How many rows remain in the table variable?**

<details>
<summary>Show Answer</summary>

500,000 rows. Table variable modifications are NOT affected by ROLLBACK. This is by design — table variables are not bound to the transaction context the same way temp tables are. A temp table INSERT would be rolled back to 0 rows.
</details>

**3. On SQL Server 2017 (pre-2019), how many rows does the optimizer estimate for a table variable containing 100,000 rows?**

<details>
<summary>Show Answer</summary>

1 row. The optimizer always estimates 1 row for table variables on SQL Server 2017 and earlier, regardless of actual content. This leads to poor join strategy choices (nested loops instead of hash joins) and undersized memory grants. SQL Server 2019 introduced table variable deferred compilation (at compatibility level 150+) which defers optimization until first execution, allowing the optimizer to see the actual row count.
</details>

**4. Name two scenarios where a temp table is strictly better than a CTE.**

<details>
<summary>Show Answer</summary>

(1) When the intermediate result is referenced multiple times — a CTE is re-evaluated on each reference, while a temp table is materialized once. (2) When the intermediate result is large and downstream queries need accurate statistics for join optimization — a temp table has auto-created statistics, while a CTE relies on base table statistics which may not represent the filtered/aggregated intermediate result. A bonus third scenario: when you need to add an index on the intermediate result for performant downstream joins.
</details>

**5. What is a Table-Valued Parameter (TVP) and when would you use one instead of a table variable inside a stored procedure?**

<details>
<summary>Show Answer</summary>

A TVP is a user-defined table type that can be passed as a parameter to a stored procedure. You use it when the calling application (e.g., C# ADO.NET) needs to send a set of values to the procedure — for example, a list of ProjectIDs to filter on. Without a TVP, the alternative is passing a comma-separated string and parsing it, or making multiple procedure calls. TVPs are read-only inside the procedure, have statistics (as of SQL Server 2019), and integrate cleanly with `SqlDbType.Structured` in ADO.NET. They are the right tool when the data originates from the application layer.
</details>
