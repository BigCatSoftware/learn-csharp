# Async ADO.NET

*Chapter 11.7 — ADO.NET and Data Access*

## Overview

Every ADO.NET call that hits the network — opening a connection, executing a command,
reading rows — has an async counterpart. Using these correctly means your thread pool
stays healthy under load, your API endpoints stay responsive, and your ETL services
can process multiple data feeds concurrently without thread starvation.

This lesson covers every async method in the ADO.NET stack, proper
`CancellationToken` propagation, the `ConfigureAwait(false)` discipline for library
code, streaming results with `async IAsyncEnumerable<T>`, and the most common
mistakes that silently destroy your application's scalability.

## Core Concepts

### The Async Method Inventory

| Class | Async Method | What It Does |
|-------|-------------|-------------|
| `SqlConnection` | `OpenAsync(ct)` | Opens the connection asynchronously. Uses the thread pool to wait for the TCP handshake and login. |
| `SqlCommand` | `ExecuteReaderAsync(ct)` | Sends the command and returns a `SqlDataReader` without blocking. |
| `SqlCommand` | `ExecuteNonQueryAsync(ct)` | Executes INSERT/UPDATE/DELETE and returns the affected row count. |
| `SqlCommand` | `ExecuteScalarAsync(ct)` | Returns the first column of the first row. |
| `SqlCommand` | `ExecuteXmlReaderAsync(ct)` | Returns an `XmlReader` for FOR XML queries. |
| `SqlDataReader` | `ReadAsync(ct)` | Advances to the next row. |
| `SqlDataReader` | `NextResultAsync(ct)` | Advances to the next result set (for multi-statement batches). |
| `SqlDataReader` | `GetFieldValueAsync<T>(ordinal, ct)` | Reads a single column value asynchronously. Primarily useful for large values (e.g., `varbinary(max)`). |
| `SqlDataReader` | `IsDBNullAsync(ordinal, ct)` | Checks for NULL without reading the full value. |
| `DbConnection` | `BeginTransactionAsync(ct)` | Starts a transaction asynchronously (.NET 6+). |
| `DbTransaction` | `CommitAsync(ct)` | Commits asynchronously. |
| `DbTransaction` | `RollbackAsync(ct)` | Rolls back asynchronously. |

### CancellationToken Propagation

Every async method accepts an optional `CancellationToken`. When the token is
cancelled:

- `OpenAsync` — the connection attempt is abandoned.
- `ExecuteReaderAsync` — a TDS attention signal is sent to SQL Server, which cancels
  the running query.
- `ReadAsync` — reading stops, and the reader transitions to a closed state.

**Rule:** Accept a `CancellationToken` at your public API boundary and thread it
through every async call. Never swallow it.

### ConfigureAwait(false)

When you `await` an async method, the runtime captures the current
`SynchronizationContext` and resumes on it after completion. In a UI app, that means
the UI thread. In ASP.NET Core, there is no `SynchronizationContext`, so it is
a no-op — but library code cannot assume the caller's context.

**Rule for library code:** Always use `.ConfigureAwait(false)` on every `await` in
reusable data-access libraries. This prevents deadlocks when a caller with a
`SynchronizationContext` (e.g., WPF, legacy ASP.NET) blocks on your async method.

### async IAsyncEnumerable for Streaming

Starting with C# 8 and .NET Core 3.0, you can use `yield return` inside an `async`
method that returns `IAsyncEnumerable<T>`. This is perfect for streaming query results
without loading them all into memory.

## Code Examples

### Basic Async Query

```csharp
using Microsoft.Data.SqlClient;

public async Task<List<Project>> GetActiveProjectsAsync(
    string connectionString,
    CancellationToken ct = default)
{
    var projects = new List<Project>();

    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(ct).ConfigureAwait(false);

    await using var command = new SqlCommand(
        "SELECT ProjectId, ProjectName, Budget, Status FROM dbo.Projects WHERE IsActive = 1",
        connection);

    await using var reader = await command.ExecuteReaderAsync(ct).ConfigureAwait(false);

    while (await reader.ReadAsync(ct).ConfigureAwait(false))
    {
        projects.Add(new Project
        {
            ProjectId   = reader.GetInt32(0),
            ProjectName = reader.GetString(1),
            Budget      = reader.GetDecimal(2),
            Status      = reader.GetString(3)
        });
    }

    return projects;
}
```

### ExecuteNonQueryAsync with Transaction

```csharp
public async Task UpdateProjectBudgetAsync(
    int projectId,
    decimal newBudget,
    string connectionString,
    CancellationToken ct = default)
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(ct).ConfigureAwait(false);

    await using var transaction = (SqlTransaction)
        await connection.BeginTransactionAsync(ct).ConfigureAwait(false);

    try
    {
        await using var command = new SqlCommand(
            @"UPDATE dbo.Projects
              SET Budget = @Budget, ModifiedAt = SYSUTCDATETIME()
              WHERE ProjectId = @ProjectId",
            connection, transaction);

        command.Parameters.AddWithValue("@ProjectId", projectId);
        command.Parameters.AddWithValue("@Budget", newBudget);

        int rowsAffected = await command.ExecuteNonQueryAsync(ct).ConfigureAwait(false);

        if (rowsAffected == 0)
            throw new InvalidOperationException($"Project {projectId} not found.");

        await transaction.CommitAsync(ct).ConfigureAwait(false);
    }
    catch
    {
        await transaction.RollbackAsync(ct).ConfigureAwait(false);
        throw;
    }
}
```

### ExecuteScalarAsync

```csharp
public async Task<int> GetProjectCountAsync(
    string connectionString,
    CancellationToken ct = default)
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(ct).ConfigureAwait(false);

    await using var command = new SqlCommand(
        "SELECT COUNT(*) FROM dbo.Projects WHERE IsActive = 1",
        connection);

    var result = await command.ExecuteScalarAsync(ct).ConfigureAwait(false);
    return (int)result!;
}
```

### Streaming with IAsyncEnumerable

```csharp
public async IAsyncEnumerable<CostCode> StreamCostCodesAsync(
    string connectionString,
    [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(ct).ConfigureAwait(false);

    await using var command = new SqlCommand(
        "SELECT Code, Description, Category FROM dbo.CostCodes ORDER BY Code",
        connection);

    // CommandBehavior.SequentialAccess is critical for large-column streaming
    await using var reader = await command
        .ExecuteReaderAsync(CommandBehavior.SequentialAccess, ct)
        .ConfigureAwait(false);

    while (await reader.ReadAsync(ct).ConfigureAwait(false))
    {
        yield return new CostCode
        {
            Code        = reader.GetString(0),
            Description = reader.GetString(1),
            Category    = reader.GetString(2)
        };
    }
}
```

Consuming the stream:

```csharp
await foreach (var costCode in repo.StreamCostCodesAsync(connStr, ct))
{
    // Process one row at a time — no full materialization
    await ProcessCostCodeAsync(costCode, ct);
}
```

### Multiple Result Sets with NextResultAsync

```csharp
public async Task<(List<Project> Projects, List<CostCode> CostCodes)>
    GetProjectsAndCostCodesAsync(
        string connectionString,
        CancellationToken ct = default)
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(ct).ConfigureAwait(false);

    await using var command = new SqlCommand(
        @"SELECT ProjectId, ProjectName FROM dbo.Projects WHERE IsActive = 1;
          SELECT Code, Description FROM dbo.CostCodes;",
        connection);

    await using var reader = await command.ExecuteReaderAsync(ct).ConfigureAwait(false);

    // First result set: Projects
    var projects = new List<Project>();
    while (await reader.ReadAsync(ct).ConfigureAwait(false))
    {
        projects.Add(new Project
        {
            ProjectId = reader.GetInt32(0),
            ProjectName = reader.GetString(1)
        });
    }

    // Advance to second result set
    await reader.NextResultAsync(ct).ConfigureAwait(false);

    // Second result set: CostCodes
    var costCodes = new List<CostCode>();
    while (await reader.ReadAsync(ct).ConfigureAwait(false))
    {
        costCodes.Add(new CostCode
        {
            Code = reader.GetString(0),
            Description = reader.GetString(1)
        });
    }

    return (projects, costCodes);
}
```

### GetFieldValueAsync for Large Binary Data

```csharp
public async Task<byte[]> GetDocumentContentAsync(
    int documentId,
    string connectionString,
    CancellationToken ct = default)
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(ct).ConfigureAwait(false);

    await using var command = new SqlCommand(
        "SELECT Content FROM dbo.ProjectDocuments WHERE DocumentId = @Id",
        connection);

    command.Parameters.AddWithValue("@Id", documentId);

    await using var reader = await command
        .ExecuteReaderAsync(CommandBehavior.SequentialAccess, ct)
        .ConfigureAwait(false);

    if (!await reader.ReadAsync(ct).ConfigureAwait(false))
        throw new InvalidOperationException($"Document {documentId} not found.");

    // GetFieldValueAsync avoids loading the entire blob synchronously
    return await reader.GetFieldValueAsync<byte[]>(0, ct).ConfigureAwait(false);
}
```

## Common Patterns

### Repository Method Template

Every async data-access method should follow this skeleton:

```csharp
public async Task<T> DoSomethingAsync(
    /* parameters */,
    CancellationToken ct = default)  // Always accept a token
{
    await using var connection = new SqlConnection(_connectionString);
    await connection.OpenAsync(ct).ConfigureAwait(false);

    await using var command = new SqlCommand(sql, connection);
    // Add parameters...

    // Execute and return...
}
```

### Parallel Independent Queries

```csharp
public async Task<DashboardData> GetDashboardAsync(
    string connStr, CancellationToken ct = default)
{
    // Fire all three queries concurrently — each gets its own connection
    var projectsTask = GetActiveProjectsAsync(connStr, ct);
    var costCodesTask = GetCostCodeCountAsync(connStr, ct);
    var recentInvoicesTask = GetRecentInvoicesAsync(connStr, ct);

    await Task.WhenAll(projectsTask, costCodesTask, recentInvoicesTask)
        .ConfigureAwait(false);

    return new DashboardData
    {
        Projects = projectsTask.Result,
        CostCodeCount = costCodesTask.Result,
        RecentInvoices = recentInvoicesTask.Result
    };
}
```

## Gotchas and Pitfalls

1. **Sync-over-async (the deadlock factory).** Calling `.Result` or `.Wait()` on an
   async method from a thread with a `SynchronizationContext` causes a deadlock. The
   async continuation is waiting to resume on the captured context, which is blocked
   by your `.Result` call. Always go **async all the way**.

   ```csharp
   // BAD — deadlocks in ASP.NET (classic) or WPF
   var projects = GetActiveProjectsAsync(connStr).Result;

   // GOOD
   var projects = await GetActiveProjectsAsync(connStr);
   ```

2. **Forgetting ConfigureAwait(false) in library code.** If your data-access library
   is consumed by a WPF app, a single missing `ConfigureAwait(false)` can deadlock
   the UI thread.

3. **Forgetting to pass the CancellationToken.** If you accept a token but forget to
   pass it to `ExecuteReaderAsync`, the user's cancellation request is silently
   ignored and the query runs to completion.

4. **Disposing the connection before the reader is done.** The reader depends on the
   open connection. Use `await using` on both and ensure the reader's scope is inside
   the connection's scope.

5. **Using `Task.Run` to fake async.** Wrapping synchronous ADO.NET calls in
   `Task.Run` does not make them truly async — it just offloads work to a thread pool
   thread. Use the real async methods.

   ```csharp
   // BAD — fake async, wastes a thread pool thread
   var result = await Task.Run(() => command.ExecuteReader());

   // GOOD — truly async, no thread blocked during I/O
   var result = await command.ExecuteReaderAsync(ct);
   ```

6. **Not awaiting DisposeAsync.** Forgetting the `await` on `DisposeAsync()` (or
   forgetting `await using`) can leave connections open.

7. **Catching the wrong exception for cancellation.** Cancellation via
   `CancellationToken` can throw either `OperationCanceledException` or `SqlException`
   depending on timing. Handle both.

## Performance Considerations

- **Connection pool sizing.** Async code can initiate many concurrent operations. If
  you fire 100 parallel queries, you need 100 connections. Set `Max Pool Size` in
  your connection string to match your concurrency level. Default is 100.

- **CommandBehavior.SequentialAccess.** When reading large columns (blobs, long
  strings), use `SequentialAccess` to stream column data without buffering the entire
  value in the TDS packet.

- **Avoid over-parallelism.** `Task.WhenAll` on 50 queries means 50 connections.
  Use `SemaphoreSlim` or `Parallel.ForEachAsync` with `MaxDegreeOfParallelism` to
  throttle.

  ```csharp
  var semaphore = new SemaphoreSlim(10); // max 10 concurrent

  var tasks = projectIds.Select(async id =>
  {
      await semaphore.WaitAsync(ct);
      try
      {
          return await GetProjectDetailsAsync(id, connStr, ct);
      }
      finally
      {
          semaphore.Release();
      }
  });

  var results = await Task.WhenAll(tasks);
  ```

- **Packet size tuning.** The default TDS packet size is 4096 bytes. For bulk reads,
  increasing `Packet Size=8192` in the connection string can reduce round trips.

## BNBuilders Context

As a Data Engineer at BNBuilders:

- **ETL pipelines:** Your nightly Sage-to-Azure-SQL sync runs as a hosted service. All
  data access must be async to avoid starving the thread pool. A sync call buried deep
  in the pipeline could cause the service to hang under load.

- **Data migration jobs:** When migrating historical project data from the legacy
  on-prem system to Azure SQL, you run parallel streams for each project year. Each
  stream is an `IAsyncEnumerable` that reads from the source and feeds into
  `SqlBulkCopy`. `CancellationToken` lets ops cancel a long migration gracefully.

- **Power BI gateway refreshes:** The gateway's data source calls your API endpoints.
  If those endpoints use sync ADO.NET, the gateway's limited thread pool saturates
  quickly. Async endpoints keep throughput high.

- **Azure Functions:** Consumption-plan Functions have limited concurrency. Async data
  access is essential to handle multiple triggers without running out of threads.

- **Cancellation in long reports:** Finance requests a report spanning all projects
  across five years. If they navigate away, the `CancellationToken` (linked to the
  HTTP request's `RequestAborted`) cancels the SQL query, freeing server resources.

## Interview / Senior Dev Questions

1. **Q: What happens if you call `.Result` on an async method from the UI thread in a
   WPF app?**
   A: Deadlock. The `await` captures the `SynchronizationContext` (the UI thread's
   dispatcher). The continuation needs the UI thread, but `.Result` is blocking it.

2. **Q: Why use `ConfigureAwait(false)` in a library but not in controller code?**
   A: Library code does not need to resume on the caller's context — it has no UI or
   `HttpContext` dependency. `ConfigureAwait(false)` avoids capturing the context,
   preventing deadlocks and slightly improving performance. Controller code may need
   the context for things like `HttpContext.Current` (classic ASP.NET).

3. **Q: How does `CancellationToken` actually stop a running SQL query?**
   A: The SqlClient sends a TDS attention token to SQL Server, which interrupts the
   running batch. SQL Server then sends back an attention acknowledgment. This is the
   same mechanism as clicking "Cancel Executing Query" in SSMS.

4. **Q: What is the difference between `IAsyncEnumerable` streaming and
   `ExecuteReaderAsync` with `ReadAsync` in a loop?**
   A: Functionally similar. `IAsyncEnumerable` adds a cleaner abstraction — the caller
   does `await foreach` and never sees the reader, connection, or command. It enables
   composition with LINQ-style operators (`System.Linq.Async`).

## Quiz

**1. You have a data-access library method that uses `await connection.OpenAsync()` (no `ConfigureAwait(false)`). A WPF app calls `var result = library.GetDataAsync().Result;`. What happens and why?**

<details>
<summary>Show Answer</summary>

Deadlock. The `await` in the library captures the WPF `SynchronizationContext` (the dispatcher thread). After `OpenAsync` completes, the continuation tries to resume on the dispatcher thread, but that thread is blocked by `.Result`. Neither can proceed. Adding `ConfigureAwait(false)` to the library's `await` would prevent this by not capturing the context.
</details>

**2. What is the `[EnumeratorCancellation]` attribute used for on a `CancellationToken` parameter in an `async IAsyncEnumerable<T>` method?**

<details>
<summary>Show Answer</summary>

It allows the `CancellationToken` passed via `WithCancellation()` on the `await foreach` to be forwarded to the method's `CancellationToken` parameter. Without it, the token from `WithCancellation()` is ignored and the method only sees the default token.
</details>

**3. You fire 200 parallel async queries with `Task.WhenAll`. Each opens its own connection. The connection string has `Max Pool Size=100` (default). What happens?**

<details>
<summary>Show Answer</summary>

The first 100 queries get connections from the pool. The remaining 100 block (asynchronously) waiting for a connection to be returned to the pool. If no connections become available within the connection timeout (default 15 seconds), those waiters throw an `InvalidOperationException` ("Timeout expired. The timeout period elapsed prior to obtaining a connection from the pool."). The fix: either increase `Max Pool Size` or throttle concurrency with a `SemaphoreSlim`.
</details>

**4. Why is wrapping a synchronous ADO.NET call in `Task.Run()` worse than using the native async method?**

<details>
<summary>Show Answer</summary>

`Task.Run()` offloads the work to a thread pool thread, which then blocks on the synchronous I/O call. You gain no thread pool efficiency — you just moved the blocking from the caller's thread to a pool thread. The native async methods (e.g., `ExecuteReaderAsync`) use I/O completion ports and do not block any thread during the network wait.
</details>
