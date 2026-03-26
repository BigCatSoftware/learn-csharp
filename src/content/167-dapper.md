# Dapper — Micro ORM

*Chapter 11.8 — ADO.NET and Data Access*

## Overview

Dapper is a lightweight object mapper that sits on top of ADO.NET. It extends
`IDbConnection` with methods like `Query<T>`, `Execute`, and `QueryMultiple`, giving
you the raw SQL control of ADO.NET with the convenience of automatic object mapping.
There is no change tracking, no LINQ-to-SQL translation, no migration framework — just
fast, predictable mapping from result sets to C# objects.

For a data engineer who already thinks in SQL, Dapper is often the sweet spot between
raw `SqlDataReader` code (verbose, error-prone) and full Entity Framework (heavy,
opaque). You write the SQL, Dapper handles the plumbing.

## Core Concepts

### How Dapper Works

1. You write a SQL string with parameter placeholders (e.g., `@ProjectId`).
2. You pass an anonymous object or `DynamicParameters` for the parameter values.
3. Dapper opens the connection (if closed), creates a `DbCommand`, binds parameters,
   executes the command, and maps result columns to properties of `T` by name.
4. Mapping is case-insensitive and uses IL-emit for speed (no reflection at runtime
   after first call).

### Key Extension Methods

| Method | Returns | Use Case |
|--------|---------|----------|
| `Query<T>` | `IEnumerable<T>` | SELECT returning multiple rows. |
| `QueryFirst<T>` | `T` | First row. Throws if empty. |
| `QueryFirstOrDefault<T>` | `T?` | First row or default. |
| `QuerySingle<T>` | `T` | Exactly one row. Throws if 0 or 2+. |
| `QuerySingleOrDefault<T>` | `T?` | Zero or one row. Throws if 2+. |
| `Execute` | `int` | INSERT/UPDATE/DELETE — returns affected rows. |
| `ExecuteScalar<T>` | `T` | First column of first row. |
| `QueryMultiple` | `GridReader` | Multiple result sets from one round trip. |

All of these have `Async` variants.

### Buffered vs Unbuffered

By default, `Query<T>` is **buffered** — it reads all rows into a `List<T>` before
returning. This is usually what you want. For very large result sets, pass
`buffered: false` to get a streaming `IEnumerable<T>` backed by an open reader.

**Warning:** With `buffered: false`, the connection stays open and the reader stays
active until you finish enumerating. Do not pass the result out of the `using` scope.

## Code Examples

### Basic Query

```csharp
using Dapper;
using Microsoft.Data.SqlClient;

public async Task<IEnumerable<Project>> GetActiveProjectsAsync(
    string connectionString,
    CancellationToken ct = default)
{
    await using var connection = new SqlConnection(connectionString);

    return await connection.QueryAsync<Project>(
        @"SELECT ProjectId, ProjectName, Budget, Status
          FROM dbo.Projects
          WHERE IsActive = 1
          ORDER BY ProjectName",
        ct);
}

public record Project(int ProjectId, string ProjectName, decimal Budget, string Status);
```

### Parameterized Queries

```csharp
public async Task<Project?> GetProjectByIdAsync(
    int projectId,
    string connectionString)
{
    await using var connection = new SqlConnection(connectionString);

    return await connection.QuerySingleOrDefaultAsync<Project>(
        "SELECT ProjectId, ProjectName, Budget, Status FROM dbo.Projects WHERE ProjectId = @Id",
        new { Id = projectId });
}
```

### Execute (INSERT / UPDATE / DELETE)

```csharp
public async Task<int> InsertCostCodeAsync(CostCode costCode, string connectionString)
{
    await using var connection = new SqlConnection(connectionString);

    return await connection.ExecuteAsync(
        @"INSERT INTO dbo.CostCodes (Code, Description, Category)
          VALUES (@Code, @Description, @Category)",
        costCode); // Dapper maps properties by name
}
```

### Bulk Execute (Sends One Command Per Item)

```csharp
public async Task<int> InsertManyCostCodesAsync(
    IEnumerable<CostCode> costCodes,
    string connectionString)
{
    await using var connection = new SqlConnection(connectionString);

    // Dapper loops internally — one INSERT per item.
    // This is NOT SqlBulkCopy. For thousands of rows, use SqlBulkCopy instead.
    return await connection.ExecuteAsync(
        @"INSERT INTO dbo.CostCodes (Code, Description, Category)
          VALUES (@Code, @Description, @Category)",
        costCodes);
}
```

### Multi-Mapping (JOIN Results)

```csharp
public record ProjectWithManager(
    int ProjectId, string ProjectName, decimal Budget,
    Employee ProjectManager);

public record Employee(int EmployeeId, string FullName, string Email);

public async Task<IEnumerable<ProjectWithManager>> GetProjectsWithManagersAsync(
    string connectionString)
{
    await using var connection = new SqlConnection(connectionString);

    const string sql = @"
        SELECT p.ProjectId, p.ProjectName, p.Budget,
               e.EmployeeId, e.FullName, e.Email
        FROM dbo.Projects p
        INNER JOIN dbo.Employees e ON p.ManagerId = e.EmployeeId
        WHERE p.IsActive = 1";

    return await connection.QueryAsync<ProjectWithManager, Employee, ProjectWithManager>(
        sql,
        (project, manager) => project with { ProjectManager = manager },
        splitOn: "EmployeeId"); // tells Dapper where the second object starts
}
```

### QueryMultiple — Multiple Result Sets

```csharp
public async Task<DashboardData> GetDashboardDataAsync(string connectionString)
{
    await using var connection = new SqlConnection(connectionString);

    const string sql = @"
        SELECT ProjectId, ProjectName, Budget FROM dbo.Projects WHERE IsActive = 1;
        SELECT Code, Description FROM dbo.CostCodes;
        SELECT COUNT(*) FROM dbo.Invoices WHERE Status = 'Pending';";

    await using var multi = await connection.QueryMultipleAsync(sql);

    var projects      = (await multi.ReadAsync<Project>()).ToList();
    var costCodes     = (await multi.ReadAsync<CostCode>()).ToList();
    var pendingCount  = await multi.ReadSingleAsync<int>();

    return new DashboardData(projects, costCodes, pendingCount);
}
```

### Stored Procedure Execution

```csharp
public async Task<IEnumerable<BudgetSummary>> GetBudgetSummaryAsync(
    int fiscalYear,
    string connectionString)
{
    await using var connection = new SqlConnection(connectionString);

    return await connection.QueryAsync<BudgetSummary>(
        "dbo.usp_GetBudgetSummary",
        new { FiscalYear = fiscalYear },
        commandType: CommandType.StoredProcedure);
}
```

### DynamicParameters (Output Parameters, Precise Types)

```csharp
public async Task<int> CreateProjectAsync(Project project, string connectionString)
{
    await using var connection = new SqlConnection(connectionString);

    var parameters = new DynamicParameters();
    parameters.Add("@ProjectName", project.ProjectName, DbType.String, size: 200);
    parameters.Add("@Budget", project.Budget, DbType.Decimal, precision: 18, scale: 2);
    parameters.Add("@NewProjectId", dbType: DbType.Int32, direction: ParameterDirection.Output);

    await connection.ExecuteAsync(
        "dbo.usp_CreateProject",
        parameters,
        commandType: CommandType.StoredProcedure);

    return parameters.Get<int>("@NewProjectId");
}
```

### Custom Type Handler

```csharp
// Dapper doesn't know how to map a SQL date column to a DateOnly by default.
public class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value.ToDateTime(TimeOnly.MinValue);
    }

    public override DateOnly Parse(object value)
    {
        return DateOnly.FromDateTime((DateTime)value);
    }
}

// Register once at startup
SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
```

### Dapper.Contrib — CRUD Helpers

```csharp
using Dapper.Contrib.Extensions;

[Table("dbo.Projects")]
public class ProjectEntity
{
    [Key] // Auto-increment identity
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = "";
    public decimal Budget { get; set; }
    public bool IsActive { get; set; }
}

public async Task DemoContribAsync(string connectionString)
{
    await using var connection = new SqlConnection(connectionString);

    // INSERT — returns the new identity value
    var newProject = new ProjectEntity { ProjectName = "BNB Tower", Budget = 5_000_000m, IsActive = true };
    int id = (int)await connection.InsertAsync(newProject);

    // GET by primary key
    var project = await connection.GetAsync<ProjectEntity>(id);

    // UPDATE
    project!.Budget = 5_500_000m;
    await connection.UpdateAsync(project);

    // DELETE
    await connection.DeleteAsync(project);

    // GET ALL
    var allProjects = (await connection.GetAllAsync<ProjectEntity>()).ToList();
}
```

## Common Patterns

### Extension Method for Connection Creation

```csharp
public static class DbConnectionFactory
{
    public static SqlConnection CreateConnection(string connectionString)
    {
        return new SqlConnection(connectionString);
    }
}

// Usage in a repository — keeps Dapper calls clean
await using var db = DbConnectionFactory.CreateConnection(_connStr);
var projects = await db.QueryAsync<Project>(sql);
```

### SQL Builder for Dynamic WHERE Clauses

```csharp
// Using Dapper's SqlBuilder (from Dapper.SqlBuilder NuGet)
var builder = new SqlBuilder();

var template = builder.AddTemplate(@"
    SELECT ProjectId, ProjectName, Budget, Status
    FROM dbo.Projects
    /**where**/
    ORDER BY ProjectName");

if (!string.IsNullOrEmpty(statusFilter))
    builder.Where("Status = @Status", new { Status = statusFilter });

if (minBudget.HasValue)
    builder.Where("Budget >= @MinBudget", new { MinBudget = minBudget.Value });

var results = await connection.QueryAsync<Project>(
    template.RawSql, template.Parameters);
```

### Repository Method Pattern

```csharp
public class ProjectRepository
{
    private readonly string _connectionString;

    public ProjectRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private SqlConnection CreateConnection() => new(_connectionString);

    public async Task<IReadOnlyList<Project>> GetByStatusAsync(string status)
    {
        await using var db = CreateConnection();
        var results = await db.QueryAsync<Project>(
            "SELECT ProjectId, ProjectName, Budget FROM dbo.Projects WHERE Status = @Status",
            new { Status = status });
        return results.AsList();
    }
}
```

## Gotchas and Pitfalls

1. **Property names must match column names (case-insensitive).** If your query
   returns `project_name` but your class has `ProjectName`, it will not map. Use
   column aliases in your SQL: `SELECT project_name AS ProjectName`.

2. **`Query<T>` with `Execute`-style SQL returns nothing useful.** If you accidentally
   use `Query<T>` for an INSERT, you get an empty enumerable. Use `Execute` or
   `ExecuteAsync` for non-SELECT statements.

3. **Anonymous type parameters are snapshots.** Dapper reads property values at call
   time. If you mutate the object after calling `QueryAsync`, the original values are
   sent.

4. **`splitOn` defaults to `"Id"`.** If your join column is not named `Id`, you must
   specify `splitOn` explicitly. Forgetting this gives you null nested objects.

5. **Bulk `Execute` is NOT bulk copy.** Passing a list to `Execute` runs one command
   per item. For 100K rows, use `SqlBulkCopy`.

6. **`buffered: false` holds the connection open.** If you return the `IEnumerable<T>`
   outside the `using` block, the connection is disposed and enumeration fails.

7. **No parameterized `IN` clause in plain SQL.** But Dapper handles it automatically:
   ```csharp
   // Dapper expands this to WHERE ProjectId IN (@p0, @p1, @p2)
   var results = await db.QueryAsync<Project>(
       "SELECT * FROM Projects WHERE ProjectId IN @Ids",
       new { Ids = new[] { 1, 2, 3 } });
   ```

8. **Dapper caches query plans by SQL string.** Dynamically generated SQL with
   different column lists produces cache bloat. Use consistent SQL templates.

## Performance Considerations

### Dapper vs Raw ADO.NET

Dapper adds approximately **0.01ms** overhead per query compared to hand-coded
`SqlDataReader` mapping. This comes from IL-emitted mappers (first call compiles, all
subsequent calls use the cached delegate). For almost all scenarios, this overhead is
negligible.

### Dapper vs Entity Framework

| Aspect | Dapper | EF Core |
|--------|--------|---------|
| Query speed | ~Same as raw ADO.NET | 2-10x slower (LINQ translation, change tracking) |
| Memory | Low (no tracking) | Higher (tracked entities, identity map) |
| Startup | Fast | Slow (model building) |
| SQL control | Full — you write it | Partial — LINQ-to-SQL, sometimes surprising |
| Migrations | None (use another tool) | Built-in |

### When to Use Each

- **Dapper:** ETL pipelines, reporting queries, stored procedure calls, read-heavy
  workloads, microservices. You already think in SQL.
- **EF Core:** CRUD-heavy apps, scaffolding, rapid prototyping, teams that prefer
  LINQ over SQL.
- **Raw ADO.NET:** Bulk operations, custom streaming, maximum control.

### AsList() vs ToList()

Dapper's buffered `Query<T>` returns an internal `List<T>` typed as
`IEnumerable<T>`. Calling `.AsList()` does a cheap cast; calling `.ToList()` creates
a copy. Prefer `.AsList()`.

```csharp
// Good — no copy
var list = (await db.QueryAsync<Project>(sql)).AsList();

// Wasteful — copies the entire list
var list = (await db.QueryAsync<Project>(sql)).ToList();
```

## BNBuilders Context

As a Data Engineer at BNBuilders, Dapper fits your workflow perfectly:

- **Stored procedures everywhere.** BNBuilders' Sage 300 CRE database exposes data
  through stored procedures. Dapper's `CommandType.StoredProcedure` support with
  `DynamicParameters` maps directly to these.

- **Reporting queries.** The finance team needs custom reports that join across 10+
  tables. You write the SQL in SSMS, test it, then paste it into a Dapper call. No
  ORM translation layer to second-guess your query plan.

- **ETL metadata tracking.** Your pipeline framework tracks load status in a
  `PipelineRuns` table. Dapper's `Execute` with `INSERT` and `UPDATE` is cleaner
  than raw `SqlCommand` for these metadata operations.

- **Multi-result dashboards.** The project dashboard needs active projects, pending
  invoices, and budget summaries in one call. `QueryMultiple` fetches all three
  result sets in a single round trip.

- **Cost code lookups.** Frequently, you need to validate a cost code against the
  master list. `QuerySingleOrDefault<CostCode>` with a parameter gives you a clean,
  typed result.

- **Data validation scripts.** Quick scripts to check data quality can use Dapper to
  query and aggregate without the ceremony of raw ADO.NET.

## Interview / Senior Dev Questions

1. **Q: When would you choose Dapper over Entity Framework Core?**
   A: When you need full SQL control (complex joins, window functions, CTEs), when
   performance matters (ETL, reporting), when you are calling stored procedures, or
   when the team is SQL-fluent. Dapper has negligible overhead vs raw ADO.NET and no
   LINQ-to-SQL translation surprises.

2. **Q: How does Dapper handle SQL injection?**
   A: Dapper parameterizes all values passed via the anonymous object or
   `DynamicParameters`. The SQL string is sent to SQL Server as a parameterized query,
   not string-concatenated. You still must not use string interpolation for SQL.

3. **Q: What does `splitOn` do in multi-mapping, and what happens if you forget it?**
   A: `splitOn` tells Dapper which column marks the boundary between the first and
   second object in a multi-map query. It defaults to `"Id"`. If your boundary column
   is named differently and you forget to specify it, Dapper cannot split the result
   set correctly and your second object will be null or partially mapped.

4. **Q: You pass a list of 10,000 items to `Execute` with an INSERT statement. Is this
   the same as `SqlBulkCopy`?**
   A: No. Dapper executes one INSERT command per item in a loop. It is convenient for
   small batches but orders of magnitude slower than `SqlBulkCopy` for large datasets.
   For 10,000+ rows, always use `SqlBulkCopy`.

## Quiz

**1. What does `buffered: false` do in `connection.Query<T>(sql, buffered: false)`, and what is the risk?**

<details>
<summary>Show Answer</summary>

It returns a streaming `IEnumerable<T>` backed by an open `SqlDataReader` instead of materializing all rows into a `List<T>`. The risk is that the database connection stays open and the reader stays active until you finish enumerating. If you return the enumerable outside the connection's `using` block, the connection is disposed and iteration throws an `ObjectDisposedException`.
</details>

**2. You have a query: `SELECT p.Id, p.Name, e.Id, e.Name FROM Projects p JOIN Employees e ON p.ManagerId = e.Id`. You call `Query<Project, Employee, Project>(sql, mapFunc)` but forget to set `splitOn`. What happens?**

<details>
<summary>Show Answer</summary>

Dapper defaults `splitOn` to `"Id"`. Since both `p.Id` and `e.Id` are named `Id` in the result set, Dapper splits on the *first* column named `Id`, which is `p.Id` — column index 0. This means the `Project` object gets zero columns and the `Employee` gets all four. The result is an incorrectly mapped object. The fix is to alias the columns distinctly (e.g., `e.Id AS EmployeeId`) and set `splitOn: "EmployeeId"`.
</details>

**3. How does Dapper expand an `IN` clause when you pass an array parameter?**

<details>
<summary>Show Answer</summary>

Dapper detects that the parameter is an `IEnumerable` and rewrites the SQL. For example, `WHERE Id IN @Ids` with `new { Ids = new[] {1, 2, 3} }` becomes `WHERE Id IN (@Ids0, @Ids1, @Ids2)` with three separate `DbParameter` objects. This maintains full parameterization (no SQL injection) while supporting variable-length lists.
</details>

**4. What is the performance difference between `.AsList()` and `.ToList()` on a Dapper `Query<T>` result?**

<details>
<summary>Show Answer</summary>

Dapper's buffered `Query<T>` internally returns a `List<T>` typed as `IEnumerable<T>`. `.AsList()` performs a zero-cost cast back to `List<T>`. `.ToList()` creates a new `List<T>` and copies all elements. For large result sets, this unnecessary copy wastes memory and CPU.
</details>
