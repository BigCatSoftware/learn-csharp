# Connection Resilience and Retry Policies

*Chapter 11.9 — ADO.NET and Data Access*

## Overview

Database connections fail. Networks hiccup. Azure SQL throttles. SQL Server restarts
for patching. A transaction log fills up momentarily. These are **transient faults** —
errors that resolve themselves if you simply wait and try again.

Without retry logic, a single transient fault in your nightly ETL pipeline means a
failed load, a 3 AM alert, and a bleary-eyed data engineer restarting the job
manually. With proper resilience policies, the pipeline retries transparently and you
sleep through the night.

This lesson covers identifying transient SQL errors, the built-in retry provider in
`Microsoft.Data.SqlClient`, Polly-based resilience patterns, exponential backoff with
jitter, circuit breakers, and connection string settings that help.

## Core Concepts

### Transient vs Permanent Faults

| Transient (Retry) | Permanent (Do Not Retry) |
|-------------------|-------------------------|
| Network timeout | Invalid object name (bad table) |
| Login failed due to throttle | Login failed due to wrong password |
| Resource busy / deadlock victim | Constraint violation |
| TDS connection lost | Syntax error |
| SQL Azure DTU throttling | Permission denied |

### Identifying Retriable SqlExceptions

Every `SqlException` has a `Number` property corresponding to a SQL Server error code.
Key transient error numbers:

| Error Number | Meaning |
|-------------|---------|
| -2 | Timeout expired |
| 20 | Instance does not support encryption |
| 64 | Connection was successfully established but then lost |
| 233 | Connection attempt failed (named pipes/TCP) |
| 10053 | Transport-level error (software abort) |
| 10054 | Transport-level error (connection reset by peer) |
| 10060 | Network connect timeout |
| 40143 | Connection throttled (Azure SQL) |
| 40197 | Service error processing request (Azure SQL) |
| 40501 | Service busy (Azure SQL) |
| 40540 | Database has reached its size quota (Azure SQL) |
| 40613 | Database not currently available (Azure SQL) |
| 49918 | Not enough resources to process request (Azure SQL) |
| 49919 | Cannot create or update request (Azure SQL) |
| 49920 | Too many requests (Azure SQL) |
| 1205 | Deadlock victim |
| 3960 | Snapshot isolation conflict |

### Retry Strategy Components

1. **Identification:** Is this error transient?
2. **Delay:** How long to wait before retrying.
3. **Max retries:** When to give up.
4. **Backoff:** Increasing delays — linear, exponential, or exponential with jitter.
5. **Circuit breaking:** Stop retrying entirely if the system is clearly down.

### Exponential Backoff with Jitter

Pure exponential backoff (1s, 2s, 4s, 8s) causes **thundering herd** — all failed
clients retry at the same intervals, creating synchronized spikes. Adding jitter
(randomized variation) spreads retries across time.

```
delay = min(maxDelay, baseDelay * 2^attempt) + random(0, jitterMs)
```

## Code Examples

### Built-in SqlClient Retry Logic (.NET 6+)

`Microsoft.Data.SqlClient` 3.0+ includes a configurable retry provider.

```csharp
using Microsoft.Data.SqlClient;

public static class SqlRetryConfiguration
{
    public static void ConfigureGlobalRetry()
    {
        // Create a retry logic provider with:
        //   - 5 max retries
        //   - 1 second initial delay
        //   - 30 second max delay
        //   - Authorized SQL errors to retry on
        var retryLogic = SqlConfigurableRetryFactory.CreateExponentialRetryProvider(
            new SqlRetryLogicOption
            {
                NumberOfTries = 5,
                DeltaTime = TimeSpan.FromSeconds(1),
                MaxTimeInterval = TimeSpan.FromSeconds(30),
                TransientErrors = new[]
                {
                    -2, 64, 233, 10053, 10054, 10060,
                    40143, 40197, 40501, 40613,
                    49918, 49919, 49920, 1205
                }
            });

        // Apply to connections globally
        SqlConnection connection = new SqlConnection(connectionString);
        connection.RetryLogicProvider = retryLogic;

        // Apply to commands individually
        SqlCommand command = new SqlCommand();
        command.RetryLogicProvider =
            SqlConfigurableRetryFactory.CreateExponentialRetryProvider(
                new SqlRetryLogicOption
                {
                    NumberOfTries = 3,
                    DeltaTime = TimeSpan.FromMilliseconds(500),
                    MaxTimeInterval = TimeSpan.FromSeconds(10),
                    TransientErrors = new[] { -2, 1205, 40501, 40613 }
                });
    }
}
```

### Configuring Retry via AppContext (Global Switch)

```csharp
// In Program.cs — enables configurable retry logic globally
AppContext.SetSwitch("Switch.Microsoft.Data.SqlClient.EnableRetryLogic", true);
```

### Manual Retry Loop (Foundation Pattern)

```csharp
public static class RetryHelper
{
    private static readonly HashSet<int> TransientErrors = new()
    {
        -2, 64, 233, 1205, 10053, 10054, 10060,
        40143, 40197, 40501, 40613, 49918, 49919, 49920
    };

    public static bool IsTransient(SqlException ex)
    {
        foreach (SqlError error in ex.Errors)
        {
            if (TransientErrors.Contains(error.Number))
                return true;
        }
        return false;
    }

    public static async Task<T> ExecuteWithRetryAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        int maxRetries = 3,
        CancellationToken ct = default)
    {
        var random = new Random();

        for (int attempt = 0; ; attempt++)
        {
            try
            {
                return await operation(ct).ConfigureAwait(false);
            }
            catch (SqlException ex) when (attempt < maxRetries && IsTransient(ex))
            {
                // Exponential backoff with jitter
                int baseDelayMs = (int)(Math.Pow(2, attempt) * 1000);
                int jitter = random.Next(0, 500);
                int delayMs = Math.Min(baseDelayMs + jitter, 30_000);

                Console.WriteLine(
                    $"Transient error {ex.Number} on attempt {attempt + 1}/{maxRetries + 1}. " +
                    $"Retrying in {delayMs}ms...");

                await Task.Delay(delayMs, ct).ConfigureAwait(false);
            }
            // Non-transient exceptions propagate immediately
        }
    }
}
```

### Polly V8 Resilience Pipeline

```csharp
using Polly;
using Microsoft.Data.SqlClient;

public static class ResiliencePipelines
{
    public static readonly ResiliencePipeline SqlPipeline = new ResiliencePipelineBuilder()
        .AddRetry(new Polly.Retry.RetryStrategyOptions
        {
            ShouldHandle = new PredicateBuilder()
                .Handle<SqlException>(ex => RetryHelper.IsTransient(ex))
                .Handle<TimeoutException>(),
            MaxRetryAttempts = 5,
            Delay = TimeSpan.FromSeconds(1),
            BackoffType = DelayBackoffType.ExponentialWithJitter,
            OnRetry = args =>
            {
                Console.WriteLine(
                    $"Retry {args.AttemptNumber} after {args.RetryDelay.TotalSeconds:F1}s");
                return ValueTask.CompletedTask;
            }
        })
        .AddCircuitBreaker(new Polly.CircuitBreaker.CircuitBreakerStrategyOptions
        {
            ShouldHandle = new PredicateBuilder()
                .Handle<SqlException>(ex => RetryHelper.IsTransient(ex)),
            FailureRatio = 0.5,
            SamplingDuration = TimeSpan.FromSeconds(30),
            MinimumThroughput = 10,
            BreakDuration = TimeSpan.FromSeconds(60),
            OnOpened = args =>
            {
                Console.WriteLine("Circuit OPEN — stopping calls for 60s");
                return ValueTask.CompletedTask;
            },
            OnClosed = args =>
            {
                Console.WriteLine("Circuit CLOSED — resuming normal operations");
                return ValueTask.CompletedTask;
            }
        })
        .AddTimeout(TimeSpan.FromSeconds(120))
        .Build();
}
```

Usage:

```csharp
var projects = await ResiliencePipelines.SqlPipeline.ExecuteAsync(async ct =>
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync(ct);
    return await conn.QueryAsync<Project>("SELECT * FROM dbo.Projects");
}, cancellationToken);
```

### Circuit Breaker Explained

```
CLOSED ──(failures exceed threshold)──> OPEN
  ^                                       │
  │                                       │ (break duration expires)
  │                                       v
  └────(test call succeeds)──── HALF-OPEN
                                    │
                            (test call fails)
                                    │
                                    v
                                  OPEN
```

- **CLOSED:** Normal operation. Calls pass through.
- **OPEN:** All calls fail immediately without hitting the database. Protects a
  struggling server from more load.
- **HALF-OPEN:** After the break duration, one test call is allowed. If it succeeds,
  the circuit closes. If it fails, the circuit reopens.

### Connection String Resilience Settings

| Setting | Default | Recommendation |
|---------|---------|---------------|
| `Connect Timeout` | 15s | 30s for Azure SQL |
| `Command Timeout` | 30s | 120s+ for ETL queries |
| `Connection Lifetime` | 0 (infinite) | 300s — forces recycling, helps with failovers |
| `Max Pool Size` | 100 | Match your max concurrency |
| `Min Pool Size` | 0 | 5-10 — keeps warm connections ready |

## Common Patterns

### Retry-Aware Repository Base Class

```csharp
public abstract class ResilientRepositoryBase
{
    private readonly string _connectionString;
    private readonly ResiliencePipeline _pipeline;

    protected ResilientRepositoryBase(
        string connectionString, ResiliencePipeline pipeline)
    {
        _connectionString = connectionString;
        _pipeline = pipeline;
    }

    protected async Task<T> ExecuteAsync<T>(
        Func<SqlConnection, CancellationToken, Task<T>> operation,
        CancellationToken ct = default)
    {
        return await _pipeline.ExecuteAsync(async token =>
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync(token);
            return await operation(connection, token);
        }, ct);
    }

    protected async Task ExecuteAsync(
        Func<SqlConnection, CancellationToken, Task> operation,
        CancellationToken ct = default)
    {
        await _pipeline.ExecuteAsync(async token =>
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync(token);
            await operation(connection, token);
        }, ct);
    }
}

// Concrete repository
public class ProjectRepository : ResilientRepositoryBase
{
    public ProjectRepository(string connStr, ResiliencePipeline pipeline)
        : base(connStr, pipeline) { }

    public Task<List<Project>> GetActiveAsync(CancellationToken ct = default)
    {
        return ExecuteAsync(async (conn, token) =>
        {
            var results = await conn.QueryAsync<Project>(
                "SELECT ProjectId, ProjectName FROM dbo.Projects WHERE IsActive = 1");
            return results.AsList();
        }, ct);
    }
}
```

### Idempotency for Retries

Retries mean the same operation might execute more than once. For writes, this is
dangerous unless your operations are **idempotent**.

```sql
-- NOT idempotent — retrying inserts a duplicate
INSERT INTO dbo.CostCodes (Code, Description) VALUES ('01-100', 'General Conditions');

-- Idempotent — safe to retry
MERGE dbo.CostCodes AS target
USING (VALUES ('01-100', 'General Conditions')) AS source (Code, Description)
    ON target.Code = source.Code
WHEN NOT MATCHED THEN INSERT (Code, Description) VALUES (source.Code, source.Description)
WHEN MATCHED THEN UPDATE SET Description = source.Description;
```

## Gotchas and Pitfalls

1. **Retrying non-idempotent writes.** If your INSERT succeeds but the response is
   lost (network issue), the retry inserts a duplicate. Use MERGE, upsert patterns,
   or idempotency keys.

2. **Retrying inside a transaction.** If the transaction itself is the unit of retry,
   you must retry the *entire* transaction, not individual statements. A failed
   connection inside a transaction invalidates the whole transaction.

3. **Deadlock retries without limits.** Error 1205 (deadlock victim) is transient, but
   if two processes deadlock repeatedly, infinite retries make it worse. Cap retries.

4. **Not distinguishing transient from permanent.** Retrying a permission error
   (`DENY`) or a syntax error wastes time and fills logs.

5. **Forgetting connection pool recovery.** After a transient failure, the connection
   pool may contain stale connections. `Connection Lifetime` in the connection string
   forces recycling.

6. **Circuit breaker thresholds too aggressive.** Opening the circuit after 2 failures
   in 5 seconds means a single slow moment trips the breaker. Use reasonable
   thresholds (e.g., 50% failure ratio over 30 seconds with a minimum of 10 calls).

7. **Logging every retry at ERROR level.** Transient faults are expected. Log retries
   at WARN level. Only log the final failure at ERROR.

8. **No jitter on backoff.** Pure exponential backoff without jitter causes all
   retrying clients to hit the server simultaneously. Always add randomized jitter.

## Performance Considerations

- **Connection pool warm-up.** Set `Min Pool Size` to avoid cold-start latency. When
  your ETL service starts, the first N connections must be established from scratch.

- **Retry overhead.** Each retry involves a new connection open, TLS handshake
  (for Azure SQL), and query execution. The delay between retries dominates the
  overhead — this is by design.

- **Circuit breaker prevents cascade failure.** Without a circuit breaker, a failing
  database causes all application threads to pile up waiting for timeouts. The circuit
  breaker fails fast, keeping the thread pool healthy.

- **Keep timeouts shorter than retry budgets.** If `Connect Timeout = 30s` and you
  retry 5 times, the worst case is 150s of connection timeouts plus backoff delays.
  Ensure your overall operation timeout accounts for this.

- **Azure SQL DTU throttling.** Azure SQL on the DTU model (Basic, Standard, Premium)
  throttles connections and CPU. If you see error 49920, you are hitting the limit.
  Retrying helps, but the root fix is scaling up or optimizing queries.

## BNBuilders Context

As a Data Engineer at BNBuilders:

- **Azure SQL is your production database.** Azure SQL has a higher rate of transient
  faults than on-prem — failovers, patching, throttling. Retry logic is not optional;
  it is a requirement.

- **Nightly ETL pipelines.** The Sage-to-Azure-SQL sync runs at 2 AM. Without retries,
  a brief Azure maintenance window at 2:15 AM kills the pipeline. With a 5-retry
  exponential backoff, the pipeline pauses for ~30 seconds and continues.

- **Data migration from on-prem.** Migrating historical data from the legacy SQL
  Server takes hours. A single dropped connection without retry means starting over.
  The circuit breaker protects against sustained outages — if the source server is
  down for maintenance, the circuit opens and the job fails fast instead of retrying
  for hours.

- **Power BI refresh resilience.** The DirectQuery endpoints backing Power BI
  dashboards need retry logic so a transient error does not show users a broken
  dashboard. The circuit breaker prevents a failing database from eating all the
  gateway's threads.

- **Multi-region failover.** BNBuilders may use Azure SQL failover groups. During
  failover, connections fail for 30-60 seconds. Retry with long enough backoff rides
  through the failover transparently.

## Interview / Senior Dev Questions

1. **Q: You have a retry policy with 5 retries and exponential backoff. A permanent
   error (syntax error) occurs. What happens?**
   A: If your retry predicate only matches transient errors, the permanent error
   propagates immediately without any retries. If your predicate is too broad (catches
   all `SqlException`), you waste time on 5 retries before the same error finally
   propagates — this is why transient error identification matters.

2. **Q: Why add jitter to exponential backoff?**
   A: Without jitter, clients that fail at the same time all retry at the same
   intervals (1s, 2s, 4s...), creating synchronized traffic spikes that can worsen
   the original problem. Jitter randomizes the delay, spreading retries over time
   and reducing contention.

3. **Q: When should you use a circuit breaker in addition to retries?**
   A: When a prolonged outage could exhaust your retry budget on every request,
   piling up threads waiting for timeouts. The circuit breaker detects the pattern and
   fails fast, protecting your application's resources while the downstream system
   recovers.

4. **Q: You retry an INSERT and it executes twice. How do you prevent this?**
   A: Make writes idempotent. Use MERGE/upsert patterns, or add an idempotency key
   (e.g., a GUID generated by the caller) with a UNIQUE constraint so the second
   INSERT is safely rejected.

## Quiz

**1. SQL error number 1205 means "deadlock victim." Should you retry this error? What precaution should you take?**

<details>
<summary>Show Answer</summary>

Yes, 1205 is transient — SQL Server chose your session as the deadlock victim and rolled back your transaction. Retrying usually succeeds because the other transaction has completed. However, cap the number of retries (e.g., 3) because repeated deadlocks between the same processes indicate a design problem (lock ordering, missing indexes) that retries will not fix.
</details>

**2. What is the "thundering herd" problem in the context of retry policies, and how do you prevent it?**

<details>
<summary>Show Answer</summary>

When many clients fail simultaneously and all use the same exponential backoff schedule, they retry at the same times (e.g., all retry after 1s, then 2s, then 4s), creating synchronized bursts of traffic that can overwhelm the recovering server. Adding **jitter** (a random component to the delay) desynchronizes the retries and spreads the load.
</details>

**3. Your Azure SQL pipeline retries a failed INSERT and the row is inserted twice. The table has no unique constraint on the business key. How do you fix this at the database level and the application level?**

<details>
<summary>Show Answer</summary>

**Database level:** Add a UNIQUE constraint or index on the business key (e.g., `CostCode`). The second INSERT will be rejected with a constraint violation instead of creating a duplicate.

**Application level:** Use a MERGE/upsert pattern or check-then-insert (with the unique constraint as a safety net). Alternatively, generate an idempotency key (GUID) for each operation and include it in the INSERT with a unique constraint, so retried operations are safely deduplicated.
</details>

**4. In the Polly circuit breaker, what is the difference between the OPEN, HALF-OPEN, and CLOSED states?**

<details>
<summary>Show Answer</summary>

- **CLOSED:** Normal operation. All calls are attempted. The circuit breaker monitors failure rates.
- **OPEN:** The failure threshold has been exceeded. All calls fail immediately with a `BrokenCircuitException` without hitting the database. This protects the database and keeps threads free.
- **HALF-OPEN:** After the break duration expires, the circuit allows a single test call through. If it succeeds, the circuit moves to CLOSED. If it fails, the circuit moves back to OPEN for another break duration.
</details>
