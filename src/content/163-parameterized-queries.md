# Parameterized Queries

*Chapter 11.4 — ADO.NET and Data Access*

## Overview

SQL injection is the most dangerous and most preventable vulnerability in data
applications. Parameterized queries eliminate it entirely -- but only if you use
them correctly. This lesson covers `SqlParameter` in depth, explains why
`AddWithValue` is an anti-pattern, demonstrates table-valued parameters (TVPs),
and shows how to safely pass lists to `IN` clauses.

Every query you write at BNBuilders -- whether ETL, reporting, or CRUD -- must use
parameters. No exceptions.

## Core Concepts

### SQL Injection in 30 Seconds

```csharp
// VULNERABLE -- string concatenation
string sql = $"SELECT * FROM Projects WHERE Name = '{userInput}'";
// If userInput = "'; DROP TABLE Projects; --" you get:
// SELECT * FROM Projects WHERE Name = ''; DROP TABLE Projects; --'
```

### The Fix: Parameters

```csharp
// SAFE -- parameterized
var cmd = new SqlCommand("SELECT * FROM Projects WHERE Name = @name", conn);
cmd.Parameters.Add("@name", SqlDbType.NVarChar, 200).Value = userInput;
```

The parameter value is sent to SQL Server as data, never as executable SQL text.
SQL Server treats `@name` as a typed value, regardless of what the string contains.

### SqlParameter Properties

| Property    | Purpose                                                      |
|-------------|--------------------------------------------------------------|
| `ParameterName` | The `@name` in your SQL. Include the `@` prefix.        |
| `SqlDbType`     | The SQL Server data type (`NVarChar`, `Int`, `Decimal`, etc.). |
| `Size`          | Max length for string/binary types.                      |
| `Value`         | The actual value. Use `DBNull.Value` for SQL NULL.       |
| `Direction`     | `Input` (default), `Output`, `InputOutput`, `ReturnValue`. |
| `Precision`     | For `Decimal` types -- total digits.                     |
| `Scale`         | For `Decimal` types -- digits after decimal point.       |

### The Three Ways to Add Parameters

```csharp
// Method 1: Parameters.Add with explicit type (PREFERRED)
cmd.Parameters.Add("@name", SqlDbType.NVarChar, 200).Value = "Seattle Office";

// Method 2: Parameters.AddWithValue (AVOID -- see pitfalls section)
cmd.Parameters.AddWithValue("@name", "Seattle Office");

// Method 3: SqlParameter object (useful for Decimal precision/scale)
cmd.Parameters.Add(new SqlParameter("@budget", SqlDbType.Decimal)
    { Precision = 18, Scale = 2, Value = 1_500_000.00m });
```

## Code Examples

### Basic Parameterized Query

```csharp
await using var conn = new SqlConnection(connStr);
await conn.OpenAsync();

await using var cmd = new SqlCommand(@"
    SELECT ProjectId, Name, Budget, StartDate
    FROM Projects
    WHERE Status = @status
      AND Budget >= @minBudget
      AND StartDate >= @afterDate", conn);

cmd.Parameters.Add("@status", SqlDbType.NVarChar, 50).Value = "Active";
cmd.Parameters.Add("@minBudget", SqlDbType.Decimal).Value = 500_000m;
cmd.Parameters.Add("@afterDate", SqlDbType.Date).Value = new DateTime(2025, 1, 1);

await using var reader = await cmd.ExecuteReaderAsync();
while (await reader.ReadAsync())
{
    // process rows
}
```

### Handling NULL Parameters

```csharp
// Passing NULL to SQL Server
cmd.Parameters.Add("@completionDate", SqlDbType.Date).Value =
    completionDate.HasValue ? completionDate.Value : DBNull.Value;

// Cleaner with a helper
cmd.Parameters.Add("@completionDate", SqlDbType.Date).Value =
    (object?)completionDate ?? DBNull.Value;
```

**Why not just pass C# `null`?** Because `SqlParameter.Value` interprets `null`
as "do not send this parameter at all," which causes a SQL error. You must use
`DBNull.Value` to represent SQL NULL.

### Output Parameters and Return Values

```csharp
await using var cmd = new SqlCommand("dbo.usp_CreateProject", conn);
cmd.CommandType = CommandType.StoredProcedure;
cmd.Parameters.Add("@name", SqlDbType.NVarChar, 200).Value = "New Seattle Tower";
cmd.Parameters.Add("@budget", SqlDbType.Decimal).Value = 2_000_000m;

var outputId = cmd.Parameters.Add("@projectId", SqlDbType.Int);
outputId.Direction = ParameterDirection.Output;

var returnValue = cmd.Parameters.Add("@return", SqlDbType.Int);
returnValue.Direction = ParameterDirection.ReturnValue;

await cmd.ExecuteNonQueryAsync();
int newProjectId = (int)outputId.Value!;  // set by proc's OUTPUT param
int result = (int)returnValue.Value!;      // set by proc's RETURN
```

### Table-Valued Parameters (TVPs)

TVPs let you pass an entire table of data as a single parameter. This is essential
for batch operations and eliminates the need for temp tables or XML serialization.

First, create the type in SQL Server:

```sql
CREATE TYPE dbo.CostCodeList AS TABLE
(
    Code        NVARCHAR(20)    NOT NULL,
    Description NVARCHAR(200)   NOT NULL,
    Category    NVARCHAR(50)    NOT NULL
);
```

Then use it in C#:

```csharp
var table = new DataTable();
table.Columns.Add("Code", typeof(string));
table.Columns.Add("Description", typeof(string));
table.Columns.Add("Category", typeof(string));
foreach (var cc in costCodes)
    table.Rows.Add(cc.Code, cc.Description, cc.Category);

await using var cmd = new SqlCommand("dbo.usp_UpsertCostCodes", conn);
cmd.CommandType = CommandType.StoredProcedure;
var tvpParam = cmd.Parameters.Add("@costCodes", SqlDbType.Structured);
tvpParam.TypeName = "dbo.CostCodeList";
tvpParam.Value = table;
await cmd.ExecuteNonQueryAsync();
```

The stored procedure receives `@costCodes dbo.CostCodeList READONLY` and can use
it in MERGE, JOIN, or INSERT...SELECT statements.

### Passing Lists to IN Clauses

SQL Server does not natively support array parameters. Here are the approaches,
from best to worst:

#### Approach 1: TVP (Best for Large Lists)

```csharp
// Create a simple ID list type in SQL
// CREATE TYPE dbo.IntList AS TABLE (Id INT NOT NULL);

var idTable = new DataTable();
idTable.Columns.Add("Id", typeof(int));
foreach (var id in projectIds)
    idTable.Rows.Add(id);

await using var cmd = new SqlCommand(@"
    SELECT * FROM Projects
    WHERE ProjectId IN (SELECT Id FROM @ids)", conn);
var tvp = cmd.Parameters.Add("@ids", SqlDbType.Structured);
tvp.TypeName = "dbo.IntList";
tvp.Value = idTable;
```

#### Approach 2: Dynamic Parameters (OK for Small Lists, < 2100 items)

```csharp
var ids = new[] { 10, 20, 30, 40 };
var paramNames = ids.Select((id, i) => $"@p{i}").ToArray();
for (int i = 0; i < ids.Length; i++)
    cmd.Parameters.Add(paramNames[i], SqlDbType.Int).Value = ids[i];
cmd.CommandText = $"SELECT * FROM Projects WHERE ProjectId IN ({string.Join(",", paramNames)})";
```

#### Approach 3: STRING_SPLIT (SQL Server 2016+, convenient but poor cardinality estimates)

```csharp
cmd.CommandText = "SELECT * FROM Projects WHERE ProjectId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))";
cmd.Parameters.Add("@ids", SqlDbType.NVarChar, -1).Value = string.Join(",", projectIds);
```

#### Approach 4: Dapper Makes This Easy

```csharp
// Dapper handles IN clauses automatically
var projects = await conn.QueryAsync<Project>(
    "SELECT * FROM Projects WHERE ProjectId IN @ids",
    new { ids = new[] { 10, 20, 30, 40 } });
// Dapper expands this to: WHERE ProjectId IN (@ids0, @ids1, @ids2, @ids3)
```

## Common Patterns

### Pattern: Parameter Helper Extension

```csharp
public static class SqlCommandExtensions
{
    public static SqlParameter AddParam(this SqlCommand cmd,
        string name, SqlDbType type, object? value, int size = 0)
    {
        var p = size > 0 ? cmd.Parameters.Add(name, type, size)
                         : cmd.Parameters.Add(name, type);
        p.Value = value ?? DBNull.Value;
        return p;
    }
}

// Usage -- null-safe, explicit type, concise
cmd.AddParam("@name", SqlDbType.NVarChar, project.Name, 200);
cmd.AddParam("@status", SqlDbType.NVarChar, project.Status, 50);
```

### Pattern: Building Dynamic WHERE Clauses Safely

```csharp
public static (string Sql, Action<SqlCommand> Configure) BuildProjectFilter(
    ProjectFilter filter)
{
    var conditions = new List<string>();
    var configure = new List<Action<SqlCommand>>();

    if (filter.Status is not null)
    {
        conditions.Add("Status = @status");
        configure.Add(cmd =>
            cmd.Parameters.Add("@status", SqlDbType.NVarChar, 50).Value = filter.Status);
    }
    if (filter.MinBudget is not null)
    {
        conditions.Add("Budget >= @minBudget");
        configure.Add(cmd =>
            cmd.Parameters.Add("@minBudget", SqlDbType.Decimal).Value = filter.MinBudget);
    }

    string where = conditions.Count > 0
        ? "WHERE " + string.Join(" AND ", conditions) : "";
    return ($"SELECT * FROM Projects {where}", cmd =>
    {
        foreach (var action in configure) action(cmd);
    });
}
```

## Gotchas and Pitfalls

### The AddWithValue Trap (Critical)

`AddWithValue` infers the `SqlDbType` from the C# type of the value. This causes
three serious problems:

**Problem 1: VARCHAR vs NVARCHAR mismatch.**

```csharp
// C# string -> SqlDbType.NVarChar (always)
cmd.Parameters.AddWithValue("@code", "ABC-100");
// Sends NVARCHAR parameter, but column is VARCHAR(20)
// SQL Server must convert EVERY row's column to NVARCHAR to compare
// This prevents index usage (index scan instead of seek)
```

Fix:

```csharp
cmd.Parameters.Add("@code", SqlDbType.VarChar, 20).Value = "ABC-100";
```

**Problem 2: String length varies.**

```csharp
// First call: value = "AB" -> AddWithValue sends NVARCHAR(2)
// Second call: value = "ABCDEF" -> AddWithValue sends NVARCHAR(6)
// These are DIFFERENT query plans. You get plan cache bloat.
```

Fix: always specify `Size`:

```csharp
cmd.Parameters.Add("@code", SqlDbType.NVarChar, 200).Value = "AB";
// Always sends NVARCHAR(200), same plan reused.
```

**Problem 3: Decimal precision.**

```csharp
// AddWithValue with 1.5m -> SqlDbType.Decimal, but precision/scale are inferred
// from the VALUE, not the COLUMN. This can cause implicit conversions.
cmd.Parameters.AddWithValue("@amount", 1.5m);  // precision=2, scale=1
cmd.Parameters.AddWithValue("@amount", 1500000.50m);  // precision=9, scale=2
// Different plans again!
```

**Rule: Never use AddWithValue. Always use Add with explicit SqlDbType and Size.**

### Other Gotchas

1. **Forgetting `@` prefix.** `SqlParameter("name", ...)` without `@` works but
   is inconsistent. Always include `@`.

2. **`DBNull.Value` vs `null`.** Setting `parameter.Value = null` means "this
   parameter is not set" (error). Use `DBNull.Value` for SQL NULL.

3. **Parameter name collisions.** If you add `@id` twice to the same command,
   you get an exception. Check `Parameters.Contains("@id")` first in dynamic
   query builders.

4. **TVP is READONLY.** You cannot modify a TVP inside a stored procedure. You
   must insert its data into a temp table if you need to modify it.

5. **Max 2,100 parameters per query.** SQL Server has a hard limit. For large IN
   clauses (> 2,000 items), you must use TVPs or temp tables.

6. **`Size = -1` for MAX types.** For `NVARCHAR(MAX)` or `VARBINARY(MAX)`, set
   `Size = -1`, not some large number.

```csharp
cmd.Parameters.Add("@notes", SqlDbType.NVarChar, -1).Value = longText;
```

## Performance Considerations

- **Plan cache reuse.** Parameterized queries reuse execution plans. String
  concatenation creates a new plan for every unique query text, bloating the plan
  cache and wasting CPU on compilation.

- **TVPs vs. multiple round trips.** Sending 1,000 IDs in a TVP is one round trip.
  Sending 1,000 individual queries is 1,000 round trips. Network latency dominates.

- **Batch parameters.** For bulk INSERT, use multi-row VALUES with generated
  `@p0, @p1...` parameters (up to ~1,000 rows), or `SqlBulkCopy` for larger volumes.

- **Sp_executesql under the hood.** When you use parameters with `CommandType.Text`,
  ADO.NET sends the query as `sp_executesql` with the parameter definitions. This
  is how plan reuse works.

## BNBuilders Context

At BNBuilders, parameterized queries protect your construction data:

- **Cost data is sensitive.** Budget figures, bid amounts, and contract values must
  not be exposed via SQL injection. Every query in your ETL pipelines must be
  parameterized.

- **TVPs for cost code batch updates.** When syncing cost codes from Sage, build a
  `DataTable` of the incoming codes and pass it as a TVP to a MERGE procedure. One
  call, one transaction, all-or-nothing.

- **Dynamic project filtering.** The project dashboard lets users filter by region,
  status, budget range, and date range. Use the dynamic WHERE builder pattern above
  to construct safe parameterized queries.

- **Reporting stored procedures.** Power BI refresh jobs call stored procedures with
  date range and project parameters. Use `CommandType.StoredProcedure` with
  properly typed `SqlParameter` objects.

- **Multi-tenant project databases.** Connection strings change per project but
  parameterized queries stay the same. Parameters protect regardless of target database.

## Interview / Senior Dev Questions

1. **Why is `AddWithValue` considered harmful?** It infers `SqlDbType` from the C#
   value's runtime type, leading to: (a) VARCHAR/NVARCHAR mismatches that prevent
   index seeks, (b) varying parameter sizes that cause plan cache bloat, and (c)
   incorrect precision/scale for decimals.

2. **How do you pass a list of IDs to a SQL IN clause safely?** Options: (a) TVP
   (best for large lists), (b) dynamically generated `@p0, @p1, ...` parameters
   (OK for small lists), (c) `STRING_SPLIT` with a comma-delimited parameter.
   Never concatenate IDs into the SQL string.

3. **What is parameter sniffing and how does it relate to ADO.NET?** SQL Server
   caches the execution plan based on the first set of parameter values. If data
   distribution is skewed, subsequent calls with different values may get a
   suboptimal plan. Consistent parameter types (via `Add` not `AddWithValue`)
   reduce unnecessary plan variations.

4. **What are TVPs and when should you use them?** Table-Valued Parameters let you
   pass a `DataTable` as a single structured parameter to a stored procedure. Use
   them for batch operations (upserts, deletes by ID list, multi-row inserts) to
   avoid multiple round trips.

5. **What is the maximum number of parameters in a single SQL Server query?** 2,100.
   This is a hard TDS protocol limit. For larger sets, use TVPs, temp tables, or
   `SqlBulkCopy` into a staging table.

## Quiz

### Question 1
What SQL is actually executed when you use a parameterized `SqlCommand` with
`CommandType.Text`?

<details>
<summary>Answer</summary>

ADO.NET sends it as `sp_executesql` with parameter definitions. For example:

```sql
exec sp_executesql
    N'SELECT * FROM Projects WHERE Status = @status',
    N'@status nvarchar(50)',
    @status = N'Active'
```

This allows SQL Server to cache and reuse the execution plan for different
parameter values.
</details>

### Question 2
A colleague writes: `cmd.Parameters.AddWithValue("@code", costCode)` where
`costCode` is a C# `string` and the column is `VARCHAR(20)`. What is the
performance problem?

<details>
<summary>Answer</summary>

`AddWithValue` infers `SqlDbType.NVarChar` from the C# `string` type. The column is
`VARCHAR(20)`. SQL Server must implicitly convert every row's `VARCHAR` column value
to `NVARCHAR` for comparison, which prevents index seeks (causes a scan instead).

Fix: `cmd.Parameters.Add("@code", SqlDbType.VarChar, 20).Value = costCode;`
</details>

### Question 3
You need to delete 5,000 projects by ID. What is the best approach?

<details>
<summary>Answer</summary>

Use a Table-Valued Parameter (TVP). Create a SQL type `dbo.IntList AS TABLE (Id INT)`,
populate a `DataTable` with the 5,000 IDs, and pass it to a stored procedure:

```sql
DELETE FROM Projects WHERE ProjectId IN (SELECT Id FROM @ids)
```

You cannot use 5,000 individual `@p0, @p1, ...` parameters because SQL Server's
limit is 2,100 parameters per query. A TVP handles this in a single round trip
with no parameter limit.
</details>

### Question 4
What happens if you set `SqlParameter.Value = null` instead of `DBNull.Value`?

<details>
<summary>Answer</summary>

Setting `Value = null` tells ADO.NET that the parameter's value has not been set.
When the command executes, SQL Server throws an error because the parameter was
declared but no value was supplied.

Use `(object?)myValue ?? DBNull.Value` to correctly map C# `null` to SQL NULL.
</details>

### Question 5
You are building a search query with optional filters (status, region, date range).
How do you construct the SQL safely without string concatenation of user values?

<details>
<summary>Answer</summary>

Build the WHERE clause dynamically by conditionally appending parameterized conditions:

```csharp
var conditions = new List<string>();
if (filter.Status is not null)
{
    conditions.Add("Status = @status");
    cmd.Parameters.Add("@status", SqlDbType.NVarChar, 50).Value = filter.Status;
}
// ... more conditions ...
string where = conditions.Count > 0
    ? "WHERE " + string.Join(" AND ", conditions)
    : "";
cmd.CommandText = $"SELECT * FROM Projects {where}";
```

The SQL structure is built dynamically, but user values are always parameters --
never concatenated into the SQL text.
</details>
