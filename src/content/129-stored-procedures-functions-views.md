# Stored Procedures, Functions, and Views

*Chapter 9.10 — T-SQL for Data Engineers*

## Overview

Stored procedures, functions, and views are the building blocks of a well-organized SQL
Server data platform. For data engineers, they form the backbone of ETL logic, reporting
layers, and data access APIs.

This lesson covers:

- Stored procedures: creation, parameters, error handling, best practices
- Functions: scalar vs. inline TVF vs. multi-statement TVF and their massive performance
  differences
- Views: standard views, indexed (materialized) views, SCHEMABINDING, WITH CHECK OPTION
- BNBuilders: ETL procs for nightly loads, views for BI reporting

---

## Core Concepts

### Stored Procedures

A stored procedure is a named, precompiled batch of T-SQL. It accepts parameters,
performs operations, and optionally returns result sets, output parameters, and a
return code.

```sql
CREATE PROCEDURE dbo.ETL_LoadJobCosts
    @StartDate  DATE,
    @EndDate    DATE,
    @RowsLoaded INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;  -- suppress "X rows affected" messages (critical for performance)

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Step 1: Merge staging data into fact table
        MERGE dbo.JobCostFact AS tgt
        USING (
            SELECT
                dj.JobKey,
                dc.CostCodeKey,
                dd.DateKey,
                s.Amount,
                s.TransactionID
            FROM staging.JobCostDetail s
            INNER JOIN dbo.DimJob dj ON dj.JobID = s.JobID
            INNER JOIN dbo.DimCostCode dc ON dc.CostCodeID = s.CostCodeID
            INNER JOIN dbo.DimDate dd ON dd.FullDate = s.PostDate
            WHERE s.PostDate BETWEEN @StartDate AND @EndDate
        ) AS src
        ON tgt.TransactionID = src.TransactionID
        WHEN MATCHED THEN
            UPDATE SET tgt.Amount = src.Amount
        WHEN NOT MATCHED THEN
            INSERT (JobKey, CostCodeKey, DateKey, Amount, TransactionID)
            VALUES (src.JobKey, src.CostCodeKey, src.DateKey, src.Amount, src.TransactionID);

        SET @RowsLoaded = @@ROWCOUNT;

        -- Step 2: Update watermark
        UPDATE dbo.ETLWatermark
        SET LastLoadDate = @EndDate, RowsProcessed = @RowsLoaded
        WHERE TableName = 'JobCostFact';

        -- Step 3: Log success
        INSERT INTO dbo.ETLLog (ProcName, StartDate, EndDate, RowsLoaded, Status)
        VALUES ('ETL_LoadJobCosts', @StartDate, @EndDate, @RowsLoaded, 'SUCCESS');

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Log failure
        INSERT INTO dbo.ETLLog (ProcName, StartDate, EndDate, RowsLoaded, Status, ErrorMessage)
        VALUES ('ETL_LoadJobCosts', @StartDate, @EndDate, 0, 'FAILED', ERROR_MESSAGE());

        THROW;  -- re-raise to caller
    END CATCH;

    RETURN 0;  -- return code: 0 = success
END;
```

#### Key Stored Procedure Features

```sql
-- ALTER preserves permissions (DROP + CREATE loses them)
ALTER PROCEDURE dbo.ETL_LoadJobCosts ...;

-- Default parameter values
CREATE PROCEDURE dbo.GetRecentJobCosts
    @DaysBack INT = 30,
    @MinAmount DECIMAL(18,2) = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT JobID, CostCodeID, Amount, PostDate
    FROM dbo.JobCostDetail
    WHERE PostDate >= DATEADD(DAY, -@DaysBack, GETDATE())
      AND Amount >= @MinAmount;
END;

-- Return codes + output parameters
DECLARE @ReturnCode INT, @Rows INT;
EXEC @ReturnCode = dbo.ETL_LoadJobCosts
    @StartDate = '2025-01-01', @EndDate = '2025-01-31', @RowsLoaded = @Rows OUTPUT;
```

#### SET NOCOUNT ON

Without `SET NOCOUNT ON`, every INSERT/UPDATE/DELETE sends a "X rows affected" message
back to the client. In a procedure with dozens of statements, this creates thousands of
network roundtrips and dramatically slows down execution, especially over WAN connections.

**Always include SET NOCOUNT ON as the first line of every stored procedure.**

---

### Functions

SQL Server has three types of user-defined functions. Their performance characteristics
are dramatically different.

#### Scalar Functions

```sql
-- Scalar function: returns a single value
CREATE FUNCTION dbo.fn_GetJobStatus(@JobID INT)
RETURNS VARCHAR(20)
AS
BEGIN
    DECLARE @Status VARCHAR(20);
    SELECT @Status = Status FROM dbo.Job WHERE JobID = @JobID;
    RETURN @Status;
END;

-- Usage (WARNING: very slow on large result sets)
SELECT JobID, Amount, dbo.fn_GetJobStatus(JobID) AS Status
FROM dbo.JobCostDetail;
-- This calls the function ONCE PER ROW — on 1M rows, it runs the inner query 1M times
```

**Scalar function problems:**
- Executes **once per row** in the result set
- **Cannot be parallelized** — forces serial plan
- **Cannot be inlined** by the optimizer (before SQL Server 2019)
- Hides I/O from execution plans — looks like a cheap Compute Scalar

**SQL Server 2019+ scalar inlining** can fix this for simple functions (no variables,
no TRY/CATCH, no loops). Check with:

```sql
SELECT OBJECT_NAME(object_id), is_inlineable
FROM sys.sql_modules
WHERE object_id = OBJECT_ID('dbo.fn_GetJobStatus');
```

#### Inline Table-Valued Functions (iTVF)

```sql
-- Inline TVF: a parameterized view. Single SELECT, no BEGIN/END.
CREATE FUNCTION dbo.fn_JobCostsByDateRange(@StartDate DATE, @EndDate DATE)
RETURNS TABLE
AS
RETURN (
    SELECT jc.JobID, j.JobName, jc.CostCodeID, jc.Amount, jc.PostDate
    FROM dbo.JobCostDetail jc
    INNER JOIN dbo.Job j ON j.JobID = jc.JobID
    WHERE jc.PostDate BETWEEN @StartDate AND @EndDate
);

-- Optimizer expands it inline (like a macro) — full parallelism and index usage
SELECT JobID, JobName, SUM(Amount) AS Total
FROM dbo.fn_JobCostsByDateRange('2025-01-01', '2025-06-30')
GROUP BY JobID, JobName;
```

**Inline TVF advantages:**
- Optimizer **inlines** the function body into the outer query
- Full parallelism, index usage, and join optimization
- Essentially a parameterized view — same performance as writing the SQL directly
- **This is the preferred function type for data engineers**

#### Multi-Statement Table-Valued Functions (msTVF)

Multi-statement TVFs declare a table variable, populate it with procedural logic, and
return it. **Avoid them** — the optimizer estimates 1 row (pre-2017), cannot inline them,
and the table variable has no statistics. Use inline TVFs instead.

### Function Comparison

| Feature | Scalar | Inline TVF | Multi-Statement TVF |
|---|---|---|---|
| Returns | Single value | Result set | Result set |
| Inlined by optimizer | 2019+ (simple only) | Always | Never |
| Parallelism | Blocked (pre-2019) | Full | Blocked |
| Statistics | N/A | Full table stats | Estimated 1 row (pre-2017) |
| Performance | Poor | Excellent | Poor |
| Use for | Simple expressions only | Parameterized views | Last resort |

---

### Views

A view is a named, stored SELECT statement. It provides abstraction, security, and
reusability.

```sql
-- Basic view
CREATE VIEW dbo.vw_JobCostSummary
AS
SELECT
    j.JobID,
    j.JobName,
    j.ProjectManager,
    cc.CostCodeDesc,
    SUM(jc.Amount) AS TotalCost,
    COUNT(*) AS TransactionCount,
    MAX(jc.PostDate) AS LastPostDate
FROM dbo.JobCostDetail jc
INNER JOIN dbo.Job j ON j.JobID = jc.JobID
INNER JOIN dbo.CostCode cc ON cc.CostCodeID = jc.CostCodeID
GROUP BY j.JobID, j.JobName, j.ProjectManager, cc.CostCodeDesc;

-- Usage
SELECT * FROM dbo.vw_JobCostSummary WHERE JobID = 4520;
```

#### SCHEMABINDING

Prevents underlying tables from being altered or dropped in ways that would break the
view.

```sql
CREATE VIEW dbo.vw_ActiveJobs
WITH SCHEMABINDING  -- ties the view to exact table schemas
AS
SELECT
    j.JobID,
    j.JobName,
    j.Status,
    j.StartDate
FROM dbo.Job j          -- must use two-part names (schema.table)
WHERE j.Status = 'Active';

-- Now this will fail:
-- ALTER TABLE dbo.Job DROP COLUMN JobName;
-- Error: Cannot ALTER because view 'vw_ActiveJobs' depends on it
```

#### Indexed (Materialized) Views

An indexed view physically stores the result set. SQL Server maintains it as underlying
data changes. Requires SCHEMABINDING.

```sql
CREATE VIEW dbo.vw_JobCostAggregate WITH SCHEMABINDING AS
SELECT jc.JobID, jc.CostCodeID, SUM(jc.Amount) AS TotalAmount,
    COUNT_BIG(*) AS RowCount  -- required for indexed views with aggregates
FROM dbo.JobCostDetail jc
GROUP BY jc.JobID, jc.CostCodeID;

-- Materialize with unique clustered index
CREATE UNIQUE CLUSTERED INDEX IX_vw_JobCostAggregate
ON dbo.vw_JobCostAggregate (JobID, CostCodeID);

-- Standard Edition: must use NOEXPAND hint (Enterprise auto-matches)
SELECT JobID, TotalAmount
FROM dbo.vw_JobCostAggregate WITH (NOEXPAND) WHERE JobID = 4520;
```

**Indexed view restrictions:** Must use SCHEMABINDING, two-part names, `COUNT_BIG(*)`.
Cannot use OUTER JOIN, subqueries, UNION, TOP, ORDER BY, DISTINCT, or reference other
views. Every base table DML also updates the view (adds write overhead).

#### WITH CHECK OPTION

Prevents INSERT/UPDATE through a view if the resulting row would not be visible in the
view. Example: a view filtered to `Status = 'Active'` with CHECK OPTION would reject
an UPDATE that sets `Status = 'Complete'` (the row would disappear from the view).

---

## Code Examples

### Calling Stored Procedures from C#

```csharp
using Microsoft.Data.SqlClient;
using System.Data;

public static async Task<int> RunEtlLoadAsync(
    string connectionString, DateTime startDate, DateTime endDate)
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();
    await using var cmd = new SqlCommand("dbo.ETL_LoadJobCosts", conn)
    {
        CommandType = CommandType.StoredProcedure,
        CommandTimeout = 600  // 10-minute timeout for ETL
    };
    cmd.Parameters.AddWithValue("@StartDate", startDate);
    cmd.Parameters.AddWithValue("@EndDate", endDate);

    var rowsLoaded = new SqlParameter("@RowsLoaded", SqlDbType.Int)
        { Direction = ParameterDirection.Output };
    cmd.Parameters.Add(rowsLoaded);

    await cmd.ExecuteNonQueryAsync();
    return (int)rowsLoaded.Value;
}
```

### Reporting View Layer

```sql
-- BI reporting views: thin abstraction over the star schema
CREATE VIEW dbo.vw_BI_JobCostDetail WITH SCHEMABINDING AS
SELECT f.FactID, dj.JobID, dj.JobName, dj.ProjectManager, dj.Region,
    dc.CostCodeID, dc.CostCodeDesc, dc.Category, dc.Phase,
    dd.FullDate AS PostDate, dd.FiscalYear, dd.FiscalMonth, f.Amount
FROM dbo.JobCostFact f
INNER JOIN dbo.DimJob dj ON dj.JobKey = f.JobKey
INNER JOIN dbo.DimCostCode dc ON dc.CostCodeKey = f.CostCodeKey
INNER JOIN dbo.DimDate dd ON dd.DateKey = f.DateKey;
-- Similar views: vw_BI_BudgetVsActual, vw_BI_EquipmentUtilization
```

---

## Common Patterns

### Pattern 1: Inline TVF as a Reusable Filter

```sql
-- Reusable date-filtered function used by multiple reports
CREATE FUNCTION dbo.fn_JobCostsInPeriod(
    @FiscalYear INT,
    @FiscalMonth INT
)
RETURNS TABLE
AS
RETURN (
    SELECT f.*, dd.FullDate, dd.FiscalYear, dd.FiscalMonth
    FROM dbo.JobCostFact f
    INNER JOIN dbo.DimDate dd ON dd.DateKey = f.DateKey
    WHERE dd.FiscalYear = @FiscalYear
      AND dd.FiscalMonth = @FiscalMonth
);

-- Used by multiple reports — logic defined once
SELECT JobKey, SUM(Amount) FROM dbo.fn_JobCostsInPeriod(2025, 6) GROUP BY JobKey;
SELECT CostCodeKey, COUNT(*) FROM dbo.fn_JobCostsInPeriod(2025, 6) GROUP BY CostCodeKey;
```

---

## Gotchas and Pitfalls

1. **Scalar UDFs are performance killers.** They execute per-row, prevent parallelism,
   and hide their cost from execution plans. Replace with inline TVFs or CASE expressions
   whenever possible.

2. **Multi-statement TVFs estimate 1 row** (pre-2017) or 100 rows (2017+ with interleaved
   execution). This causes terrible downstream join plans. Prefer inline TVFs.

3. **MERGE has known bugs** in older SQL Server versions (including missing rows and
   incorrect updates). Always include a terminating semicolon and test thoroughly.
   Consider separate INSERT/UPDATE statements as a safer alternative.

4. **Views are not materialized by default.** `SELECT * FROM vw_BigView` runs the
   full underlying query every time. Only indexed views are materialized.

5. **Indexed views add write overhead.** Every INSERT/UPDATE/DELETE on the base tables
   must also update the indexed view. Don't create indexed views on tables with heavy
   write traffic unless the read benefit outweighs the write cost.

6. **ALTER PROCEDURE resets permissions** if you DROP and re-CREATE. Use ALTER instead
   to preserve granted permissions.

7. **SET NOCOUNT ON is not just cosmetic.** Without it, some ORMs and drivers (including
   older ADO.NET) misinterpret the row-count messages as result sets, causing errors.

8. **Function determinism matters for indexed views.** Indexed views cannot reference
   non-deterministic functions like `GETDATE()`, `NEWID()`, or user-defined functions
   that are not marked as deterministic.

---

## Performance Considerations

- **Inline TVFs are free** from a performance standpoint — the optimizer inlines them
  into the outer query as if you wrote the SQL directly.
- **Scalar functions on SQL Server 2019+** can be automatically inlined. Check
  `sys.sql_modules.is_inlineable` and ensure your compat level is 150+.
- **Indexed views** shine for frequently-read aggregations on slowly-changing data (e.g.,
  job cost summaries queried all day but updated nightly by ETL).
- **sp_recompile** forces a stored procedure to recompile on next execution. Use after
  schema changes or major data loads:
  ```sql
  EXEC sp_recompile 'dbo.ETL_LoadJobCosts';
  ```
- **Plan caching for procedures** uses the first execution's parameters (parameter
  sniffing — see lesson 126). For ETL procs with varying data volumes, add
  `OPTION (RECOMPILE)` on the critical statements.
- **WITH RECOMPILE on the procedure** forces full recompilation every time. Prefer
  `OPTION (RECOMPILE)` on individual statements instead.

---

## BNBuilders Context

### ETL Stored Procedures for Nightly Loads

BNBuilders' DW is loaded nightly by a chain of stored procedures via SQL Server Agent:
`ETL_NightlyOrchestrator` calls `ETL_LoadDimJob` (SCD Type 2), `ETL_LoadDimCostCode`,
`ETL_LoadDimEquipment`, `ETL_LoadJobCosts` (fact load from CMiC staging), and
`ETL_RefreshAggregates`. Each proc follows the pattern: SET NOCOUNT ON, TRY/CATCH,
explicit transactions, logging, and output parameters for row counts.

### Views as a BI Contract

Power BI connects to views (`vw_BI_JobCostDetail`, `vw_BI_BudgetVsActual`, etc.) that
abstract the star schema. The data team can refactor underlying tables without breaking
reports, as long as the view signatures remain stable.

### Oracle/CMiC Migration Notes

- Oracle OUT params -> T-SQL OUTPUT params
- Oracle `SYS_REFCURSOR` -> T-SQL result sets
- Oracle pipelined functions -> T-SQL inline TVFs
- Oracle materialized views -> T-SQL indexed views (more restrictions)

---

## Interview / Senior Dev Questions

1. **Q: What is the difference between a scalar function, an inline TVF, and a multi-
   statement TVF? When would you use each?**
   A: Scalar returns one value per call and executes per-row (slow). Inline TVF is a
   parameterized view — the optimizer inlines it (fast). Multi-statement TVF populates a
   table variable and returns it (slow, bad estimates). Use inline TVFs for parameterized
   reusable queries. Use scalar only for simple expressions on 2019+. Avoid multi-statement
   TVFs unless you need procedural logic.

2. **Q: What does SCHEMABINDING do and why is it required for indexed views?**
   A: SCHEMABINDING prevents ALTER/DROP on referenced tables that would break the view.
   It's required for indexed views because SQL Server physically stores the view's data
   and must guarantee the underlying schema doesn't change unexpectedly.

3. **Q: Why should every stored procedure start with SET NOCOUNT ON?**
   A: Without it, every DML statement sends a "rows affected" message to the client.
   This adds network traffic, can confuse ORMs that interpret these messages as result
   sets, and can measurably slow down procedures with many statements.

4. **Q: A scalar function runs fine for 100 rows but takes 10 minutes on 1 million rows.
   Why?**
   A: Scalar functions execute **once per row**. For 1M rows, the function's internal
   query runs 1M times. Additionally, scalar functions prevent plan parallelism. The fix
   is to replace it with an inline TVF and use CROSS APPLY or rewrite the logic as a
   JOIN or CASE expression.

5. **Q: When should you use an indexed view vs. a regular view?**
   A: Indexed views are best for frequently-queried aggregations on tables with relatively
   low write volume. The trade-off is increased write overhead (every base table change
   updates the view). Use regular views for simple abstraction layers with no performance
   impact.

---

## Quiz

### Question 1
A developer creates a scalar function `dbo.fn_GetCostCodeDesc(@CostCodeID VARCHAR(20))`
and uses it in a SELECT that returns 500,000 rows. The query takes 3 minutes. If they
rewrite the function as a JOIN, it takes 2 seconds. Why?

<details>
<summary>Answer</summary>

The scalar function executes **once per row** — 500,000 separate lookups to the CostCode
table. Each invocation is a separate query execution with its own overhead. The function
also prevents the query from using parallelism. A JOIN processes all 500,000 lookups in a
single, set-based operation that can use indexes efficiently and run in parallel.
</details>

### Question 2
You create an indexed view on `dbo.JobCostDetail` with a SUM aggregate. After enabling it,
the nightly ETL that inserts 500K rows into `JobCostDetail` takes twice as long. Why?

<details>
<summary>Answer</summary>

Every INSERT into the base table `JobCostDetail` must also update the indexed view's
materialized aggregation. For 500K inserts, SQL Server performs 500K incremental updates to
the view's clustered index. The view's maintenance overhead doubles the write time. Consider
whether the read benefit justifies the write cost, or explore alternative approaches like
pre-computed aggregate tables refreshed during ETL.
</details>

### Question 3
You use `DROP PROCEDURE` followed by `CREATE PROCEDURE` to update a stored procedure.
A developer reports they lost EXECUTE permission on the procedure. What happened?

<details>
<summary>Answer</summary>

`DROP PROCEDURE` removes the object and all its associated permissions. `CREATE PROCEDURE`
creates a new object with no permissions granted. The fix is to use `ALTER PROCEDURE` (or
`CREATE OR ALTER PROCEDURE` on SQL Server 2016 SP1+) instead, which modifies the procedure
in place and **preserves all existing permissions**.
</details>

### Question 4
An inline TVF and a multi-statement TVF return the same data. The inline version completes
in 200ms; the multi-statement version takes 15 seconds. Both have the same underlying query.
What explains the difference?

<details>
<summary>Answer</summary>

The **inline TVF** is expanded by the optimizer directly into the calling query — it
benefits from full optimization, index selection, and parallelism. The **multi-statement
TVF** is a black box: the optimizer (pre-2017) estimates it returns 1 row, causing
terrible join strategies downstream. The table variable it uses has no statistics and no
parallelism. The result is orders of magnitude slower for the same logical operation.
</details>

### Question 5
You query `dbo.vw_JobCostAggregate` (an indexed view) on SQL Server Standard Edition, but
the execution plan shows a full scan of the base table instead of the view's index. What's
wrong?

<details>
<summary>Answer</summary>

On SQL Server **Standard Edition**, the optimizer does not automatically match queries to
indexed views. You must query the view directly with the `WITH (NOEXPAND)` hint:
```sql
SELECT * FROM dbo.vw_JobCostAggregate WITH (NOEXPAND) WHERE JobID = 4520;
```
Only Enterprise Edition performs automatic indexed view matching. Without NOEXPAND on
Standard Edition, SQL Server expands the view definition and queries the base tables.
</details>
