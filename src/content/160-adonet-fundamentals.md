# ADO.NET Fundamentals

*Chapter 11.1 — ADO.NET and Data Access*

## Overview

ADO.NET is the foundational data access technology in .NET. It provides a set of classes
for connecting to databases, executing commands, and reading results. While higher-level
ORMs like Entity Framework Core build on top of ADO.NET, understanding the raw primitives
is essential for any Data Engineer working with SQL Server -- especially when performance,
control, and streaming matter more than convenience.

This lesson covers the four core classes you will use daily: `SqlConnection`,
`SqlCommand`, `SqlDataReader`, and `SqlDataAdapter`. We also cover the provider model
and the critical distinction between `Microsoft.Data.SqlClient` and
`System.Data.SqlClient`.

## Core Concepts

### The ADO.NET Object Model

ADO.NET operates in two modes:

1. **Connected mode** -- You hold a connection open, stream rows through a
   `SqlDataReader`, and process them one at a time. Low memory. Fast.
2. **Disconnected mode** -- You fill a `DataSet` or `DataTable` via a
   `SqlDataAdapter`, close the connection, and work with the in-memory copy.

For ETL pipelines, connected mode is almost always the right choice. For small
lookup tables or configuration data, disconnected mode is fine.

### Provider Model

ADO.NET uses an abstract provider model. The base classes live in `System.Data.Common`:

| Abstract Class          | SQL Server Implementation     |
|-------------------------|-------------------------------|
| `DbConnection`          | `SqlConnection`               |
| `DbCommand`             | `SqlCommand`                  |
| `DbDataReader`          | `SqlDataReader`               |
| `DbDataAdapter`         | `SqlDataAdapter`              |
| `DbParameter`           | `SqlParameter`                |
| `DbProviderFactory`     | `SqlClientFactory`            |

This means you can write provider-agnostic code if you program against the base classes.
In practice, most DE work targets SQL Server directly, so you use the `Sql*` classes.

### Microsoft.Data.SqlClient vs System.Data.SqlClient

This is a source of real confusion:

- **System.Data.SqlClient** -- The legacy provider. Ships with .NET Framework. Also
  available on .NET Core/5+ as a NuGet package, but receives only critical security fixes.
- **Microsoft.Data.SqlClient** -- The actively developed replacement. Ships as a NuGet
  package. Gets new features (Always Encrypted, Azure AD auth, etc.).

**Rule: Always use `Microsoft.Data.SqlClient` for new projects.** The namespace changes
from `System.Data.SqlClient` to `Microsoft.Data.SqlClient`, but the API surface is
nearly identical.

```csharp
// Old -- do not use for new projects
using System.Data.SqlClient;

// New -- use this
using Microsoft.Data.SqlClient;
```

Install via NuGet:

```bash
dotnet add package Microsoft.Data.SqlClient
```

## Code Examples

### SqlConnection -- Lifecycle and Disposal

A `SqlConnection` represents a physical (or pooled) connection to SQL Server.
Always wrap it in `using` or `await using` to guarantee disposal.

```csharp
using Microsoft.Data.SqlClient;

// Synchronous (avoid in async contexts)
using (var conn = new SqlConnection(connectionString))
{
    conn.Open();
    // ... work ...
}   // conn.Dispose() called here, returns connection to pool

// Async -- preferred in all modern code
await using var conn = new SqlConnection(connectionString);
await conn.OpenAsync(cancellationToken);
// ... work ...
// Disposed at end of scope
```

Key points:
- `Open()` / `OpenAsync()` pulls a connection from the pool (or creates one).
- `Dispose()` returns the connection to the pool. It does NOT close the TCP socket.
- Never cache or reuse a `SqlConnection` across threads. Create, open, use, dispose.

### SqlCommand -- The Four Execute Methods

```csharp
await using var conn = new SqlConnection(connectionString);
await conn.OpenAsync();

// --- ExecuteReader: returns rows ---
await using var cmd = new SqlCommand("SELECT ProjectId, Name FROM Projects", conn);
await using var reader = await cmd.ExecuteReaderAsync();
while (await reader.ReadAsync())
{
    var id = reader.GetInt32(0);
    var name = reader.GetString(1);
    Console.WriteLine($"{id}: {name}");
}

// --- ExecuteNonQuery: returns affected row count ---
var insertCmd = new SqlCommand(
    "INSERT INTO AuditLog (Message) VALUES (@msg)", conn);
insertCmd.Parameters.Add("@msg", SqlDbType.NVarChar, 500).Value = "Pipeline started";
int rowsAffected = await insertCmd.ExecuteNonQueryAsync();

// --- ExecuteScalar: returns first column of first row ---
var countCmd = new SqlCommand("SELECT COUNT(*) FROM Projects", conn);
int count = (int)(await countCmd.ExecuteScalarAsync())!;

// --- ExecuteXmlReader: returns XmlReader (SQL Server XML queries) ---
var xmlCmd = new SqlCommand("SELECT * FROM Projects FOR XML AUTO", conn);
using var xmlReader = await xmlCmd.ExecuteXmlReaderAsync();
```

### CommandType -- Text vs StoredProcedure vs TableDirect

```csharp
// Default: CommandType.Text -- raw SQL
var cmd1 = new SqlCommand("SELECT * FROM Projects WHERE Status = @s", conn);
cmd1.CommandType = CommandType.Text; // default, can omit

// Stored procedure
var cmd2 = new SqlCommand("dbo.usp_GetProjectsByStatus", conn);
cmd2.CommandType = CommandType.StoredProcedure;
cmd2.Parameters.Add("@Status", SqlDbType.NVarChar, 50).Value = "Active";

// TableDirect -- rarely used with SQL Server, more for OleDb
```

### SqlDataReader -- Forward-Only Streaming

`SqlDataReader` is the fastest way to read data from SQL Server. It streams rows
one at a time, keeping memory usage constant regardless of result set size.

```csharp
await using var reader = await cmd.ExecuteReaderAsync(
    CommandBehavior.CloseConnection | CommandBehavior.SequentialAccess);

// Cache ordinals for performance -- avoid calling GetOrdinal in the loop
int ordProjectId = reader.GetOrdinal("ProjectId");
int ordName = reader.GetOrdinal("Name");
int ordBudget = reader.GetOrdinal("Budget");
int ordCompletionDate = reader.GetOrdinal("CompletionDate");

while (await reader.ReadAsync())
{
    int projectId = reader.GetInt32(ordProjectId);
    string name = reader.GetString(ordName);

    // Handle NULLs -- two approaches
    // Approach 1: IsDBNull
    decimal? budget = reader.IsDBNull(ordBudget)
        ? null
        : reader.GetDecimal(ordBudget);

    // Approach 2: GetFieldValue<T> with nullable
    // Works in Microsoft.Data.SqlClient 4.0+
    DateTime? completionDate = reader.GetFieldValue<DateTime?>(ordCompletionDate);
}
```

**CommandBehavior flags worth knowing:**

| Flag                | Purpose                                           |
|---------------------|---------------------------------------------------|
| `CloseConnection`   | Closes connection when reader is disposed          |
| `SequentialAccess`  | Must read columns in order; enables streaming BLOBs|
| `SingleResult`      | Hint: only one result set                          |
| `SingleRow`         | Hint: only one row (optimizer hint)                |
| `SchemaOnly`        | Returns column metadata, no rows                   |

### SqlDataAdapter -- Disconnected Mode

```csharp
using var adapter = new SqlDataAdapter("SELECT * FROM CostCodes", conn);

// Fill a DataTable (disconnected copy)
var table = new DataTable();
adapter.Fill(table);

// Work with it in memory
foreach (DataRow row in table.Rows)
{
    Console.WriteLine(row["Code"] + ": " + row["Description"]);
}

// You can also fill a DataSet with multiple tables
var dataSet = new DataSet();
adapter.Fill(dataSet, "CostCodes");

// Update back to database (requires InsertCommand, UpdateCommand, DeleteCommand)
var builder = new SqlCommandBuilder(adapter);
// builder auto-generates INSERT/UPDATE/DELETE from the SELECT
adapter.Update(table);
```

**When to use `SqlDataAdapter`:**
- Small reference/lookup tables that fit in memory.
- Scenarios where you need to manipulate data in-memory before sending updates.
- Legacy code that uses `DataSet` / `DataTable`.

**When NOT to use it:**
- Large result sets (millions of rows). Use `SqlDataReader` instead.
- High-throughput ETL. The overhead of `DataTable` is significant.

## Common Patterns

### Pattern: Reusable Query Helper

```csharp
public static async Task<List<T>> QueryAsync<T>(
    string connectionString,
    string sql,
    Func<SqlDataReader, T> map,
    Action<SqlCommand>? configureParams = null,
    CancellationToken ct = default)
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync(ct);
    await using var cmd = new SqlCommand(sql, conn);
    configureParams?.Invoke(cmd);

    await using var reader = await cmd.ExecuteReaderAsync(ct);
    var results = new List<T>();
    while (await reader.ReadAsync(ct))
    {
        results.Add(map(reader));
    }
    return results;
}

// Usage
var projects = await QueryAsync(
    connStr,
    "SELECT ProjectId, Name FROM Projects WHERE Status = @s",
    r => new Project(r.GetInt32(0), r.GetString(1)),
    cmd => cmd.Parameters.Add("@s", SqlDbType.NVarChar, 50).Value = "Active");
```

### Pattern: Streaming Rows to Another Destination

```csharp
await using var sourceConn = new SqlConnection(sourceConnStr);
await sourceConn.OpenAsync();
await using var cmd = new SqlCommand("SELECT * FROM LargeTable", sourceConn);
await using var reader = await cmd.ExecuteReaderAsync();

await using var destConn = new SqlConnection(destConnStr);
await destConn.OpenAsync();
using var bulkCopy = new SqlBulkCopy(destConn);
bulkCopy.DestinationTableName = "LargeTable_Staging";

await bulkCopy.WriteToServerAsync(reader);
```

## Gotchas and Pitfalls

1. **Forgetting to dispose connections.** If you skip `using`, the connection leaks
   and the pool eventually exhausts. You will see `Timeout expired. The timeout period
   elapsed prior to obtaining a connection from the pool.`

2. **Calling `reader[columnName]` in a loop.** This does a dictionary lookup every
   iteration. Cache ordinals with `GetOrdinal` outside the loop.

3. **Using `ExecuteReader` without `await using`.** The reader holds the connection
   open. If you forget to dispose it, the connection is stuck.

4. **Mixing `System.Data.SqlClient` and `Microsoft.Data.SqlClient`.** They have
   identical class names but different namespaces. You will get confusing type
   mismatch errors at runtime.

5. **Assuming `ExecuteScalar` returns a non-null value.** It returns `DBNull.Value`
   (not C# `null`) when the SQL result is NULL, and returns C# `null` when the
   result set is empty.

6. **Not setting `CommandTimeout`.** Default is 30 seconds. Long ETL queries will
   time out. Set `cmd.CommandTimeout = 0` for infinite, or a reasonable value.

7. **Opening a connection and holding it for minutes.** Open late, close early.
   Do not open a connection at the start of a pipeline step and hold it while
   you do CPU-bound transformations.

## Performance Considerations

- **SqlDataReader** is the fastest path. It allocates almost nothing per row.
- **GetFieldValue<T>** avoids boxing for value types (vs `reader[i]` which returns
  `object`).
- **SequentialAccess** is critical for large columns (BLOB, NVARCHAR(MAX)). Without
  it, the entire row is buffered in memory.
- **Async all the way.** Use `OpenAsync`, `ExecuteReaderAsync`, `ReadAsync`. This
  frees the thread while waiting on network I/O.
- **Batch your commands.** Instead of 1,000 individual INSERTs, use `SqlBulkCopy`
  or table-valued parameters. One round-trip beats a thousand.
- **Connection pooling** is on by default. Creating/disposing `SqlConnection` is
  cheap because `Dispose` returns the connection to the pool (covered in lesson 161).

## BNBuilders Context

As a Data Engineer at BNBuilders (a Microsoft-shop construction company), you will
use ADO.NET directly in scenarios like:

- **ETL from Procore/Sage to SQL Server.** Pull data via API, stream it into staging
  tables using `SqlBulkCopy` fed by a `SqlDataReader` or `IDataReader` wrapper.
- **Cost code reconciliation.** Query budget vs actual from the ERP, process in C#,
  write deltas back. `SqlDataReader` for the read side; parameterized
  `ExecuteNonQuery` or `SqlBulkCopy` for the write side.
- **Azure Data Factory custom activities.** When ADF expressions are not enough,
  a .NET activity uses ADO.NET to talk to Azure SQL Database.
- **Power BI data refresh pre-processing.** A scheduled C# job runs stored
  procedures via `SqlCommand` with `CommandType.StoredProcedure` to build
  reporting aggregates before Power BI refreshes.
- **Connection management.** Construction projects have regional databases. You will
  manage multiple connection strings (one per project database) and must ensure
  connections are disposed properly to avoid pool exhaustion.

## Interview / Senior Dev Questions

1. **What happens if you forget to dispose a `SqlConnection`?** The connection is not
   returned to the pool. Eventually the pool reaches `Max Pool Size` and new
   `Open()` calls block, then throw a timeout exception.

2. **Why prefer `Microsoft.Data.SqlClient` over `System.Data.SqlClient`?** It is
   actively maintained, supports modern SQL Server features (Always Encrypted,
   Azure AD auth, TDS 8.0), and gets performance improvements.

3. **When would you use `SqlDataAdapter` over `SqlDataReader`?** When you need a
   disconnected in-memory copy of a small result set, or when you need two-way
   data binding (e.g., filling a grid and writing changes back).

4. **Explain `CommandBehavior.SequentialAccess`.** It requires you to read columns
   in order, but allows streaming large columns without buffering the entire row.
   Essential for BLOB/CLOB columns.

5. **What is the difference between `ExecuteScalar` returning `null` vs
   `DBNull.Value`?** `null` means the query returned zero rows. `DBNull.Value`
   means it returned a row where the first column's value is SQL NULL.

## Quiz

### Question 1
What does `SqlConnection.Dispose()` actually do when connection pooling is enabled?

<details>
<summary>Answer</summary>

It returns the underlying connection to the connection pool. It does NOT close the
TCP socket or destroy the physical connection. The pooled connection is available for
reuse by the next `Open()` call with the same connection string.
</details>

### Question 2
You are reading 10 million rows from a SQL query into a C# pipeline.
Which is the correct choice: `SqlDataReader` or `SqlDataAdapter.Fill(DataTable)`?

<details>
<summary>Answer</summary>

`SqlDataReader`. It streams rows one at a time with near-zero memory overhead.
`SqlDataAdapter.Fill()` would load all 10 million rows into a `DataTable` in memory,
likely causing an `OutOfMemoryException` or extreme GC pressure.
</details>

### Question 3
What is the default value of `SqlCommand.CommandTimeout`, and what value means
"wait forever"?

<details>
<summary>Answer</summary>

The default is **30 seconds**. Setting `CommandTimeout = 0` means infinite timeout
(wait forever). Note: this is separate from the connection timeout in the connection
string, which controls how long `Open()` waits.
</details>

### Question 4
You see this error: `InvalidOperationException: There is already an open DataReader
associated with this Connection which must be closed first.` What are two ways to fix it?

<details>
<summary>Answer</summary>

1. **Enable MARS** by adding `MultipleActiveResultSets=True` to the connection string.
   This allows multiple active readers on one connection.
2. **Use a separate connection** for the second query. This is often the better choice
   because MARS has performance overhead and subtle transaction semantics.
</details>

### Question 5
What is the purpose of `reader.GetOrdinal("ColumnName")` and why should you call it
outside your read loop?

<details>
<summary>Answer</summary>

`GetOrdinal` maps a column name to its zero-based index. Calling it outside the loop
caches the ordinal so you avoid a dictionary lookup on every row. For millions of rows,
this measurably reduces overhead compared to `reader["ColumnName"]`.
</details>
