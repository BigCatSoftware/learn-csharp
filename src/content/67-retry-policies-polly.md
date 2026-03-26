# Retry Policies with Polly

Network calls fail. Databases hiccup. APIs return 503. **Polly** is the standard .NET resilience
library that wraps your operations in policies — retry, circuit breaker, timeout, fallback — so
your application degrades gracefully instead of crashing.

---

## Installation

```
dotnet add package Polly
dotnet add package Polly.Extensions.Http           # for HttpClient integration
dotnet add package Microsoft.Extensions.Resilience  # .NET 8+ built-in integration
dotnet add package Microsoft.Extensions.Http.Resilience  # HttpClient + resilience
```

---

## Simple Retry

```csharp
using Polly;
using Polly.Retry;

var retryPolicy = Policy
    .Handle<SqlException>(ex => IsTransient(ex))
    .Or<TimeoutException>()
    .RetryAsync(3, onRetry: (exception, retryCount) =>
    {
        Console.WriteLine($"Retry {retryCount}: {exception.Message}");
    });

await retryPolicy.ExecuteAsync(async () =>
{
    await using var conn = new SqlConnection(connectionString);
    await conn.OpenAsync();
    // ... execute query
});
```

---

## Wait and Retry with Exponential Backoff

Hammering a failing service with immediate retries makes things worse. Exponential backoff
increases the delay between retries:

```csharp
var retryPolicy = Policy
    .Handle<HttpRequestException>()
    .Or<SqlException>(ex => IsTransient(ex))
    .WaitAndRetryAsync(
        retryCount: 5,
        sleepDurationProvider: attempt =>
            TimeSpan.FromSeconds(Math.Pow(2, attempt)), // 2, 4, 8, 16, 32 sec
        onRetry: (exception, delay, retryCount, context) =>
        {
            Console.WriteLine(
                $"Retry {retryCount} after {delay.TotalSeconds}s: {exception.Message}");
        });
```

### Adding Jitter

Without jitter, all clients retry at the same time (thundering herd). Jitter randomizes the
delay:

```csharp
var jitter = new Random();

var retryPolicy = Policy
    .Handle<HttpRequestException>()
    .WaitAndRetryAsync(
        retryCount: 5,
        sleepDurationProvider: attempt =>
        {
            var baseDelay = TimeSpan.FromSeconds(Math.Pow(2, attempt));
            var jitterMs = jitter.Next(0, 1000);
            return baseDelay + TimeSpan.FromMilliseconds(jitterMs);
        });
```

> **Tip:** Polly provides a built-in jitter calculation via `Backoff.DecorrelatedJitterBackoffV2`:

```csharp
var delays = Backoff.DecorrelatedJitterBackoffV2(
    medianFirstRetryDelay: TimeSpan.FromSeconds(1),
    retryCount: 5);

var retryPolicy = Policy
    .Handle<HttpRequestException>()
    .WaitAndRetryAsync(delays);
```

---

## Circuit Breaker

A circuit breaker prevents calling a service that is known to be down, giving it time to recover:

```csharp
var circuitBreaker = Policy
    .Handle<HttpRequestException>()
    .Or<SqlException>()
    .CircuitBreakerAsync(
        exceptionsAllowedBeforeBreaking: 5,     // 5 failures
        durationOfBreak: TimeSpan.FromSeconds(30), // then wait 30 seconds
        onBreak: (exception, duration) =>
            Console.WriteLine($"Circuit OPEN for {duration.TotalSeconds}s: {exception.Message}"),
        onReset: () =>
            Console.WriteLine("Circuit CLOSED — service recovered."),
        onHalfOpen: () =>
            Console.WriteLine("Circuit HALF-OPEN — testing..."));
```

### Circuit Breaker States

| State | Behavior |
|---|---|
| **Closed** | Normal operation — requests pass through |
| **Open** | All requests fail immediately with `BrokenCircuitException` |
| **Half-Open** | One test request is allowed; if it succeeds, circuit closes |

```
Closed ──(N failures)──> Open ──(timeout)──> Half-Open ──(success)──> Closed
                                                │
                                           (failure)
                                                │
                                                v
                                              Open
```

---

## Timeout Policy

```csharp
// Optimistic timeout (cooperates with CancellationToken)
var timeoutPolicy = Policy
    .TimeoutAsync(TimeSpan.FromSeconds(10), TimeoutStrategy.Optimistic);

// Pessimistic timeout (forcibly cancels even non-cooperative code)
var pessimisticTimeout = Policy
    .TimeoutAsync(TimeSpan.FromSeconds(30), TimeoutStrategy.Pessimistic,
        onTimeoutAsync: (context, timespan, task) =>
        {
            Console.WriteLine($"Timed out after {timespan.TotalSeconds}s");
            return Task.CompletedTask;
        });
```

> **Warning:** `TimeoutStrategy.Pessimistic` can leave orphaned tasks running. Prefer
> `Optimistic` whenever your code supports `CancellationToken`.

---

## Fallback Policy

Provide a default value when all retries fail:

```csharp
var fallbackPolicy = Policy<List<Product>>
    .Handle<HttpRequestException>()
    .Or<TimeoutRejectedException>()
    .FallbackAsync(
        fallbackValue: new List<Product>(), // empty list as fallback
        onFallbackAsync: (result, context) =>
        {
            Console.WriteLine($"Falling back due to: {result.Exception.Message}");
            return Task.CompletedTask;
        });
```

---

## Bulkhead Isolation

Limit the number of concurrent calls to prevent one slow dependency from consuming all your
threads:

```csharp
var bulkhead = Policy
    .BulkheadAsync(
        maxParallelization: 10,   // max concurrent executions
        maxQueuingActions: 50,    // max queued if all slots are busy
        onBulkheadRejectedAsync: context =>
        {
            Console.WriteLine("Bulkhead rejected — too many concurrent calls.");
            return Task.CompletedTask;
        });
```

---

## Policy Wrapping

Combine policies — the outermost policy executes first:

```csharp
var resilientPolicy = Policy.WrapAsync(
    fallbackPolicy,   // outermost: if everything fails, return fallback
    circuitBreaker,    // next: stop calling if service is down
    retryPolicy,       // next: retry transient failures
    timeoutPolicy      // innermost: timeout individual attempts
);

var result = await resilientPolicy.ExecuteAsync(async ct =>
{
    return await httpClient.GetFromJsonAsync<List<Product>>("/api/products", ct);
}, CancellationToken.None);
```

Execution order:
```
Fallback
  └── CircuitBreaker
        └── Retry (up to 3 times)
              └── Timeout (10s per attempt)
                    └── Your HTTP call
```

---

## Using Polly with HttpClient (IHttpClientFactory)

```csharp
// In Program.cs
builder.Services.AddHttpClient("CatalogApi", client =>
{
    client.BaseAddress = new Uri("https://api.catalog.example.com");
    client.DefaultRequestHeaders.Add("Accept", "application/json");
})
.AddTransientHttpErrorPolicy(p =>
    p.WaitAndRetryAsync(Backoff.DecorrelatedJitterBackoffV2(
        TimeSpan.FromSeconds(1), retryCount: 3)))
.AddTransientHttpErrorPolicy(p =>
    p.CircuitBreakerAsync(5, TimeSpan.FromSeconds(30)));
```

`AddTransientHttpErrorPolicy` automatically handles:
- `HttpRequestException`
- HTTP 5xx responses
- HTTP 408 (Request Timeout)

```csharp
// Usage — inject IHttpClientFactory
public class CatalogService
{
    private readonly IHttpClientFactory _factory;

    public CatalogService(IHttpClientFactory factory) => _factory = factory;

    public async Task<List<Product>> GetProductsAsync(CancellationToken ct)
    {
        var client = _factory.CreateClient("CatalogApi");
        // Retry and circuit breaker are applied automatically
        return await client.GetFromJsonAsync<List<Product>>("/products", ct)
            ?? new List<Product>();
    }
}
```

---

## Using Polly with Database Connections

```csharp
public class ResilientDatabase
{
    private readonly string _connectionString;
    private readonly AsyncRetryPolicy _retryPolicy;

    public ResilientDatabase(string connectionString)
    {
        _connectionString = connectionString;

        _retryPolicy = Policy
            .Handle<SqlException>(ex => IsTransient(ex))
            .Or<TimeoutException>()
            .WaitAndRetryAsync(
                Backoff.DecorrelatedJitterBackoffV2(
                    TimeSpan.FromMilliseconds(200), retryCount: 4),
                onRetry: (ex, delay, attempt, _) =>
                    Console.WriteLine($"DB retry {attempt}: {ex.Message} (waiting {delay})"));
    }

    public async Task<T> QueryAsync<T>(Func<SqlConnection, Task<T>> operation)
    {
        return await _retryPolicy.ExecuteAsync(async () =>
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            return await operation(conn);
        });
    }

    public async Task ExecuteAsync(Func<SqlConnection, Task> operation)
    {
        await _retryPolicy.ExecuteAsync(async () =>
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            await operation(conn);
        });
    }

    private static bool IsTransient(SqlException ex) =>
        ex.Number is 40613 or 40197 or 40501 or 49918 or -2
                  or 4060 or 10928 or 10929 or 40544;
}
```

Usage:

```csharp
var db = new ResilientDatabase(connectionString);

var orders = await db.QueryAsync(async conn =>
{
    await using var cmd = new SqlCommand("SELECT * FROM dbo.Orders WHERE Status = 1", conn);
    await using var reader = await cmd.ExecuteReaderAsync();
    // ... map results
    return results;
});
```

---

## Microsoft.Extensions.Resilience (.NET 8+)

.NET 8 introduced built-in resilience based on Polly v8:

```csharp
using Microsoft.Extensions.Resilience;

builder.Services.AddResiliencePipeline("db-pipeline", builder =>
{
    builder
        .AddRetry(new RetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            Delay = TimeSpan.FromMilliseconds(500),
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true,
            ShouldHandle = new PredicateBuilder()
                .Handle<SqlException>(ex => IsTransient(ex))
                .Handle<TimeoutException>()
        })
        .AddCircuitBreaker(new CircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            MinimumThroughput = 10,
            SamplingDuration = TimeSpan.FromSeconds(30),
            BreakDuration = TimeSpan.FromSeconds(15)
        })
        .AddTimeout(TimeSpan.FromSeconds(10));
});

// Inject and use
public class MyService
{
    private readonly ResiliencePipeline _pipeline;

    public MyService(ResiliencePipelineProvider<string> provider)
    {
        _pipeline = provider.GetPipeline("db-pipeline");
    }

    public async Task<Data> FetchAsync(CancellationToken ct)
    {
        return await _pipeline.ExecuteAsync(async token =>
        {
            // your operation here
            return await LoadDataAsync(token);
        }, ct);
    }
}
```

> **Note:** `Microsoft.Extensions.Resilience` is the recommended approach for new .NET 8+
> projects. It uses Polly v8 internally but integrates natively with dependency injection,
> configuration, and telemetry.

---

## Summary

| Policy | Purpose | When to Use |
|---|---|---|
| Retry | Re-execute on transient failure | Network blips, database timeouts |
| Wait and Retry | Retry with increasing delays | External APIs, rate-limited services |
| Circuit Breaker | Stop calling a failing service | Protect against cascading failures |
| Timeout | Cancel long-running operations | Prevent thread starvation |
| Fallback | Provide a default on failure | Graceful degradation |
| Bulkhead | Limit concurrency | Isolate slow dependencies |
| Policy Wrap | Combine multiple policies | Production-grade resilience |
