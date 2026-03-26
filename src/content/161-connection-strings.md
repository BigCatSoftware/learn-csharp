# Connection Strings and Pooling

*Chapter 11.2 — ADO.NET and Data Access*

## Overview

A connection string is the single most important configuration value in any data
application. Get it wrong and you get cryptic errors, security vulnerabilities, or
silent performance degradation. Get it right and connection pooling handles the rest
transparently.

This lesson covers connection string anatomy, the `SqlConnectionStringBuilder` class,
every parameter you are likely to need, and the internals of connection pooling --
including how pools fragment and how to recover from pool exhaustion.

## Core Concepts

### Connection String Anatomy

A connection string is a semicolon-delimited set of key=value pairs:

```
Server=sql-prod.bnbuilders.com;Database=ProjectData;Integrated Security=True;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30
```

Rules:
- Keys are case-insensitive.
- Values with special characters (`;`, `=`, `'`) must be wrapped in single or double quotes.
- Whitespace around `=` and `;` is ignored.
- Many keys have synonyms (e.g., `Server` = `Data Source` = `Address`).

### Key Parameters Reference

| Parameter                    | Default     | Purpose                                                    |
|------------------------------|-------------|------------------------------------------------------------|
| `Server` / `Data Source`     | *(required)*| SQL Server host. Can include instance (`host\instance`) or port (`host,1433`). |
| `Database` / `Initial Catalog`| `master`   | Default database after connection.                         |
| `Integrated Security`        | `false`     | Use Windows auth. Set to `True` or `SSPI`.                 |
| `User ID`                    | *(none)*    | SQL login username (when not using Integrated Security).   |
| `Password`                   | *(none)*    | SQL login password.                                        |
| `Encrypt`                    | `Mandatory` | `Mandatory` (default in Microsoft.Data.SqlClient 4.0+), `Optional`, `Strict`. |
| `TrustServerCertificate`     | `false`     | Skip certificate validation. **Never `true` in production.**|
| `MultipleActiveResultSets`   | `false`     | Allow multiple open readers on one connection (MARS).      |
| `Connection Timeout`         | `15`        | Seconds to wait for `Open()` before throwing.              |
| `Command Timeout`            | `30`        | Default `SqlCommand.CommandTimeout` (overridable per cmd). |
| `Max Pool Size`              | `100`       | Maximum connections in this pool.                          |
| `Min Pool Size`              | `0`         | Minimum connections kept alive (even when idle).           |
| `Pooling`                    | `true`      | Enable/disable connection pooling.                         |
| `Application Name`          | `.Net SqlClient Data Provider` | Shows in `sys.dm_exec_sessions`. Set it!     |
| `Packet Size`                | `8000`      | Network packet size in bytes. Larger = fewer round trips for big data. |
| `Connect Retry Count`        | `1`         | Number of reconnection attempts on idle connection failure.|
| `Connect Retry Interval`     | `10`        | Seconds between retry attempts.                            |

### Encryption Defaults Changed

This is a critical breaking change. In `Microsoft.Data.SqlClient` 4.0+, `Encrypt`
defaults to `Mandatory` (previously `Optional` in `System.Data.SqlClient`). If your
SQL Server does not have a valid TLS certificate, connections will fail with:

```
A connection was successfully established with the server, but then an error occurred
during the pre-login handshake. (provider: SSL Provider, error: 31)
```

Solutions (in order of preference):
1. Install a valid certificate on SQL Server (the right fix).
2. Use `Encrypt=Optional` in dev/test only.
3. Use `TrustServerCertificate=True` in dev/test only.

### SqlConnectionStringBuilder

Never concatenate connection strings manually. Use the builder:

```csharp
var builder = new SqlConnectionStringBuilder
{
    DataSource = "sql-prod.bnbuilders.com",
    InitialCatalog = "ProjectData",
    IntegratedSecurity = true,
    Encrypt = SqlConnectionEncryptOption.Mandatory,
    TrustServerCertificate = false,
    ConnectTimeout = 30,
    MaxPoolSize = 200,
    MinPoolSize = 5,
    ApplicationName = "BNB-CostPipeline",
    MultipleActiveResultSets = false
};

string connectionString = builder.ConnectionString;
```

Benefits:
- Compile-time property names (no typos).
- Proper escaping of special characters in passwords.
- Easy to merge base strings with overrides.

```csharp
// Parse an existing string and modify it
var builder = new SqlConnectionStringBuilder(existingConnStr);
builder.ApplicationName = "BNB-ETL-Worker-03";
builder.MaxPoolSize = 50;
string modified = builder.ConnectionString;
```

## Code Examples

### Reading Connection Strings from Configuration

```csharp
// appsettings.json
// {
//   "ConnectionStrings": {
//     "ProjectDb": "Server=sql-prod;Database=ProjectData;Integrated Security=True;Encrypt=True;Application Name=BNB-Pipeline"
//   }
// }

// In Program.cs or Startup
var connStr = builder.Configuration.GetConnectionString("ProjectDb");
```

For sensitive values, use User Secrets in development and Azure Key Vault or
environment variables in production:

```csharp
// Environment variable override
var connStr = Environment.GetEnvironmentVariable("PROJECT_DB_CONN")
    ?? builder.Configuration.GetConnectionString("ProjectDb");
```

### Connection String per Project Database

```csharp
public class ProjectConnectionFactory
{
    private readonly string _baseConnectionString;

    public ProjectConnectionFactory(string baseConnectionString)
    {
        _baseConnectionString = baseConnectionString;
    }

    public SqlConnection CreateForProject(string projectDatabase)
    {
        var builder = new SqlConnectionStringBuilder(_baseConnectionString)
        {
            InitialCatalog = projectDatabase,
            ApplicationName = $"BNB-ETL-{projectDatabase}"
        };
        return new SqlConnection(builder.ConnectionString);
    }
}

// Usage
var factory = new ProjectConnectionFactory(baseConnStr);
await using var conn = factory.CreateForProject("BNB_SeattleOffice_2026");
await conn.OpenAsync();
```

### Testing Connection Validity

```csharp
public static async Task<(bool Success, string? Error)> TestConnectionAsync(
    string connectionString, CancellationToken ct = default)
{
    try
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        // Optionally verify with a lightweight query
        await using var cmd = new SqlCommand("SELECT 1", conn);
        await cmd.ExecuteScalarAsync(ct);

        return (true, null);
    }
    catch (SqlException ex)
    {
        return (false, $"SQL Error {ex.Number}: {ex.Message}");
    }
}
```

## Common Patterns

### Connection Pooling Internals

Connection pooling is automatic and transparent. Here is what happens:

1. **First `Open()` call** with a given connection string: a new **pool** is created
   and a physical TCP connection is established to SQL Server.

2. **Subsequent `Open()` calls** with the *exact same* connection string: a pooled
   connection is returned if one is available. If all pooled connections are in use
   and `Max Pool Size` has not been reached, a new physical connection is created.

3. **`Dispose()` / `Close()`**: the connection is returned to the pool (not destroyed).

4. **Pool idle timeout**: connections idle for 4-8 minutes are pruned by a background
   thread. `Min Pool Size` connections are always kept alive.

5. **Pool exhaustion**: if all `Max Pool Size` connections are in use and a new
   `Open()` is called, it blocks for up to `Connection Timeout` seconds, then throws.

**Critical rule: one pool per unique connection string.** Even a single character
difference (extra space, different `Application Name`) creates a separate pool.

```
Pool A: "Server=sql-prod;Database=ProjectData;App=ETL"     -> up to 100 connections
Pool B: "Server=sql-prod;Database=ProjectData;App=Reports"  -> up to 100 connections (separate pool!)
Pool C: "Server=sql-prod;Database=ProjectData ;App=ETL"     -> up to 100 connections (trailing space = new pool!)
```

### Pool Fragmentation

Pool fragmentation occurs when you have many distinct connection strings, each
creating its own pool. Common causes:

- Per-user connection strings (Integrated Security with impersonation).
- Dynamically generated connection strings with slight variations.
- Per-project databases with unique `Application Name` values (see the factory
  example above -- this is intentional but be aware of the pool cost).

Each pool reserves up to `Max Pool Size` physical connections. 50 distinct
connection strings x 100 max = 5,000 potential connections. SQL Server's default
max is 32,767, but your network and memory may not agree.

### ClearPool and ClearAllPools

When a connection becomes invalid (server restarted, failover, network blip), pooled
connections go stale. ADO.NET detects this on the next use and removes the bad
connection, but you can force it:

```csharp
// Clear a specific pool (connections matching this exact connection string)
SqlConnection.ClearPool(conn);

// Nuclear option: clear ALL pools in the AppDomain
SqlConnection.ClearAllPools();
```

Use `ClearPool` after a failover event. Use `ClearAllPools` during application
shutdown or after a catastrophic network event.

### Pattern: Health Check with Pool Monitoring

```csharp
public async Task<PoolHealthReport> CheckPoolHealthAsync(string connectionString)
{
    var sw = Stopwatch.StartNew();
    try
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync();

        // Query pool stats via DMV
        await using var cmd = new SqlCommand(@"
            SELECT
                COUNT(*) AS SessionCount,
                SUM(CASE WHEN status = 'sleeping' THEN 1 ELSE 0 END) AS IdleCount,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS ActiveCount
            FROM sys.dm_exec_sessions
            WHERE program_name = @appName
              AND is_user_process = 1", conn);
        cmd.Parameters.Add("@appName", SqlDbType.NVarChar, 128).Value =
            new SqlConnectionStringBuilder(connectionString).ApplicationName;

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new PoolHealthReport
            {
                IsHealthy = true,
                LatencyMs = sw.ElapsedMilliseconds,
                TotalSessions = reader.GetInt32(0),
                IdleSessions = reader.GetInt32(1),
                ActiveSessions = reader.GetInt32(2)
            };
        }
        return new PoolHealthReport { IsHealthy = true, LatencyMs = sw.ElapsedMilliseconds };
    }
    catch (Exception ex)
    {
        return new PoolHealthReport { IsHealthy = false, Error = ex.Message };
    }
}
```

## Gotchas and Pitfalls

1. **Connection string case sensitivity on values.** Keys are case-insensitive but
   some *values* are case-sensitive depending on the server collation. `Database=ProjectData`
   vs `Database=projectdata` may or may not work.

2. **Encrypt default changed.** Upgrading from `System.Data.SqlClient` to
   `Microsoft.Data.SqlClient` 4.0+ breaks connections if the server lacks a trusted
   certificate. This is the number-one migration headache.

3. **Trailing spaces create new pools.** `"Server=sql-prod "` and `"Server=sql-prod"`
   are different connection strings and get different pools.

4. **`Min Pool Size` > 0 keeps connections alive forever.** This means TCP connections
   remain open even when your app is idle. Good for latency; bad if you have hundreds
   of app instances.

5. **`Connection Timeout` vs `Command Timeout`.** Connection Timeout is for `Open()`.
   Command Timeout is for query execution. Confusing them is common.

6. **Storing passwords in connection strings in `appsettings.json`.** This file gets
   committed to source control. Use User Secrets, environment variables, or a vault.

7. **MARS (MultipleActiveResultSets) silently changes transaction behavior.** With
   MARS, each reader gets its own internal session. If you are inside a transaction
   and open a second reader, the behavior may surprise you. Prefer separate connections
   over MARS.

8. **Azure SQL Database does not support Integrated Security.** You must use SQL auth
   or Azure AD authentication (with `Authentication=Active Directory Default`).

## Performance Considerations

- **Set `Application Name` always.** It costs nothing and makes monitoring via
  `sys.dm_exec_sessions` trivial. You can see exactly which app is hogging connections.

- **Tune `Max Pool Size` for your workload.** Default 100 is fine for most apps. For
  a high-throughput ETL pipeline with many concurrent tasks, you might need 200-300.
  Monitor with `sys.dm_exec_connections`.

- **Set `Min Pool Size` for latency-sensitive apps.** Opening a fresh connection takes
  ~20-50ms (TCP handshake + TDS login). Pre-warming with `Min Pool Size = 5` avoids
  cold-start latency.

- **Use `Packet Size = 32767` for bulk data transfers.** Larger packets mean fewer
  network round trips. Only beneficial for large data movement, not OLTP.

- **Connection Resiliency.** Set `ConnectRetryCount=3` and `ConnectRetryInterval=10`
  for cloud/Azure deployments where transient failures are expected.

- **Pool exhaustion debugging.** If you suspect leaks, query:

```sql
SELECT
    program_name,
    login_name,
    COUNT(*) AS connections,
    SUM(CASE WHEN status = 'sleeping' THEN 1 ELSE 0 END) AS sleeping
FROM sys.dm_exec_sessions
WHERE is_user_process = 1
GROUP BY program_name, login_name
ORDER BY connections DESC;
```

## BNBuilders Context

At BNBuilders, you will typically manage multiple connection strings:

- **On-prem SQL Server** for legacy ERP/Sage data with Integrated Security (your
  Windows service account).
- **Azure SQL Database** for cloud-hosted project management data with Azure AD auth.
- **Multiple project databases** -- construction companies often have one database per
  major project or region.

Practical scenarios:

- **ETL pipeline config.** Store base connection strings in Azure Key Vault. At runtime,
  use `SqlConnectionStringBuilder` to swap in the target database name per project.
- **Connection pool sizing.** Your ETL workers run 8-16 parallel tasks. Set
  `Max Pool Size = 50` per worker, `Min Pool Size = 4` to pre-warm.
- **Application Name convention.** Use a pattern like `BNB-{ServiceName}-{Environment}`
  so DBAs can identify your connections: `BNB-CostSync-Prod`, `BNB-ReportRefresh-Dev`.
- **Failover handling.** If BNBuilders uses Always On Availability Groups, include
  `MultiSubnetFailover=True` in the connection string for faster failover detection.
- **Audit trail.** Setting `Application Name` and `Workstation ID` in the connection
  string lets the DBA team trace which pipeline step is generating load.

## Interview / Senior Dev Questions

1. **What determines the "identity" of a connection pool?** The exact connection string
   text. Two strings that differ by even one character (including whitespace) create
   separate pools.

2. **How would you diagnose connection pool exhaustion?** Check
   `sys.dm_exec_sessions` grouped by `program_name`. Look for many "sleeping"
   connections from your app, which indicates connections are not being disposed.
   Add logging around `Open` / `Dispose`. Consider a `Semaphore` to cap concurrency.

3. **Why is `TrustServerCertificate=True` dangerous in production?** It disables
   certificate validation, making the connection vulnerable to man-in-the-middle
   attacks. An attacker could intercept TDS traffic without the client noticing.

4. **Explain the difference between `Connection Timeout` and `Command Timeout`.**
   Connection Timeout controls how long `Open()` waits to establish a connection.
   Command Timeout controls how long a `SqlCommand` waits for query results. They
   are independent settings.

5. **What happens when `Max Pool Size` is reached and another `Open()` is called?**
   The call blocks (waits) for up to `Connection Timeout` seconds for a pooled
   connection to become available. If none is returned in time, it throws
   `InvalidOperationException` with the "timeout expired" message.

## Quiz

### Question 1
You upgrade a project from `System.Data.SqlClient` to `Microsoft.Data.SqlClient` 5.x
and connections start failing with an SSL error. What changed and what are your options?

<details>
<summary>Answer</summary>

`Microsoft.Data.SqlClient` 4.0+ defaults `Encrypt` to `Mandatory` (previously
`Optional`). Your SQL Server likely does not have a trusted TLS certificate.

Options (best to worst):
1. Install a valid TLS certificate on SQL Server.
2. Set `Encrypt=Optional` (dev/test only).
3. Set `TrustServerCertificate=True` (dev/test only).
</details>

### Question 2
Your ETL app has 20 parallel tasks, each opening its own `SqlConnection`. You see the
error: `Timeout expired. The timeout period elapsed prior to obtaining a connection
from the pool.` The connection string has default settings. What is the most likely
cause and fix?

<details>
<summary>Answer</summary>

Default `Max Pool Size` is 100, so 20 tasks should be fine -- unless connections are
not being disposed. The most likely cause is missing `using` / `await using` on
`SqlConnection` or `SqlDataReader` objects, causing connections to leak. Fix: ensure
all connections and readers are wrapped in `using` statements. Also check if any
task opens multiple connections without closing them.
</details>

### Question 3
Why does setting a unique `Application Name` per service matter for a Data Engineering
team?

<details>
<summary>Answer</summary>

It appears in `sys.dm_exec_sessions.program_name`, allowing DBAs and engineers to:
- Identify which service is consuming the most connections.
- Trace slow queries back to a specific pipeline.
- Monitor pool usage per application.
- Kill sessions for a specific misbehaving service without affecting others.

Without it, all .NET apps show as ".Net SqlClient Data Provider" and are
indistinguishable.
</details>

### Question 4
You have 30 project databases. Each ETL worker uses a `SqlConnectionStringBuilder` to
swap the `InitialCatalog` per project. How many connection pools are created, and what
is the risk?

<details>
<summary>Answer</summary>

30 connection pools are created (one per unique connection string). Each pool can hold
up to `Max Pool Size` connections (default 100). The risk is pool fragmentation: 30
pools x 100 max = 3,000 potential physical connections. If only a few projects are
active at a time, most pools sit idle but still hold their `Min Pool Size` connections
open. Mitigate by setting `Max Pool Size` to a lower value (e.g., 20) and
`Min Pool Size = 0` for infrequently accessed databases.
</details>
