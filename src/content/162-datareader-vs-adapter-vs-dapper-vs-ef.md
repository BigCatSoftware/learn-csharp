# SqlDataReader vs SqlDataAdapter vs Dapper vs EF Core

*Chapter 11.3 — ADO.NET and Data Access*

## Overview

.NET gives you four main approaches to read and write data from SQL Server. Each sits
at a different point on the control-vs-convenience spectrum. Choosing the wrong one
wastes hours of development time, creates performance problems, or both.

This lesson compares `SqlDataReader`, `SqlDataAdapter`, Dapper, and Entity Framework
Core across every dimension that matters to a Data Engineer: performance, memory,
mapping complexity, streaming capability, and use-case fit.

## Core Concepts

### The Four Approaches at a Glance

| Approach          | Abstraction Level | Mapping        | Streaming | NuGet Package                  |
|-------------------|-------------------|----------------|-----------|--------------------------------|
| `SqlDataReader`   | Raw ADO.NET       | Manual         | Yes       | Microsoft.Data.SqlClient       |
| `SqlDataAdapter`  | Raw ADO.NET       | DataTable/Set  | No        | Microsoft.Data.SqlClient       |
| Dapper            | Micro-ORM         | Auto (reflection/IL) | Partial | Dapper                   |
| EF Core           | Full ORM          | Auto (LINQ)    | Yes*      | Microsoft.EntityFrameworkCore  |

*EF Core supports streaming via `AsAsyncEnumerable()` but with more overhead per row.

### SqlDataReader

The lowest level. You write SQL, execute it, and manually read columns by ordinal
or name. No mapping, no overhead, no magic.

**Best for:** High-throughput ETL, bulk reads, streaming millions of rows, feeding
`SqlBulkCopy`.

### SqlDataAdapter

Fills a `DataTable` or `DataSet` in memory. Disconnected model -- you close the
connection and work with the in-memory copy.

**Best for:** Small lookup tables, legacy codebases, reporting tools that expect
`DataTable`, two-way data binding.

### Dapper

A micro-ORM by the Stack Overflow team. It extends `IDbConnection` with methods
like `Query<T>`, `Execute`, and `QueryAsync<T>`. It maps result sets to POCOs
automatically using reflection (cached IL generation).

**Best for:** Application queries where you want POCO mapping without EF overhead,
reporting queries, stored procedure calls, anything where you want to write raw SQL
but not manual column mapping.

### EF Core

A full ORM with change tracking, migrations, LINQ query translation, relationship
management, and more. It generates SQL from C# expressions.

**Best for:** CRUD applications, domain-driven apps, applications where schema
evolves frequently and you want migration tooling.

## Code Examples

### The Same Query in All Four Approaches

Given this table:

```sql
CREATE TABLE dbo.Projects (
    ProjectId   INT IDENTITY PRIMARY KEY,
    Name        NVARCHAR(200) NOT NULL,
    Budget      DECIMAL(18,2) NULL,
    StartDate   DATE NOT NULL,
    Status      NVARCHAR(50) NOT NULL
);
```

And this POCO:

```csharp
public record Project(int ProjectId, string Name, decimal? Budget,
    DateTime StartDate, string Status);
```

#### Approach 1: SqlDataReader

```csharp
var projects = new List<Project>();
await using var conn = new SqlConnection(connStr);
await conn.OpenAsync();

await using var cmd = new SqlCommand(
    "SELECT ProjectId, Name, Budget, StartDate, Status FROM Projects WHERE Status = @s",
    conn);
cmd.Parameters.Add("@s", SqlDbType.NVarChar, 50).Value = "Active";

await using var reader = await cmd.ExecuteReaderAsync();
int ordId = reader.GetOrdinal("ProjectId");
int ordName = reader.GetOrdinal("Name");
int ordBudget = reader.GetOrdinal("Budget");
int ordStart = reader.GetOrdinal("StartDate");
int ordStatus = reader.GetOrdinal("Status");

while (await reader.ReadAsync())
{
    projects.Add(new Project(
        reader.GetInt32(ordId),
        reader.GetString(ordName),
        reader.IsDBNull(ordBudget) ? null : reader.GetDecimal(ordBudget),
        reader.GetDateTime(ordStart),
        reader.GetString(ordStatus)));
}
```

**Lines of code:** ~20. **Mapping:** Manual. **Performance:** Best possible.

#### Approach 2: SqlDataAdapter

```csharp
await using var conn = new SqlConnection(connStr);

var adapter = new SqlDataAdapter(
    "SELECT ProjectId, Name, Budget, StartDate, Status FROM Projects WHERE Status = @s",
    conn);
adapter.SelectCommand!.Parameters.Add("@s", SqlDbType.NVarChar, 50).Value = "Active";

var table = new DataTable();
adapter.Fill(table);  // Opens and closes connection automatically

var projects = new List<Project>();
foreach (DataRow row in table.Rows)
{
    projects.Add(new Project(
        (int)row["ProjectId"],
        (string)row["Name"],
        row["Budget"] == DBNull.Value ? null : (decimal)row["Budget"],
        (DateTime)row["StartDate"],
        (string)row["Status"]));
}
```

**Lines of code:** ~15. **Mapping:** Manual via DataRow boxing. **Memory:** All rows buffered.

#### Approach 3: Dapper

```csharp
await using var conn = new SqlConnection(connStr);

var projects = (await conn.QueryAsync<Project>(
    "SELECT ProjectId, Name, Budget, StartDate, Status FROM Projects WHERE Status = @s",
    new { s = "Active" })).AsList();
```

**Lines of code:** 3. **Mapping:** Automatic. **Performance:** Very close to raw ADO.NET.

#### Approach 4: EF Core

```csharp
var projects = await dbContext.Projects
    .Where(p => p.Status == "Active")
    .ToListAsync();
```

**Lines of code:** 2. **Mapping:** Automatic via DbSet configuration. **Overhead:**
Change tracker, LINQ translation, expression compilation (first call).

### Streaming Comparison

When you have millions of rows and cannot afford to buffer them all:

```csharp
// SqlDataReader -- true streaming, near-zero memory
await using var reader = await cmd.ExecuteReaderAsync();
while (await reader.ReadAsync())
{
    await ProcessRow(reader);
}

// Dapper -- buffered by default
var all = await conn.QueryAsync<Project>(sql);  // loads ALL rows

// Dapper -- unbuffered streaming
var stream = conn.Query<Project>(sql, buffered: false);
foreach (var project in stream)
{
    await ProcessRow(project);
}
// Note: Query (not QueryAsync) with buffered: false. The async version
// does not support unbuffered. Use conn.QueryUnbufferedAsync in newer Dapper.

// EF Core -- streaming via AsAsyncEnumerable
await foreach (var project in dbContext.Projects.AsAsyncEnumerable())
{
    await ProcessRow(project);
}

// SqlDataAdapter -- NO streaming possible. Fill() loads everything.
```

### Feeding SqlBulkCopy

Only `SqlDataReader` can directly feed `SqlBulkCopy` without intermediate allocation:

```csharp
// SqlDataReader -> SqlBulkCopy (zero intermediate allocation)
await using var reader = await sourceCmd.ExecuteReaderAsync();
await bulkCopy.WriteToServerAsync(reader);

// Dapper result -> must materialize to DataTable or IDataReader wrapper
// EF Core result -> must materialize to list, then DataTable

// Custom IDataReader over any IEnumerable<T> (ObjectDataReader pattern):
using var objectReader = new ObjectDataReader<Project>(dapperResults);
await bulkCopy.WriteToServerAsync(objectReader);
```

## Common Patterns

### Decision Matrix

Use this to pick the right tool for each scenario:

| Scenario                          | Best Choice       | Why                                           |
|-----------------------------------|-------------------|-----------------------------------------------|
| ETL: read millions of rows        | SqlDataReader     | True streaming, minimal allocation             |
| ETL: bulk insert                  | SqlBulkCopy       | Orders of magnitude faster than INSERT         |
| ETL: read + transform + insert    | Reader + BulkCopy | Stream source -> transform -> bulk destination |
| Reporting query (< 10K rows)      | Dapper            | Clean mapping, fast, you control the SQL       |
| Stored procedure call             | Dapper            | Easy parameter handling, output params         |
| CRUD web API                      | EF Core           | Change tracking, migrations, LINQ              |
| Small lookup/reference data       | Dapper or Adapter | Adapter if legacy; Dapper if modern            |
| Dynamic SQL construction          | Dapper + SqlBuilder| Conditional WHERE clauses                     |
| Data migration scripts            | SqlDataReader     | Maximum control and streaming                  |
| Ad-hoc one-off queries            | Dapper            | Least ceremony for simple queries              |

### Performance Comparison (Approximate)

These numbers are relative, based on typical benchmarks reading 10,000 rows into
POCOs:

| Approach         | Time (relative) | Alloc (relative) | Notes                         |
|------------------|-----------------|------------------|-------------------------------|
| SqlDataReader    | 1.0x (baseline) | 1.0x             | Manual mapping                |
| Dapper           | 1.05-1.15x      | 1.1x             | IL-emitted mapper             |
| EF Core (no tracking) | 1.5-2.5x  | 2-3x             | LINQ translation overhead     |
| EF Core (tracking)    | 2.5-4.0x   | 3-5x             | + identity map + change detect|
| SqlDataAdapter   | 1.3-1.5x        | 3-5x             | DataTable boxing overhead     |

Key takeaway: for 100-row CRUD operations, the difference is negligible. For
1,000,000-row ETL pipelines, it is massive.

### Pattern: Hybrid Approach (EF Core for Schema, Dapper/ADO for Queries)

Many senior engineers use EF Core for migrations and schema management but Dapper
or raw ADO.NET for actual data access:

```csharp
// EF Core manages the schema
public class ProjectDbContext : DbContext
{
    public DbSet<Project> Projects => Set<Project>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Project>(e =>
        {
            e.ToTable("Projects");
            e.HasKey(p => p.ProjectId);
        });
    }
}

// Dapper handles the queries (using the same connection string)
public class ProjectRepository
{
    private readonly string _connStr;

    public ProjectRepository(string connStr) => _connStr = connStr;

    public async Task<IReadOnlyList<Project>> GetActiveProjectsAsync()
    {
        await using var conn = new SqlConnection(_connStr);
        return (await conn.QueryAsync<Project>(
            "SELECT * FROM Projects WHERE Status = @Status",
            new { Status = "Active" })).AsList();
    }
}
```

## Gotchas and Pitfalls

1. **Dapper's `QueryAsync` buffers everything by default.** If your query returns
   5 million rows, they all load into memory. Use `QueryUnbufferedAsync` or
   synchronous `Query` with `buffered: false`.

2. **EF Core change tracking on read-only queries.** Always use `.AsNoTracking()`
   for read-only queries. Change tracking adds significant overhead and memory
   for each entity.

3. **SqlDataAdapter.Fill() opens AND closes the connection.** If you already
   opened the connection, it leaves it open. If it was closed, it opens, fills,
   and closes. This implicit behavior causes confusion.

4. **Dapper's anonymous parameter types and SQL injection.** Dapper parameterizes
   correctly, but if you concatenate SQL strings before passing to Dapper, you
   still get SQL injection. Dapper does not make string concatenation safe.

5. **EF Core generates suboptimal SQL for complex queries.** Always check the
   generated SQL (via logging or `ToQueryString()`). For reporting queries with
   multiple joins and aggregations, hand-written SQL via Dapper often outperforms
   EF-generated SQL by 2-10x.

6. **Mixing Dapper and EF Core on the same DbContext connection.** Dapper can use
   `dbContext.Database.GetDbConnection()`, but be careful -- EF Core may have an
   open transaction or reader. Get a fresh connection instead.

7. **DataTable column types are loose.** `DataRow["Budget"]` returns `object`.
   Forgetting to check `DBNull.Value` before casting throws `InvalidCastException`.

8. **Dapper maps by column name (case-insensitive).** If your SQL column names do
   not match your POCO property names, use `AS` aliases or `[Column]` attributes.

## Performance Considerations

- **First-call overhead.** Dapper and EF Core both have first-call costs: Dapper
  generates IL mappers on first use; EF Core compiles expression trees. Subsequent
  calls are fast. For long-running pipelines, this is negligible. For cold-start
  Lambda/Azure Functions, it matters.

- **Allocation pressure in loops.** `SqlDataReader` with `GetInt32` / `GetString`
  avoids boxing. Dapper allocates a POCO per row. EF Core allocates a POCO plus
  change-tracking metadata. For GC-sensitive ETL, reader wins.

- **Parallelism.** None of these approaches is thread-safe on a single connection.
  For parallel ETL, use one connection per task with its own reader/Dapper call.

- **Compiled queries in EF Core.** Use `EF.CompileAsyncQuery` to avoid repeated
  LINQ compilation:

```csharp
private static readonly Func<ProjectDbContext, string, IAsyncEnumerable<Project>>
    GetByStatus = EF.CompileAsyncQuery(
        (ProjectDbContext ctx, string status) =>
            ctx.Projects.Where(p => p.Status == status));

// Usage -- no LINQ compilation overhead after first call
await foreach (var p in GetByStatus(dbContext, "Active"))
{
    // ...
}
```

- **Memory: materialized vs. streaming.**

| Approach           | 1M rows, 10 cols | Memory Pattern               |
|--------------------|-------------------|------------------------------|
| SqlDataReader      | ~1 row in memory  | Constant O(1)                |
| Dapper (buffered)  | ~1M POCOs         | Linear O(n)                  |
| Dapper (unbuffered)| ~1 POCO at a time | Constant O(1)                |
| EF Core (tracking) | ~1M POCOs + metadata | Linear O(n), high constant|
| EF Core (no tracking, streaming) | ~1 POCO at a time | O(1)      |
| DataTable          | ~1M DataRows + boxing | Linear O(n), highest     |

## BNBuilders Context

As a DE at BNBuilders, here is a practical guide to which tool to reach for:

- **Daily cost data sync from Sage/Procore to Azure SQL.** This is ETL with hundreds
  of thousands of rows. Use `SqlDataReader` for the source read and `SqlBulkCopy` for
  the destination write. Dapper and EF Core add overhead you do not need.

- **Project dashboard API endpoint.** Returns 50-200 projects. Use Dapper -- the SQL
  is simple, the mapping is automatic, and the performance is indistinguishable from
  raw ADO.NET at this scale.

- **Budget vs. Actual reporting query.** Complex multi-join query with aggregates.
  Write the SQL by hand, execute via Dapper. Do not let EF Core translate a complex
  LINQ expression into suboptimal SQL.

- **Internal CRUD tool for managing cost codes.** EF Core is perfect here. You get
  migrations, change tracking, and LINQ for simple CRUD operations. The volume is
  low (hundreds of cost codes, not millions).

- **Data migration from legacy database.** `SqlDataReader` streaming from source
  into `SqlBulkCopy` on destination. Possibly with a transform step in the middle
  using a custom `IDataReader` wrapper.

- **Power BI dataset pre-processing.** Stored procedure calls to build aggregation
  tables. Dapper or `SqlCommand` with `CommandType.StoredProcedure`.

**Rule of thumb at BNBuilders:**
- More than 100K rows? Raw ADO.NET.
- Less than 100K rows, read-only? Dapper.
- CRUD application? EF Core.
- Need both? Hybrid (EF for schema, Dapper for queries).

## Interview / Senior Dev Questions

1. **When would you choose SqlDataReader over Dapper?** When streaming is essential
   (millions of rows), when feeding SqlBulkCopy, or when you need
   `CommandBehavior.SequentialAccess` for large BLOB columns. Also in extremely
   hot paths where even Dapper's reflection overhead is measurable.

2. **What is the main risk of using EF Core for reporting queries?** EF Core
   translates LINQ to SQL, and the generated SQL can be inefficient for complex
   joins and aggregations. You lose control over query plans, and small LINQ
   changes can produce dramatically different SQL.

3. **How does Dapper achieve near-ADO.NET performance?** It emits IL code at runtime
   to map columns to properties, then caches the generated delegate. After the first
   call, the mapping is as fast as hand-written code.

4. **Can you use Dapper and EF Core in the same project?** Yes. A common pattern
   uses EF Core for schema migrations and Dapper for queries. Use separate
   `SqlConnection` instances (not the EF Core DbContext connection) for Dapper
   to avoid conflicting with EF's internal state.

5. **What is the memory profile of DataTable vs. List<T> from Dapper for 100K rows?**
   DataTable stores each cell as a boxed `object` in a `DataRow`, with additional
   metadata for change tracking and schema. A `List<T>` of POCOs from Dapper
   stores typed fields with no boxing. DataTable uses roughly 2-3x more memory.

## Quiz

### Question 1
Your ETL pipeline reads 2 million rows from a source SQL Server, applies a
transformation, and writes to a destination table. Which data access approach(es)
should you use and why?

<details>
<summary>Answer</summary>

Use `SqlDataReader` for the source (streaming, O(1) memory) and `SqlBulkCopy` for
the destination (fastest bulk insert). The reader can feed directly into
`SqlBulkCopy.WriteToServerAsync(reader)`, or if you need to transform rows, wrap
the transformation in a custom `IDataReader` implementation.

Do NOT use Dapper (buffers all 2M rows by default), EF Core (massive overhead for
bulk operations), or DataTable (buffers everything with boxing).
</details>

### Question 2
A colleague uses EF Core with change tracking enabled to generate a read-only
report with 50,000 rows. What is wrong and how do you fix it?

<details>
<summary>Answer</summary>

Change tracking allocates metadata for every entity and performs identity resolution,
roughly doubling memory usage and adding CPU overhead. For read-only queries, this
is pure waste.

Fix: Add `.AsNoTracking()` to the query, or better yet, use Dapper for reporting
queries where you control the SQL directly. For EF Core, also consider
`.AsNoTrackingWithIdentityResolution()` if you need deduplication but not change
tracking.
</details>

### Question 3
You call `conn.QueryAsync<Project>(sql)` with Dapper on a query that returns 5 million
rows. Your process runs out of memory. Why, and what is the fix?

<details>
<summary>Answer</summary>

`QueryAsync<Project>` (and `Query<Project>`) is buffered by default -- it materializes
all 5 million POCOs into a `List<Project>` in memory.

Fix: Use `conn.QueryUnbufferedAsync<Project>(sql)` which returns
`IAsyncEnumerable<Project>` and streams one row at a time. Alternatively, for this
volume, switch to `SqlDataReader` for true streaming with minimal overhead.
</details>

### Question 4
What is a "hybrid" EF Core + Dapper architecture, and when does it make sense?

<details>
<summary>Answer</summary>

Use EF Core for:
- Database migrations and schema management (`dotnet ef migrations add`).
- Simple CRUD operations in web APIs.
- Entity configuration and relationship modeling.

Use Dapper for:
- Complex reporting queries with hand-tuned SQL.
- High-performance read paths.
- Stored procedure calls.

This makes sense when your application has both CRUD and analytical/reporting
requirements, which is common in construction data platforms. You get EF Core's
developer productivity for CRUD and Dapper's performance and SQL control for
data-intensive operations.
</details>
