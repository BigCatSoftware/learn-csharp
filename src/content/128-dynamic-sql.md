# Dynamic SQL

*Chapter 9.9 — T-SQL for Data Engineers*

## Overview

Dynamic SQL is T-SQL code that builds and executes other T-SQL code at runtime. Data
engineers use it constantly: dynamic WHERE clauses for user-configurable reports,
dynamic pivot queries for variable column lists, and ETL procedures that operate on
configurable sets of tables.

This lesson covers:

- `EXEC` vs `sp_executesql` and why the difference matters
- Parameterized dynamic SQL for security and plan reuse
- SQL injection: how it works and how to prevent it
- Building dynamic WHERE clauses safely
- Dynamic PIVOT queries
- Output parameters with `sp_executesql`
- BNBuilders: dynamic report filters and configurable ETL

---

## Core Concepts

### EXEC (EXECUTE)

The simplest form of dynamic SQL. Concatenates a string and executes it.

```sql
DECLARE @TableName NVARCHAR(128) = N'JobCostDetail';
DECLARE @SQL NVARCHAR(MAX);

SET @SQL = N'SELECT TOP 10 * FROM dbo.' + QUOTENAME(@TableName);
EXEC (@SQL);
```

**Limitations of EXEC:**
- Cannot parameterize values (only string concatenation)
- Every unique string gets its own plan in cache (plan cache bloat)
- Vulnerable to SQL injection if not careful
- Cannot use output parameters

### sp_executesql

The preferred way to execute dynamic SQL. Supports parameters.

```sql
DECLARE @SQL NVARCHAR(MAX);
DECLARE @Params NVARCHAR(MAX);

SET @SQL = N'SELECT JobID, Amount, PostDate
             FROM dbo.JobCostDetail
             WHERE JobID = @pJobID AND PostDate >= @pStartDate';

SET @Params = N'@pJobID INT, @pStartDate DATE';

EXEC sp_executesql @SQL, @Params,
    @pJobID = 4520,
    @pStartDate = '2025-01-01';
```

**Advantages of sp_executesql:**
- **Plan reuse:** Same parameterized template reuses the cached plan
- **SQL injection protection:** Parameters are never interpolated into the SQL string
- **Type safety:** Parameters are strongly typed
- **Output parameters:** Can return values to the caller

### EXEC vs sp_executesql — Summary

| Feature | EXEC | sp_executesql |
|---|---|---|
| Parameterized queries | No | Yes |
| Plan cache reuse | Poor (one plan per unique string) | Good (one plan per template) |
| SQL injection safe | Only with QUOTENAME for identifiers | Yes for values; identifiers still need QUOTENAME |
| Output parameters | No | Yes |
| Use when | Only for dynamic object names | Everything else |

---

### SQL Injection

SQL injection happens when user input is concatenated directly into a SQL string,
allowing the user to alter the query's logic.

```sql
-- VULNERABLE: user input directly concatenated
DECLARE @UserInput NVARCHAR(100) = N'4520; DROP TABLE dbo.JobCostDetail;--';
DECLARE @SQL NVARCHAR(MAX) = N'SELECT * FROM dbo.JobCostDetail WHERE JobID = ' + @UserInput;
EXEC (@SQL);
-- Executes: SELECT * FROM dbo.JobCostDetail WHERE JobID = 4520; DROP TABLE dbo.JobCostDetail;--

-- SAFE: parameterized
DECLARE @SQL2 NVARCHAR(MAX) = N'SELECT * FROM dbo.JobCostDetail WHERE JobID = @pJobID';
EXEC sp_executesql @SQL2, N'@pJobID INT', @pJobID = @UserInput;
-- @UserInput cannot be converted to INT -> error; no injection possible
```

**Rules:**
1. **Values** (WHERE clause comparisons, INSERT values): Always use parameters
2. **Identifiers** (table names, column names): Cannot be parameterized. Use
   `QUOTENAME()` and validate against a whitelist
3. **Keywords** (ORDER BY direction, etc.): Cannot be parameterized. Use IF/CASE logic

```sql
-- Safe identifier handling
DECLARE @TableName NVARCHAR(128) = N'JobCostDetail';
DECLARE @SortCol NVARCHAR(128) = N'PostDate';
DECLARE @SortDir NVARCHAR(4) = N'DESC';

-- Validate table exists
IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = @TableName AND schema_id = SCHEMA_ID('dbo')
)
    THROW 50001, 'Invalid table name', 1;

-- Validate column exists
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.' + QUOTENAME(@TableName))
      AND name = @SortCol
)
    THROW 50002, 'Invalid column name', 1;

-- Validate sort direction
SET @SortDir = CASE WHEN @SortDir = 'DESC' THEN 'DESC' ELSE 'ASC' END;

DECLARE @SQL NVARCHAR(MAX) = N'SELECT TOP 100 * FROM dbo.' + QUOTENAME(@TableName)
    + N' ORDER BY ' + QUOTENAME(@SortCol) + N' ' + @SortDir;
EXEC (@SQL);
```

---

## Code Examples

### Dynamic WHERE Clause (The "Kitchen Sink" Query)

```sql
CREATE PROCEDURE dbo.SearchJobCosts
    @JobID       INT = NULL,
    @CostCodeID  VARCHAR(20) = NULL,
    @StartDate   DATE = NULL,
    @EndDate     DATE = NULL,
    @MinAmount   DECIMAL(18,2) = NULL,
    @MaxAmount   DECIMAL(18,2) = NULL,
    @Description NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SQL NVARCHAR(MAX) = N'
        SELECT jc.JobID, jc.CostCodeID, jc.Amount, jc.PostDate, jc.Description
        FROM dbo.JobCostDetail jc
        WHERE 1=1';

    DECLARE @Params NVARCHAR(MAX) = N'
        @pJobID INT, @pCostCodeID VARCHAR(20),
        @pStartDate DATE, @pEndDate DATE,
        @pMinAmount DECIMAL(18,2), @pMaxAmount DECIMAL(18,2),
        @pDescription NVARCHAR(200)';

    -- Conditionally append predicates
    IF @JobID IS NOT NULL
        SET @SQL += N' AND jc.JobID = @pJobID';

    IF @CostCodeID IS NOT NULL
        SET @SQL += N' AND jc.CostCodeID = @pCostCodeID';

    IF @StartDate IS NOT NULL
        SET @SQL += N' AND jc.PostDate >= @pStartDate';

    IF @EndDate IS NOT NULL
        SET @SQL += N' AND jc.PostDate <= @pEndDate';

    IF @MinAmount IS NOT NULL
        SET @SQL += N' AND jc.Amount >= @pMinAmount';

    IF @MaxAmount IS NOT NULL
        SET @SQL += N' AND jc.Amount <= @pMaxAmount';

    IF @Description IS NOT NULL
        SET @SQL += N' AND jc.Description LIKE N''%'' + @pDescription + N''%''';

    SET @SQL += N' ORDER BY jc.PostDate DESC';

    EXEC sp_executesql @SQL, @Params,
        @pJobID = @JobID,
        @pCostCodeID = @CostCodeID,
        @pStartDate = @StartDate,
        @pEndDate = @EndDate,
        @pMinAmount = @MinAmount,
        @pMaxAmount = @MaxAmount,
        @pDescription = @Description;
END;
```

**Why this is better than the `OR @Param IS NULL` pattern:**
- The optimizer sees only the predicates that apply, generating a targeted plan
- Each unique combination of non-NULL parameters gets its own cached plan
- Index seeks are possible (vs. the OR pattern which often forces scans)

### Dynamic PIVOT

```sql
-- Pivot job costs by month — columns are dynamic because months change
CREATE PROCEDURE dbo.PivotJobCostsByMonth
    @Year INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Step 1: Build the column list dynamically
    DECLARE @Columns NVARCHAR(MAX) = N'';
    DECLARE @SelectColumns NVARCHAR(MAX) = N'';

    SELECT
        @Columns += N', ' + QUOTENAME(MonthName),
        @SelectColumns += N', ISNULL(' + QUOTENAME(MonthName) + N', 0) AS '
            + QUOTENAME(MonthName)
    FROM (
        SELECT DISTINCT
            DATENAME(MONTH, PostDate) AS MonthName,
            MONTH(PostDate) AS MonthNum
        FROM dbo.JobCostDetail
        WHERE YEAR(PostDate) = @Year
    ) m
    ORDER BY m.MonthNum;

    -- Remove leading comma
    SET @Columns = STUFF(@Columns, 1, 2, N'');
    SET @SelectColumns = STUFF(@SelectColumns, 1, 2, N'');

    -- Step 2: Build and execute the pivot query
    DECLARE @SQL NVARCHAR(MAX) = N'
        SELECT JobID' + @SelectColumns + N'
        FROM (
            SELECT JobID, DATENAME(MONTH, PostDate) AS MonthName, Amount
            FROM dbo.JobCostDetail
            WHERE YEAR(PostDate) = @pYear
        ) src
        PIVOT (
            SUM(Amount) FOR MonthName IN (' + @Columns + N')
        ) pvt
        ORDER BY JobID';

    EXEC sp_executesql @SQL, N'@pYear INT', @pYear = @Year;
END;
```

### Output Parameters

```sql
-- Get row count and max date from a dynamic table
DECLARE @TableName NVARCHAR(128) = N'JobCostDetail';
DECLARE @RowCount BIGINT;
DECLARE @MaxDate DATE;

DECLARE @SQL NVARCHAR(MAX) = N'
    SELECT @pRowCount = COUNT(*), @pMaxDate = MAX(PostDate)
    FROM dbo.' + QUOTENAME(@TableName);

EXEC sp_executesql @SQL,
    N'@pRowCount BIGINT OUTPUT, @pMaxDate DATE OUTPUT',
    @pRowCount = @RowCount OUTPUT,
    @pMaxDate = @MaxDate OUTPUT;

PRINT 'Rows: ' + CAST(@RowCount AS VARCHAR) + ', Max Date: ' + CAST(@MaxDate AS VARCHAR);
```

### Building Dynamic SQL in C#

```csharp
using Microsoft.Data.SqlClient;

// Same dynamic WHERE pattern as the T-SQL version above
public record JobCostFilter(int? JobId = null, string? CostCode = null,
    DateTime? StartDate = null, DateTime? EndDate = null);

public static async Task<SqlDataReader> SearchAsync(string connStr, JobCostFilter f)
{
    var sql = new StringBuilder(
        "SELECT JobID, CostCodeID, Amount, PostDate FROM dbo.JobCostDetail WHERE 1=1");
    await using var conn = new SqlConnection(connStr);
    await using var cmd = new SqlCommand { Connection = conn };

    if (f.JobId.HasValue)
    { sql.Append(" AND JobID = @JobID"); cmd.Parameters.AddWithValue("@JobID", f.JobId.Value); }
    if (f.CostCode is not null)
    { sql.Append(" AND CostCodeID = @CC"); cmd.Parameters.AddWithValue("@CC", f.CostCode); }
    if (f.StartDate.HasValue)
    { sql.Append(" AND PostDate >= @SD"); cmd.Parameters.AddWithValue("@SD", f.StartDate.Value); }
    if (f.EndDate.HasValue)
    { sql.Append(" AND PostDate <= @ED"); cmd.Parameters.AddWithValue("@ED", f.EndDate.Value); }

    cmd.CommandText = sql.ToString();
    await conn.OpenAsync();
    return await cmd.ExecuteReaderAsync(CommandBehavior.CloseConnection);
}
```

---

## Common Patterns

### Pattern 1: Conditional ORDER BY

```sql
CREATE PROCEDURE dbo.GetJobCostsSorted
    @SortColumn NVARCHAR(50) = N'PostDate',
    @SortDirection NVARCHAR(4) = N'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    -- Whitelist validation
    IF @SortColumn NOT IN (N'PostDate', N'Amount', N'JobID', N'CostCodeID')
        SET @SortColumn = N'PostDate';

    SET @SortDirection = CASE WHEN @SortDirection = N'ASC' THEN N'ASC' ELSE N'DESC' END;

    DECLARE @SQL NVARCHAR(MAX) = N'
        SELECT JobID, CostCodeID, Amount, PostDate
        FROM dbo.JobCostDetail
        ORDER BY ' + QUOTENAME(@SortColumn) + N' ' + @SortDirection;

    EXEC sp_executesql @SQL;
END;
```

---

## Gotchas and Pitfalls

1. **QUOTENAME has a 128-character limit.** It returns NULL for longer inputs. Always
   check for NULL after QUOTENAME to catch this edge case.

2. **Dynamic SQL runs in a different scope.** Temp tables created in the caller are
   visible inside `EXEC`/`sp_executesql`, but temp tables created inside dynamic SQL
   are dropped when it returns. Use a persistent temp table or table variable if needed.

3. **Permissions are checked at execution time, not compilation time.** The calling
   user needs permissions on the underlying tables, not just on the stored procedure
   (unless you use `EXECUTE AS`).

4. **Plan cache bloat with string concatenation.** Using `EXEC` with concatenated values
   creates a new plan for every unique string. Use `sp_executesql` with parameters.

5. **Nested dynamic SQL is nearly impossible to debug.** If your dynamic SQL builds
   more dynamic SQL, you've gone too far. Refactor into separate procedures.

6. **N prefix matters for Unicode.** Always use `N'...'` for dynamic SQL strings.
   Without it, Unicode characters (common in CMiC data) get corrupted.

7. **SELECT INTO inside dynamic SQL** creates the table in the dynamic SQL scope. It
   works, but the table must not already exist, and temp tables disappear after execution.

8. **PRINT truncates at 8,000 characters (varchar) or 4,000 (nvarchar).** For debugging
   long dynamic SQL, use `SELECT @SQL` or split into chunks.

---

## Performance Considerations

- **sp_executesql with parameters** gets plan reuse — the same parameterized template
  reuses the cached plan even with different parameter values.
- **Dynamic WHERE clauses** generate different plan cache entries per combination of
  non-NULL parameters. This is usually fine (a few dozen combinations) and gives each
  combination an optimal plan. If combinations explode, consider `OPTION (RECOMPILE)`.
- **Avoid `SELECT *` in dynamic SQL.** It prevents covering indexes and causes unnecessary
  I/O. Explicitly list the columns.
- **Dynamic SQL inside a loop** (e.g., cursor over tables) compiles once per unique SQL
  string, not once per iteration. If the table name changes, each iteration compiles
  separately — acceptable for ETL with a few dozen tables, problematic for thousands.
- **Plan cache memory** can be consumed by thousands of unique dynamic SQL plans. Monitor
  with:
  ```sql
  SELECT objtype, COUNT(*) AS plans, SUM(size_in_bytes)/1024/1024 AS mb
  FROM sys.dm_exec_cached_plans
  GROUP BY objtype;
  ```

---

## BNBuilders Context

### Scenario 1: Dynamic Report Filters

Power BI reports let users filter by job, date range, cost code, and phase. The SQL
behind the report uses the "Kitchen Sink" pattern above. Without dynamic SQL, the
query uses `(@Param IS NULL OR Column = @Param)` which prevents index seeks.

With dynamic SQL + `sp_executesql`, each filter combination generates an optimal plan:
- Filter by JobID only: Index Seek on IX_JobCost_JobID
- Filter by date range only: Index Seek on IX_JobCost_PostDate
- Filter by both: optimizer picks the most selective index

### Scenario 2: Configurable ETL Table Lists

When migrating from Oracle (CMiC) to SQL Server, the list of tables to replicate changes
as the migration progresses. The `ETL_RunConfiguredLoads` procedure above reads from a
config table, so adding a new table to the ETL is a single INSERT — no code changes.

```sql
-- Add a new table to ETL
INSERT INTO dbo.ETLConfig
    (SourceSchema, SourceTable, TargetSchema, TargetTable, WatermarkColumn)
VALUES
    (N'cmicstg', N'EquipmentHours', N'dbo', N'EquipmentHours', N'ModifiedDate');
```

### Scenario 3: Dynamic Pivot for Budget vs. Actual by Phase

```sql
-- Finance wants a matrix: rows = cost codes, columns = phases
-- Phases vary by project, so columns must be dynamic
EXEC dbo.PivotJobCostsByMonth @Year = 2025;
```

---

## Interview / Senior Dev Questions

1. **Q: Why is sp_executesql preferred over EXEC for dynamic SQL?**
   A: sp_executesql supports parameterized queries, which prevents SQL injection for
   parameter values and enables plan cache reuse. EXEC with string concatenation creates
   a new plan per unique string and is vulnerable to injection.

2. **Q: How do you safely use a user-supplied table name in dynamic SQL?**
   A: You cannot parameterize identifiers with sp_executesql. Instead: (1) validate the
   table name against `sys.tables` or a whitelist, (2) wrap it with `QUOTENAME()` to
   escape special characters, and (3) check that QUOTENAME didn't return NULL.

3. **Q: What are the security implications of dynamic SQL in a stored procedure?**
   A: Dynamic SQL breaks the ownership chain. The executing user needs direct permissions
   on the underlying tables, unlike static SQL in a stored procedure where EXECUTE
   permission on the proc is sufficient. You can use `EXECUTE AS` to work around this,
   but it requires careful security design.

4. **Q: How do you debug dynamic SQL that's producing wrong results?**
   A: (1) PRINT or SELECT the @SQL variable before executing it. (2) Copy the output
   into a new query window and execute it with hardcoded values. (3) Check for truncation
   if the SQL is longer than 4,000/8,000 characters. (4) Use the actual execution plan
   on the dynamic SQL to verify it's doing what you expect.

---

## Quiz

### Question 1
What is wrong with this code?
```sql
DECLARE @ID VARCHAR(10) = '5; DROP TABLE dbo.Users;--';
EXEC('SELECT * FROM dbo.Users WHERE UserID = ' + @ID);
```

<details>
<summary>Answer</summary>

This is a **SQL injection vulnerability**. The `@ID` value contains malicious SQL that
gets concatenated directly into the string and executed. The actual SQL executed is:
`SELECT * FROM dbo.Users WHERE UserID = 5; DROP TABLE dbo.Users;--`

Fix: Use `sp_executesql` with a parameter:
```sql
EXEC sp_executesql N'SELECT * FROM dbo.Users WHERE UserID = @pID',
    N'@pID INT', @pID = @ID;
```
The parameter cannot be converted to INT, so it throws a type error instead of executing
the injection.
</details>

### Question 2
You build a dynamic WHERE clause with sp_executesql. The plan cache shows 64 different
cached plans for this query. Is this a problem?

<details>
<summary>Answer</summary>

Probably **not a problem**. 64 plans correspond to 64 unique combinations of non-NULL
filter parameters (e.g., 6 optional filters = up to 2^6 = 64 combinations). Each plan is
optimized for that specific combination of predicates, which means better index usage. This
becomes a problem only if you have dozens of optional parameters creating thousands of
combinations, or if the plans consume excessive memory. Monitor plan cache size to be sure.
</details>

### Question 3
You create a temp table `#Staging` inside an `EXEC()` call. After the EXEC finishes, you
try to SELECT from `#Staging` and get an error. Why?

<details>
<summary>Answer</summary>

Dynamic SQL executed via `EXEC()` or `sp_executesql` runs in a **child scope**. Temp
tables created inside that scope are dropped when the dynamic SQL finishes. The parent
scope cannot see them. To fix this: (1) create the temp table in the parent scope before
calling the dynamic SQL, then INSERT into it from the dynamic SQL, or (2) use a global
temp table `##Staging` (but watch for name collisions), or (3) use `SELECT INTO` with a
table that persists in the parent scope.

Note: temp tables created in the **parent** scope ARE visible inside dynamic SQL — the
limitation is only in the other direction.
</details>

### Question 4
Why does QUOTENAME return NULL for the input string `REPLICATE('A', 200)`?

<details>
<summary>Answer</summary>

`QUOTENAME()` has a **128-character input limit** (matching SQL Server's maximum identifier
length of 128 characters). When the input exceeds 128 characters, QUOTENAME returns NULL
instead of raising an error. Always check for NULL after calling QUOTENAME:
```sql
IF @SafeName IS NULL
    THROW 50001, 'Identifier too long for QUOTENAME', 1;
```
</details>
