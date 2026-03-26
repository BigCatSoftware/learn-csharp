# Composable Pipeline Architecture

*Chapter 13.2 — Data Engineering Patterns in C#*

## Overview

A well-designed data pipeline is not a monolithic script — it is a chain of composable
steps, each with a single responsibility, that can be tested in isolation, reordered,
and swapped without rewriting the whole pipeline. This lesson covers how to build
composable pipelines in C# using interfaces, the strategy pattern, and middleware
chains. You will learn how to define `IPipelineStep<TIn, TOut>`, compose steps into
pipelines, and apply the pattern to real Oracle-to-SQL Server ETL workloads.

## Core Concepts

### The Pipeline Step Abstraction

Every pipeline step takes input of type `TIn`, produces output of type `TOut`, and
can be cancelled. This is the fundamental building block.

### Strategy Pattern in Pipelines

Different tables may need different extraction strategies (full load vs. delta), different
transform logic (simple mapping vs. complex enrichment), and different load strategies
(bulk insert vs. merge). The strategy pattern lets you swap these at runtime based on
configuration.

### Middleware Chains

Borrowing from ASP.NET Core's middleware pattern, you can wrap pipeline steps with
cross-cutting concerns: logging, retry, timing, validation. Each middleware wraps
the next step, forming a Russian-doll chain.

### Composition Over Inheritance

Rather than inheriting from a base pipeline class, you compose pipelines from small,
focused steps. This makes testing trivial — you test each step with controlled input
and assert the output.

## Code Examples

### The Core Interface

```csharp
public interface IPipelineStep<TIn, TOut>
{
    string Name { get; }
    Task<TOut> ExecuteAsync(TIn input, CancellationToken ct);
}
```

### Concrete Steps

```csharp
// Extract step: reads from Oracle, produces raw records
public class OracleExtractStep : IPipelineStep<ExtractRequest, IReadOnlyList<RawJobCost>>
{
    private readonly OracleConnection _connection;

    public OracleExtractStep(OracleConnection connection)
        => _connection = connection;

    public string Name => "OracleExtract";

    public async Task<IReadOnlyList<RawJobCost>> ExecuteAsync(
        ExtractRequest request, CancellationToken ct)
    {
        const string sql = @"
            SELECT job_number, cost_code, amount, posting_date, cost_type
            FROM cmic.jcdetl
            WHERE posting_date >= :since";

        await using var cmd = new OracleCommand(sql, _connection);
        cmd.Parameters.Add(":since", OracleDbType.Date).Value = request.Since;

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var results = new List<RawJobCost>();

        while (await reader.ReadAsync(ct))
        {
            results.Add(new RawJobCost
            {
                JobNumber = reader.GetString(0),
                CostCode = reader.GetString(1),
                Amount = reader.GetDecimal(2),
                PostingDate = reader.GetDateTime(3),
                CostType = reader.GetString(4)
            });
        }

        return results;
    }
}

// Transform step: cleans and maps raw records
public class JobCostTransformStep
    : IPipelineStep<IReadOnlyList<RawJobCost>, IReadOnlyList<CleanJobCost>>
{
    public string Name => "JobCostTransform";

    public Task<IReadOnlyList<CleanJobCost>> ExecuteAsync(
        IReadOnlyList<RawJobCost> input, CancellationToken ct)
    {
        var result = input
            .Where(r => !string.IsNullOrWhiteSpace(r.JobNumber))
            .Select(r => new CleanJobCost
            {
                JobKey = r.JobNumber.Trim().ToUpperInvariant(),
                CostCode = r.CostCode?.Trim() ?? "UNKNOWN",
                Amount = r.Amount,
                PostingDate = DateOnly.FromDateTime(r.PostingDate),
                CostType = MapCostType(r.CostType)
            })
            .ToList();

        return Task.FromResult<IReadOnlyList<CleanJobCost>>(result);
    }

    private static CostType MapCostType(string raw) => raw?.Trim() switch
    {
        "L" => CostType.Labor,
        "M" => CostType.Material,
        "S" => CostType.Subcontract,
        "E" => CostType.Equipment,
        _   => CostType.Other
    };
}

// Load step: bulk inserts to SQL Server
public class SqlServerLoadStep
    : IPipelineStep<IReadOnlyList<CleanJobCost>, LoadResult>
{
    private readonly SqlConnection _connection;

    public SqlServerLoadStep(SqlConnection connection)
        => _connection = connection;

    public string Name => "SqlServerLoad";

    public async Task<LoadResult> ExecuteAsync(
        IReadOnlyList<CleanJobCost> input, CancellationToken ct)
    {
        using var bulk = new SqlBulkCopy(_connection)
        {
            DestinationTableName = "staging.JobCost",
            BatchSize = 10_000,
            BulkCopyTimeout = 300
        };

        using var reader = new ObjectDataReader<CleanJobCost>(input);
        await bulk.WriteToServerAsync(reader, ct);

        return new LoadResult(input.Count, bulk.RowsCopied);
    }
}
```

### Composing Steps into a Pipeline

```csharp
public class Pipeline<TIn, TOut>
{
    private readonly Func<TIn, CancellationToken, Task<TOut>> _execute;
    private readonly string _name;

    private Pipeline(string name, Func<TIn, CancellationToken, Task<TOut>> execute)
    {
        _name = name;
        _execute = execute;
    }

    public static Pipeline<TIn, TOut> FromStep(IPipelineStep<TIn, TOut> step)
        => new(step.Name, step.ExecuteAsync);

    public Pipeline<TIn, TFinal> Then<TFinal>(IPipelineStep<TOut, TFinal> next)
    {
        var current = _execute;
        return new Pipeline<TIn, TFinal>(
            $"{_name} → {next.Name}",
            async (input, ct) =>
            {
                var intermediate = await current(input, ct);
                return await next.ExecuteAsync(intermediate, ct);
            });
    }

    public async Task<TOut> RunAsync(TIn input, CancellationToken ct = default)
    {
        return await _execute(input, ct);
    }

    public override string ToString() => _name;
}

// Usage:
var pipeline = Pipeline
    .FromStep(new OracleExtractStep(oracleConn))
    .Then(new JobCostTransformStep())
    .Then(new SqlServerLoadStep(sqlConn));

var result = await pipeline.RunAsync(
    new ExtractRequest(Since: DateTime.Today.AddDays(-1)),
    cancellationToken);
```

### Strategy Pattern for Extraction

```csharp
public interface IExtractStrategy<T>
{
    string Name { get; }
    Task<IReadOnlyList<T>> ExtractAsync(TableConfig config, CancellationToken ct);
}

public class FullExtractStrategy<T> : IExtractStrategy<T>
{
    public string Name => "FullExtract";

    public async Task<IReadOnlyList<T>> ExtractAsync(
        TableConfig config, CancellationToken ct)
    {
        // SELECT * FROM table
        return await QueryAllAsync(config, ct);
    }
}

public class DeltaExtractStrategy<T> : IExtractStrategy<T>
{
    private readonly IWatermarkStore _watermarks;

    public DeltaExtractStrategy(IWatermarkStore watermarks)
        => _watermarks = watermarks;

    public string Name => "DeltaExtract";

    public async Task<IReadOnlyList<T>> ExtractAsync(
        TableConfig config, CancellationToken ct)
    {
        var watermark = await _watermarks.GetAsync(config.TableName, ct);
        // SELECT * FROM table WHERE modified_date > @watermark
        return await QueryDeltaAsync(config, watermark, ct);
    }
}

// Factory selects strategy based on config
public class ExtractStrategyFactory<T>
{
    public IExtractStrategy<T> Create(TableConfig config) => config.LoadType switch
    {
        LoadType.Full  => new FullExtractStrategy<T>(),
        LoadType.Delta => new DeltaExtractStrategy<T>(_watermarks),
        _ => throw new ArgumentOutOfRangeException(nameof(config.LoadType))
    };
}
```

### Middleware: Cross-Cutting Concerns

```csharp
// Logging middleware
public class LoggingStep<TIn, TOut> : IPipelineStep<TIn, TOut>
{
    private readonly IPipelineStep<TIn, TOut> _inner;
    private readonly ILogger _logger;

    public LoggingStep(IPipelineStep<TIn, TOut> inner, ILogger logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public string Name => $"Logging({_inner.Name})";

    public async Task<TOut> ExecuteAsync(TIn input, CancellationToken ct)
    {
        _logger.LogInformation("Starting step {Step}", _inner.Name);
        var sw = Stopwatch.StartNew();

        try
        {
            var result = await _inner.ExecuteAsync(input, ct);
            _logger.LogInformation(
                "Completed step {Step} in {Elapsed}ms",
                _inner.Name, sw.ElapsedMilliseconds);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Step {Step} failed after {Elapsed}ms",
                _inner.Name, sw.ElapsedMilliseconds);
            throw;
        }
    }
}

// Retry middleware
public class RetryStep<TIn, TOut> : IPipelineStep<TIn, TOut>
{
    private readonly IPipelineStep<TIn, TOut> _inner;
    private readonly int _maxRetries;
    private readonly TimeSpan _baseDelay;

    public RetryStep(IPipelineStep<TIn, TOut> inner,
        int maxRetries = 3, TimeSpan? baseDelay = null)
    {
        _inner = inner;
        _maxRetries = maxRetries;
        _baseDelay = baseDelay ?? TimeSpan.FromSeconds(1);
    }

    public string Name => $"Retry({_inner.Name})";

    public async Task<TOut> ExecuteAsync(TIn input, CancellationToken ct)
    {
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                return await _inner.ExecuteAsync(input, ct);
            }
            catch (Exception) when (attempt < _maxRetries)
            {
                var delay = _baseDelay * Math.Pow(2, attempt);
                await Task.Delay(delay, ct);
            }
        }
    }
}

// Timing middleware
public class TimingStep<TIn, TOut> : IPipelineStep<TIn, TOut>
{
    private readonly IPipelineStep<TIn, TOut> _inner;
    private readonly Action<string, TimeSpan> _onCompleted;

    public TimingStep(IPipelineStep<TIn, TOut> inner,
        Action<string, TimeSpan> onCompleted)
    {
        _inner = inner;
        _onCompleted = onCompleted;
    }

    public string Name => _inner.Name;

    public async Task<TOut> ExecuteAsync(TIn input, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var result = await _inner.ExecuteAsync(input, ct);
        sw.Stop();
        _onCompleted(_inner.Name, sw.Elapsed);
        return result;
    }
}
```

### Extension Methods for Fluent Composition

```csharp
public static class PipelineStepExtensions
{
    public static IPipelineStep<TIn, TOut> WithLogging<TIn, TOut>(
        this IPipelineStep<TIn, TOut> step, ILogger logger)
        => new LoggingStep<TIn, TOut>(step, logger);

    public static IPipelineStep<TIn, TOut> WithRetry<TIn, TOut>(
        this IPipelineStep<TIn, TOut> step,
        int maxRetries = 3, TimeSpan? baseDelay = null)
        => new RetryStep<TIn, TOut>(step, maxRetries, baseDelay);

    public static IPipelineStep<TIn, TOut> WithTiming<TIn, TOut>(
        this IPipelineStep<TIn, TOut> step,
        Action<string, TimeSpan> onCompleted)
        => new TimingStep<TIn, TOut>(step, onCompleted);
}

// Fluent usage:
var extract = new OracleExtractStep(conn)
    .WithLogging(logger)
    .WithRetry(maxRetries: 3)
    .WithTiming((name, elapsed) =>
        metrics.RecordStepDuration(name, elapsed));
```

## Common Patterns

### Pattern 1: Pipeline Builder

```csharp
public class PipelineBuilder
{
    private readonly IServiceProvider _services;
    private readonly List<object> _steps = new();

    public PipelineBuilder(IServiceProvider services)
        => _services = services;

    public PipelineBuilder Extract<T>(TableConfig config)
    {
        var strategy = _services
            .GetRequiredService<ExtractStrategyFactory<T>>()
            .Create(config);
        _steps.Add(strategy);
        return this;
    }

    public PipelineBuilder Transform<TIn, TOut>(
        Func<TIn, TOut> transform)
    {
        _steps.Add(new LambdaStep<TIn, TOut>(transform));
        return this;
    }

    public PipelineBuilder Load<T>(string destinationTable)
    {
        _steps.Add(new BulkLoadStep<T>(destinationTable));
        return this;
    }
}
```

### Pattern 2: Fan-Out / Fan-In

```csharp
public class FanOutStep<TIn, TOut> : IPipelineStep<TIn, IReadOnlyList<TOut>>
{
    private readonly IReadOnlyList<IPipelineStep<TIn, TOut>> _branches;

    public string Name => "FanOut";

    public async Task<IReadOnlyList<TOut>> ExecuteAsync(
        TIn input, CancellationToken ct)
    {
        var tasks = _branches
            .Select(b => b.ExecuteAsync(input, ct))
            .ToList();

        var results = await Task.WhenAll(tasks);
        return results;
    }
}
```

### Pattern 3: Conditional Steps

```csharp
public class ConditionalStep<TIn, TOut> : IPipelineStep<TIn, TOut>
{
    private readonly Func<TIn, bool> _predicate;
    private readonly IPipelineStep<TIn, TOut> _whenTrue;
    private readonly IPipelineStep<TIn, TOut> _whenFalse;

    public string Name => $"If({_whenTrue.Name}, {_whenFalse.Name})";

    public Task<TOut> ExecuteAsync(TIn input, CancellationToken ct)
        => _predicate(input)
            ? _whenTrue.ExecuteAsync(input, ct)
            : _whenFalse.ExecuteAsync(input, ct);
}
```

## Gotchas and Pitfalls

### 1. Generic Type Explosion
Chaining `IPipelineStep<A, B>` then `IPipelineStep<B, C>` then `IPipelineStep<C, D>`
creates deeply nested generic types. Keep intermediate types to simple records or use
a common `PipelineContext` bag where steps read/write by key.

### 2. Step Coupling Through Shared State
If steps communicate via shared mutable state (e.g., a dictionary), you lose the
composability benefit. Each step should receive all input via its `TIn` parameter and
return all output via `TOut`.

### 3. Async Overhead on Synchronous Steps
Not all transforms are async. Wrapping a pure function in `Task.FromResult` adds
unnecessary allocations. Consider providing a synchronous `ITransform<TIn, TOut>`
interface for pure in-memory transforms.

### 4. Middleware Ordering
Retry middleware must wrap logging middleware, not the other way around. If logging
wraps retry, you log every retry attempt. If retry wraps logging, you log only the
final outcome. Be intentional about ordering.

### 5. Disposal Chain
If a step opens a connection or creates a disposable resource, the pipeline must
ensure disposal even on failure. Consider implementing `IAsyncDisposable` on steps
that hold resources.

## Performance Considerations

- **Avoid materializing intermediate collections.** If the extract returns 1M rows and
  the transform filters to 100K, stream with `IAsyncEnumerable` rather than creating
  a `List<T>` at each step.
- **Pool step instances.** If steps are stateless, reuse them across pipeline runs
  rather than creating new instances each time.
- **Measure per-step timing.** Use the timing middleware to identify which step is the
  bottleneck. Optimize the slowest step first.
- **Parallelize independent steps.** If two extract steps read from different tables,
  run them concurrently with `Task.WhenAll`.

## BNBuilders Context

### Multi-Table Pipeline Orchestration

BNBuilders has dozens of CMiC tables to sync: job costs, equipment, employees, vendors,
purchase orders, change orders. Each table has its own extract-transform-load logic, but
they share infrastructure: Oracle connection, SQL Server connection, logging, retry.

```csharp
// Register all pipelines in DI
services.AddTransient<IPipelineStep<ExtractRequest, IReadOnlyList<RawJobCost>>,
    OracleExtractStep>();
services.AddTransient<IPipelineStep<IReadOnlyList<RawJobCost>, IReadOnlyList<CleanJobCost>>,
    JobCostTransformStep>();
services.AddTransient<IPipelineStep<IReadOnlyList<CleanJobCost>, LoadResult>,
    SqlServerLoadStep>();
```

### Strategy Per Table

Some CMiC tables support delta loading (they have `MODIFIED_DATE`), others require
full extracts. The strategy pattern lets you configure this per table in a JSON manifest
without changing pipeline code.

### Equipment Pipeline Example

Equipment tracking needs a different transform than job costs. The composable architecture
means you reuse the same Oracle extract and SQL Server load steps, swapping only the
transform step in the middle.

## Interview / Senior Dev Questions

1. **"Why use interfaces for pipeline steps instead of delegates?"**
   Interfaces give you a `Name` property for logging/metrics, can hold state (like
   connection strings), and support DI registration. Delegates are lighter but harder
   to instrument.

2. **"How would you handle a step that needs to write to two destinations?"**
   Use a fan-out step that takes one input and produces two outputs in parallel, or
   compose two load steps sequentially. Avoid having a single step write to two places,
   as it violates single responsibility.

3. **"What is the advantage of middleware over aspect-oriented programming here?"**
   Middleware is explicit and composable — you can see the wrapping order in code.
   AOP (attributes, interceptors) is implicit and harder to reason about, especially
   when debugging pipeline failures.

4. **"How do you version pipeline steps?"**
   Each step has a `Name`. Add a `Version` property. Store step name + version in
   pipeline run metadata. When you change transform logic, bump the version. This
   lets you trace which version of a step produced a given dataset.

## Quiz

### Question 1
What is the primary benefit of the `IPipelineStep<TIn, TOut>` interface?

<details>
<summary>Show Answer</summary>

It enforces a consistent contract for all pipeline steps: typed input, typed output,
cancellation support, and a name for observability. This enables composition — any
step that produces `TOut` can feed into any step that accepts `TOut` as input —
and isolated testing with controlled inputs.
</details>

### Question 2
You have a retry middleware wrapping a logging middleware wrapping an extract step.
A transient error causes 3 retries. How many log entries do you see?

<details>
<summary>Show Answer</summary>

**3 log entries** (one per attempt), because logging is inside the retry loop. If you
want only one log entry for the final outcome, reverse the order: logging wraps retry,
so logging sees only one call (which internally retries).
</details>

### Question 3
Why is `IAsyncEnumerable<T>` preferred over `IReadOnlyList<T>` for large extracts?

<details>
<summary>Show Answer</summary>

`IAsyncEnumerable<T>` streams rows one at a time (or in small batches), keeping memory
usage constant regardless of dataset size. `IReadOnlyList<T>` materializes all rows
into memory before the next step can process them. For a 10M-row table, this difference
can mean gigabytes of heap pressure.
</details>

### Question 4
A pipeline has Extract, Transform, and Load steps. The Transform step is pure (no I/O).
What is the performance cost of making it `async`?

<details>
<summary>Show Answer</summary>

Each `await Task.FromResult(...)` allocates a state machine and a `Task<T>` on the heap.
For millions of invocations, this adds GC pressure. For pure transforms, provide a
synchronous `ITransform<TIn, TOut>` interface and only wrap in async at the pipeline
composition level, not per-row.
</details>
