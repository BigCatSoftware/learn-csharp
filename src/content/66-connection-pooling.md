# Connection Pooling

Opening a database connection is expensive — TCP handshake, TLS negotiation, authentication, and
protocol initialization. **Connection pooling** reuses open connections, turning a multi-hundred
millisecond operation into a sub-millisecond one.

---

## How ADO.NET Connection Pooling Works

When you call `SqlConnection.Open()`:

1. The pool manager hashes the connection string (exact match, case-sensitive).
2. If a matching idle connection exists, it is returned to you.
3. If no idle connection exists and the pool is not at capacity, a new connection is created.
4. If the pool is at capacity, the call blocks until a connection is returned or the timeout
   expires.

When you call `SqlConnection.Close()` (or `Dispose()`), the connection is not actually closed —
it is returned to the pool.

```csharp
// This does NOT create a new connection each time — the pool manages it
for (int i = 0; i < 10_000; i++)
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();
    // ... execute query
} // conn.Dispose() returns connection to pool
```

> **Important:** Connections are pooled per *unique connection string*. Even a single extra
> space in the connection string creates a separate pool. Normalize your connection strings.

---

## Connection String Keywords for Pooling

| Keyword | Default | Description |
|---|---|---|
| `Pooling` | `true` | Enable/disable pooling |
| `Min Pool Size` | `0` | Minimum connections kept open |
| `Max Pool Size` | `100` | Maximum connections allowed |
| `Connection Lifetime` | `0` (infinite) | Max age (seconds) before a connection is retired |
| `Connection Idle Timeout` | `300` | Seconds before an idle connection is closed |
| `Connect Timeout` | `15` | Seconds to wait for a pool connection |
| `Load Balance Timeout` | `0` | Minimum time (seconds) a connection lives in the pool |
| `Enlist` | `true` | Auto-enlist in ambient transactions |

```csharp
var connectionString = new SqlConnectionStringBuilder
{
    DataSource = "db-server.local",
    InitialCatalog = "ProductionDB",
    IntegratedSecurity = true,
    MinPoolSize = 5,
    MaxPoolSize = 50,
    ConnectTimeout = 30,
    Encrypt = true,
    TrustServerCertificate = false
}.ConnectionString;
```

> **Tip:** Set `Min Pool Size` to a small number (5-10) for services that need instant
> responsiveness. This keeps warm connections ready and avoids cold-start latency.

---

## Pool Fragmentation

Each unique connection string gets its own pool. Fragmentation happens when you vary connection
strings unnecessarily:

```csharp
// BAD: creates one pool per user — potentially thousands of pools
string connStr = $"Server=db;Database=app;User Id={username};Password={password};";

// GOOD: single pool, one connection string
string connStr = "Server=db;Database=app;User Id=app_service;Password=secret;";
// Use application-level authorization instead
```

Common causes of fragmentation:
- Per-user connection strings (use a single service account instead)
- Dynamic database names (pool per database)
- Inconsistent connection string formatting

> **Warning:** With 100 unique connection strings and `Max Pool Size = 100`, you could have
> 10,000 open connections. This can exhaust SQL Server's connection limit and cause widespread
> failures.

---

## Pool Exhaustion: Diagnosis and Fixes

Pool exhaustion occurs when all connections are in use and `Connect Timeout` expires:

```
Timeout expired. The timeout period elapsed prior to obtaining a connection from the pool.
This may have occurred because all pooled connections were in use and max pool size was reached.
```

### Common Causes

```csharp
// CAUSE 1: Forgetting to dispose connections
public async Task BadMethodAsync()
{
    var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();
    var cmd = new SqlCommand("SELECT 1", conn);
    await cmd.ExecuteScalarAsync();
    // conn is never closed — leaked back to the pool only when GC finalizes it
}

// FIX: Always use 'using' or 'await using'
public async Task GoodMethodAsync()
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();
    await using var cmd = new SqlCommand("SELECT 1", conn);
    await cmd.ExecuteScalarAsync();
} // conn returned to pool here
```

```csharp
// CAUSE 2: Long-running operations holding connections
public async Task AlsoBadAsync()
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();

    var data = await LoadDataAsync(conn);
    await SendEmailAsync(data);      // holds connection during email send!
    await LogResultAsync(conn, data);
}

// FIX: Release and re-acquire
public async Task AlsoGoodAsync()
{
    string data;
    await using (var conn = new SqlConnection(connectionString))
    {
        await conn.OpenAsync();
        data = await LoadDataAsync(conn);
    } // connection returned

    await SendEmailAsync(data);

    await using (var conn = new SqlConnection(connectionString))
    {
        await conn.OpenAsync();
        await LogResultAsync(conn, data);
    }
}
```

### Monitoring Pool Statistics

```csharp
// Query pool statistics via performance counters or connection events
public static void PrintPoolStats()
{
    // With Microsoft.Data.SqlClient, use SqlClientEventSource
    // Or query sys.dm_exec_connections on SQL Server:
    // SELECT * FROM sys.dm_exec_connections WHERE client_net_address = 'your-app-server'
}
```

---

## Clearing Pools

Sometimes you need to force-close all pooled connections (e.g., after a failover):

```csharp
// Clear all connections for a specific connection string
SqlConnection.ClearPool(connection);

// Clear ALL pools in the application domain
SqlConnection.ClearAllPools();
```

Use cases:
- Database failover — cached connections point to the old primary
- Connection string rotation (credential rotation)
- Integration tests — ensure clean state between tests

```csharp
[TestCleanup]
public void Cleanup()
{
    SqlConnection.ClearAllPools();
}
```

> **Caution:** `ClearAllPools()` closes every pooled connection immediately. In-flight queries
> on those connections will fail. Only call it when you know no operations are active.

---

## DbContext Pooling in EF Core

EF Core offers `DbContext` pooling to reuse not just the connection but the entire context object,
avoiding repeated setup costs:

```csharp
// In Program.cs or Startup
builder.Services.AddDbContextPool<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString, sql =>
    {
        sql.CommandTimeout(30);
        sql.EnableRetryOnFailure(3);
    });
}, poolSize: 128); // max pooled contexts
```

### How It Differs from Connection Pooling

| Feature | Connection Pooling | DbContext Pooling |
|---|---|---|
| What is pooled | Raw `SqlConnection` | `DbContext` instance |
| Managed by | ADO.NET (automatic) | EF Core's `IDbContextPool` |
| Configuration | Connection string keywords | `AddDbContextPool` |
| Benefit | Avoids TCP/TLS handshake | Avoids DbContext construction overhead |
| Stacks with | N/A | Uses connection pooling underneath |

```csharp
// DbContext pooling is transparent — inject as normal
public class OrderService
{
    private readonly AppDbContext _db;

    public OrderService(AppDbContext db) => _db = db;

    public async Task<Order?> GetOrderAsync(int id)
    {
        return await _db.Orders.FindAsync(id);
        // When the scope ends, the context is returned to the pool (reset, not disposed)
    }
}
```

> **Note:** DbContext pooling resets the context's change tracker and state when returning it to
> the pool. However, any custom fields you set on your DbContext subclass are *not* reset.
> Avoid storing per-request state on pooled DbContext instances.

---

## Best Practices for Long-Running Services

### 1. Keep Connections Short

```csharp
// Open late, close early
public async Task ProcessOrderAsync(Order order)
{
    // Do validation, business logic first (no connection needed)
    ValidateOrder(order);
    var enrichedOrder = await EnrichFromCacheAsync(order);

    // Only now open a connection
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();
    await SaveOrderAsync(conn, enrichedOrder);
    // Connection returned immediately
}
```

### 2. Handle Transient Failures

```csharp
public async Task<T> ExecuteWithRetryAsync<T>(Func<SqlConnection, Task<T>> action)
{
    for (int attempt = 0; attempt < 3; attempt++)
    {
        try
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            return await action(conn);
        }
        catch (SqlException ex) when (IsTransient(ex) && attempt < 2)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(100 * Math.Pow(2, attempt)));
        }
    }
    throw new InvalidOperationException("Unreachable");
}

private static bool IsTransient(SqlException ex)
    => ex.Number is 40613 or 40197 or 40501 or 49918 or -2;
```

### 3. Size the Pool for Your Workload

```
Max Pool Size >= Peak concurrent queries + Safety margin

Example: 20 concurrent API requests, each holding a connection for 50ms
  → At any instant, ~20 connections in use
  → Set Max Pool Size = 50 (buffer for spikes)
```

### 4. Monitor Actively

```csharp
// Query SQL Server to see connections from your app
// SELECT
//     login_name,
//     COUNT(*) AS ConnectionCount,
//     SUM(CASE WHEN r.status = 'running' THEN 1 ELSE 0 END) AS Active,
//     SUM(CASE WHEN r.status IS NULL THEN 1 ELSE 0 END) AS Idle
// FROM sys.dm_exec_sessions s
// LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
// WHERE s.is_user_process = 1
// GROUP BY login_name;
```

---

## Connection Pooling with Other Providers

| Provider | Pooling | Configuration |
|---|---|---|
| `Microsoft.Data.SqlClient` | Built-in | Connection string keywords |
| `Npgsql` (PostgreSQL) | Built-in | `MaxPoolSize`, `MinPoolSize`, `ConnectionIdleLifetime` |
| `MySqlConnector` (MySQL) | Built-in | `MaximumPoolSize`, `MinimumPoolSize` |
| `Oracle.ManagedDataAccess` | Built-in | `Min Pool Size`, `Max Pool Size`, `Connection Timeout` |

> **Tip:** Every major ADO.NET provider implements pooling. The keywords differ slightly, so
> always check the provider's documentation.

---

## Summary

| Concern | Recommendation |
|---|---|
| Enable pooling | Always (it is on by default) |
| Pool size | `Max Pool Size = 2x` expected peak concurrency |
| Connection lifetime | Hold connections as briefly as possible |
| Leaks | Always use `using`/`await using` |
| Fragmentation | One connection string per target database |
| EF Core | Use `AddDbContextPool` for high-throughput services |
| Monitoring | Query `sys.dm_exec_sessions` regularly |
| Failover | Call `ClearPool()` after detecting a failover |
