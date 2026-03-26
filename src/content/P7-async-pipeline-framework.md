# Project 7: Async Data Pipeline Framework

*Difficulty: Hard | Estimated: 1-2 weeks | Category: Data Engineering*

---

## Project Overview

Build a composable, async data pipeline framework powered by `System.Threading.Channels`. The framework lets you declaratively construct multi-stage data pipelines where each stage runs concurrently with bounded channels providing backpressure between them. Think of it as a lightweight, C#-native alternative to SSIS or Apache Beam, purpose-built for the kind of database-to-database ETL work common in construction data engineering.

The framework defines core abstractions: `IPipelineSource<T>` produces data, `IPipelineTransform<TIn, TOut>` transforms it, and `IPipelineSink<T>` consumes it. A fluent `PipelineBuilder<T>` wires stages together. Each stage has configurable parallelism, its own error handling policy (skip, retry, or fail), and emits metrics (throughput, queue depth, latency per stage).

You will build built-in implementations for common scenarios: `SqlServerSource<T>` and `OracleSource<T>` read from databases, `CsvFileSource<T>` reads from files, `SqlBulkCopySink<T>` writes to SQL Server, and reusable blocks like `TransformBlock<TIn, TOut>`, `FilterBlock<T>`, and `BatchBlock<T>` handle common transformations.

---

## Learning Objectives

- Design framework-level abstractions with generics and interfaces
- Use `System.Threading.Channels` for inter-stage communication with backpressure
- Implement configurable parallelism per pipeline stage
- Propagate `CancellationToken` correctly through async pipelines
- Build per-stage error handling with skip/retry/fail policies
- Collect and expose real-time pipeline metrics (throughput, queue depths, latency)
- Implement graceful shutdown with drain semantics
- Build a fluent builder API for pipeline construction
- Create database source and sink implementations using ADO.NET
- Write thorough tests for concurrent, async framework code

---

## Prerequisites

| Lesson | Topic |
|--------|-------|
| 34 | Channels |
| 203 | Parallel Data Processing |
| 62 | Backpressure Handling |
| 201 | Pipeline Architecture |
| 202 | Chunking and Partitioning |
| 149 | Connecting to Oracle from C# |

---

## Architecture

```
Pipeline.sln
|
+-- src/
|   +-- Pipeline.Core/                         # Framework core — zero external dependencies
|   |   +-- Abstractions/
|   |   |   +-- IPipelineSource.cs              # Produces items into the pipeline
|   |   |   +-- IPipelineTransform.cs           # Transforms items between stages
|   |   |   +-- IPipelineSink.cs                # Consumes items from the pipeline
|   |   |   +-- IPipelineStage.cs               # Common stage interface (metrics, name)
|   |   +-- Builder/
|   |   |   +-- PipelineBuilder.cs              # Fluent builder API
|   |   |   +-- PipelineStageConfig.cs          # Per-stage configuration
|   |   +-- Blocks/
|   |   |   +-- TransformBlock.cs               # Wraps a Func<TIn, TOut>
|   |   |   +-- AsyncTransformBlock.cs          # Wraps a Func<TIn, Task<TOut>>
|   |   |   +-- FilterBlock.cs                  # Wraps a Func<T, bool> predicate
|   |   |   +-- BatchBlock.cs                   # Accumulates items into batches
|   |   |   +-- FlatMapBlock.cs                 # One-to-many transform
|   |   +-- Engine/
|   |   |   +-- PipelineEngine.cs               # Orchestrates stage execution
|   |   |   +-- StageRunner.cs                  # Runs a single stage with parallelism
|   |   |   +-- ChannelLink.cs                  # Connects two stages via a Channel
|   |   +-- ErrorHandling/
|   |   |   +-- ErrorPolicy.cs                  # Skip / Retry / Fail enum + config
|   |   |   +-- RetryHandler.cs                 # Retry with backoff
|   |   |   +-- PoisonQueue.cs                  # Dead letter channel for failed items
|   |   +-- Metrics/
|   |   |   +-- PipelineMetrics.cs              # Aggregated pipeline metrics
|   |   |   +-- StageMetrics.cs                 # Per-stage throughput, latency, queue depth
|   |   +-- Pipeline.Core.csproj
|   |
|   +-- Pipeline.SqlServer/                     # SQL Server source and sink
|   |   +-- SqlServerSource.cs                  # Reads from SQL Server via DataReader
|   |   +-- SqlBulkCopySink.cs                  # Writes via SqlBulkCopy
|   |   +-- Pipeline.SqlServer.csproj
|   |
|   +-- Pipeline.Oracle/                        # Oracle source
|   |   +-- OracleSource.cs                     # Reads from Oracle via ODP.NET
|   |   +-- Pipeline.Oracle.csproj
|   |
|   +-- Pipeline.FileSystem/                    # File-based sources and sinks
|   |   +-- CsvFileSource.cs                    # Reads CSV files
|   |   +-- CsvFileSink.cs                      # Writes CSV files
|   |   +-- Pipeline.FileSystem.csproj
|   |
|   +-- Pipeline.Demo/                          # Demo console app
|       +-- Program.cs
|       +-- Pipeline.Demo.csproj
|
+-- tests/
    +-- Pipeline.Tests/
        +-- Blocks/
        |   +-- TransformBlockTests.cs
        |   +-- FilterBlockTests.cs
        |   +-- BatchBlockTests.cs
        +-- Engine/
        |   +-- PipelineEngineTests.cs
        |   +-- StageRunnerTests.cs
        +-- Builder/
        |   +-- PipelineBuilderTests.cs
        +-- ErrorHandling/
        |   +-- RetryHandlerTests.cs
        +-- Integration/
        |   +-- EndToEndPipelineTests.cs
        +-- Pipeline.Tests.csproj
```

---

## Requirements

### Core Requirements

1. **Pipeline Abstractions**: Define `IPipelineSource<T>`, `IPipelineTransform<TIn, TOut>`, and `IPipelineSink<T>` interfaces. Each stage has a `Name` property and exposes `StageMetrics`.
2. **Channel-Based Linking**: Connect stages using bounded `Channel<T>` instances. Backpressure flows naturally: if a downstream stage is slow, the channel fills up and the upstream stage blocks on write.
3. **PipelineBuilder**: A fluent API to compose pipelines: `PipelineBuilder.FromSource(source).Transform(transform).Filter(predicate).Batch(size).Sink(sink).Build()`.
4. **Configurable Parallelism**: Each stage can specify `MaxDegreeOfParallelism`. The `StageRunner` spawns that many worker tasks, all reading from the same input channel.
5. **Cancellation**: The entire pipeline respects a `CancellationToken`. Cancelling drains in-flight items and shuts down gracefully.

### Extended Requirements

6. **Error Handling**: Each stage has an `ErrorPolicy`: `Skip` (log and continue), `Retry` (retry N times with exponential backoff), or `Fail` (abort the pipeline). Failed items route to a `PoisonQueue<T>`.
7. **Pipeline Metrics**: Real-time metrics per stage: items processed, items/sec, average latency, current queue depth. A `PipelineMetrics` object aggregates all stage metrics.
8. **Built-In Blocks**: `TransformBlock<TIn, TOut>`, `AsyncTransformBlock<TIn, TOut>`, `FilterBlock<T>`, `BatchBlock<T>` (accumulates N items into `IReadOnlyList<T>`), `FlatMapBlock<TIn, TOut>` (one-to-many).
9. **SqlServerSource and SqlBulkCopySink**: Read from SQL Server using `SqlDataReader` and map rows to `T` via a configurable mapping function. Write to SQL Server using `SqlBulkCopy` with a custom `IDataReader`.

### Stretch Requirements

10. **OracleSource**: Read from Oracle using `OracleDataReader` from `Oracle.ManagedDataAccess.Core`.
11. **CsvFileSource**: Stream CSV files into the pipeline, parsing rows into a typed `T` or a `Dictionary<string, string>`.
12. **Graceful Shutdown**: On cancellation, let all in-flight items finish processing before shutting down (drain mode). Expose a `DrainAsync()` method.

---

## Technical Guidance

### Channel Linking Pattern

The key insight is that each stage reads from an input channel and writes to an output channel. The framework creates these channels and links them together:

```
Source --> Channel<T1> --> Transform --> Channel<T2> --> Sink
```

A `ChannelLink<T>` wraps a `Channel<T>` and tracks queue depth. The `PipelineEngine` creates the links, starts each stage as a set of tasks (one per parallelism degree), and manages completion propagation: when a stage finishes writing, it calls `channel.Writer.Complete()`, which signals downstream stages to finish when they have drained the channel.

### Stage Runner Design

`StageRunner` is the core execution unit. For a transform stage with parallelism 3, it spawns 3 tasks, each running a loop:

```
while (await inputChannel.Reader.WaitToReadAsync(ct))
{
    while (inputChannel.Reader.TryRead(out var item))
    {
        var result = await transform.ProcessAsync(item, ct);
        await outputChannel.Writer.WriteAsync(result, ct);
    }
}
```

The multiple readers on the same channel naturally load-balance work. When all input is consumed, the tasks exit and the runner signals completion.

### Error Handling Integration

Wrap the `ProcessAsync` call in a try-catch. Based on the `ErrorPolicy`:
- **Skip**: Log the error, increment the error counter, continue to the next item.
- **Retry**: Use `RetryHandler` which implements exponential backoff with jitter. After max retries, either skip or fail based on configuration.
- **Fail**: Write the item to the `PoisonQueue`, set a cancellation flag, and throw to abort the pipeline.

### Metrics Collection

Use `Interlocked` operations for thread-safe counter updates. Each `StageRunner` tracks:
- `ItemsProcessed` (counter)
- `ItemsFailed` (counter)
- Processing latency using `Stopwatch` per item (maintain a running average)
- Queue depth by checking `channel.Reader.Count` periodically

### Builder API Design

The builder uses generics to track the current item type as you chain stages:

```csharp
var pipeline = PipelineBuilder
    .FromSource<ProjectRecord>(sqlSource)
    .Transform(record => Normalize(record))  // returns PipelineBuilder<ProjectRecord>
    .Filter(record => record.IsActive)       // still PipelineBuilder<ProjectRecord>
    .Transform(record => ToDto(record))      // returns PipelineBuilder<ProjectDto>
    .Batch(1000)                              // returns PipelineBuilder<IReadOnlyList<ProjectDto>>
    .Sink(bulkCopySink)
    .WithMetrics()
    .Build();
```

Each method returns a new builder with the appropriate generic type, building up a list of stage descriptors internally.

---

## Step-by-Step Milestones

### Milestone 1: Core Abstractions and Channel Link (Days 1-2)

Define `IPipelineSource<T>`, `IPipelineTransform<TIn, TOut>`, `IPipelineSink<T>`, and `IPipelineStage`. Create `ChannelLink<T>` wrapping a bounded channel with configurable capacity. Write `StageMetrics` with `Interlocked` counters. Verify with unit tests that channels correctly block producers when full.

### Milestone 2: StageRunner and PipelineEngine (Days 2-4)

Implement `StageRunner` that executes a stage with configurable parallelism, reading from input and writing to output channels. Implement `PipelineEngine` that wires stages together, starts all runners, and propagates channel completion. Test with a simple in-memory source, a doubling transform, and a list-collecting sink.

### Milestone 3: Built-In Blocks (Days 4-5)

Implement `TransformBlock<TIn, TOut>` (sync function wrapper), `AsyncTransformBlock<TIn, TOut>` (async function wrapper), `FilterBlock<T>` (predicate — items that fail the predicate are dropped), `BatchBlock<T>` (accumulates items into fixed-size lists), and `FlatMapBlock<TIn, TOut>` (one-to-many). Write thorough tests for each block, especially `BatchBlock` (partial final batch) and `FlatMapBlock` (empty output).

### Milestone 4: PipelineBuilder Fluent API (Days 5-6)

Implement the `PipelineBuilder<T>` with methods: `FromSource`, `Transform`, `AsyncTransform`, `Filter`, `Batch`, `FlatMap`, `Sink`, `WithParallelism`, `WithErrorPolicy`, `WithMetrics`, `Build`. The builder accumulates stage descriptors and `Build()` constructs the `PipelineEngine`. Test that the builder produces correct pipelines and that type inference works through the chain.

### Milestone 5: Error Handling and Poison Queue (Days 6-8)

Implement `ErrorPolicy` enum and `RetryHandler` with configurable max retries and exponential backoff with jitter. Implement `PoisonQueue<T>` as a channel that collects failed items. Integrate error handling into `StageRunner`. Test retry behavior, skip behavior, and fail behavior. Verify poison queue contains the correct items after a pipeline run.

### Milestone 6: Pipeline Metrics (Days 8-9)

Add real-time metrics: items processed per stage, items/sec, average latency, queue depth. Create `PipelineMetrics` that aggregates all `StageMetrics`. Add a callback mechanism so callers can subscribe to periodic metric snapshots. Test metric accuracy under load.

### Milestone 7: SqlServerSource, SqlBulkCopySink, CsvFileSource (Days 9-11)

Implement `SqlServerSource<T>` that executes a query and maps `SqlDataReader` rows to `T` using a provided mapping function. Implement `SqlBulkCopySink<T>` using a custom `IDataReader` adapter. Implement `CsvFileSource<T>` that streams CSV rows. Write integration tests with SQL Server.

### Milestone 8: Demo Application and OracleSource (Days 11-14)

Build a demo console app that constructs a pipeline: read from a CSV, transform, filter, batch, and write to SQL Server. Show metrics output. Implement `OracleSource<T>` following the same pattern as `SqlServerSource<T>`. Test end-to-end with real databases.

---

## Testing Requirements

### Unit Tests

- **ChannelLink**: Test bounded capacity, backpressure (writer blocks when full), completion propagation.
- **StageRunner**: Test single and multi-worker execution. Verify all items are processed exactly once. Test cancellation mid-stream.
- **TransformBlock**: Test sync and async transforms. Test that exceptions are handled per error policy.
- **FilterBlock**: Test that matching items pass through and non-matching items are dropped. Test with always-true and always-false predicates.
- **BatchBlock**: Test exact batch boundaries, partial final batch, batch size of 1, empty input.
- **FlatMapBlock**: Test one-to-many, one-to-zero, and one-to-one mappings.
- **PipelineBuilder**: Test that building a pipeline with various stage combinations produces correct stage counts and types.
- **RetryHandler**: Test retry count, backoff timing, and eventual skip/fail after max retries.
- **PoisonQueue**: Test that failed items are captured with the original exception.

### Integration Tests

- **End-to-End**: Run a pipeline from an in-memory source through multiple transforms to an in-memory sink. Verify output matches expected transformation.
- **Backpressure**: Run a pipeline where the sink is artificially slow. Verify that the source pauses (channel fills up) and resumes.
- **Error Propagation**: Run a pipeline where a transform throws on specific items. Verify skip policy continues, retry policy retries, and fail policy aborts.
- **Cancellation**: Start a pipeline, cancel after N items, verify graceful shutdown.
- **Metrics Accuracy**: Run a known workload and verify metric counters match expected values.

### Performance Tests

- Verify a pipeline can sustain 100K+ items/sec through a simple transform.
- Verify that parallelism improves throughput for CPU-bound transforms.
- Verify memory stays constant for large pipelines (no buffering entire dataset).

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### Pipeline.Core/Abstractions/IPipelineSource.cs

```csharp
namespace Pipeline.Core.Abstractions;

public interface IPipelineStage
{
    string Name { get; }
    StageMetrics Metrics { get; }
}

public interface IPipelineSource<T> : IPipelineStage
{
    IAsyncEnumerable<T> ProduceAsync(CancellationToken ct = default);
}

public interface IPipelineTransform<TIn, TOut> : IPipelineStage
{
    Task<TOut> ProcessAsync(TIn input, CancellationToken ct = default);
}

public interface IPipelineSink<T> : IPipelineStage
{
    Task ConsumeAsync(T input, CancellationToken ct = default);
    Task FlushAsync(CancellationToken ct = default);
}

public class StageMetrics
{
    private long _itemsProcessed;
    private long _itemsFailed;
    private long _totalLatencyTicks;

    public long ItemsProcessed => Interlocked.Read(ref _itemsProcessed);
    public long ItemsFailed => Interlocked.Read(ref _itemsFailed);
    public double AverageLatencyMs => _itemsProcessed > 0
        ? (double)Interlocked.Read(ref _totalLatencyTicks) / _itemsProcessed / TimeSpan.TicksPerMillisecond
        : 0;

    public void RecordSuccess(long latencyTicks)
    {
        Interlocked.Increment(ref _itemsProcessed);
        Interlocked.Add(ref _totalLatencyTicks, latencyTicks);
    }

    public void RecordFailure()
    {
        Interlocked.Increment(ref _itemsFailed);
    }
}
```

### Pipeline.Core/Engine/ChannelLink.cs

```csharp
using System.Threading.Channels;

namespace Pipeline.Core.Engine;

public class ChannelLink<T>
{
    private readonly Channel<T> _channel;

    public ChannelReader<T> Reader => _channel.Reader;
    public ChannelWriter<T> Writer => _channel.Writer;
    public int Capacity { get; }

    public int CurrentQueueDepth
    {
        get
        {
            try { return _channel.Reader.Count; }
            catch { return -1; }
        }
    }

    public ChannelLink(int capacity = 10_000)
    {
        Capacity = capacity;
        _channel = Channel.CreateBounded<T>(new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleWriter = false,
            SingleReader = false
        });
    }
}
```

### Pipeline.Core/ErrorHandling/ErrorPolicy.cs

```csharp
namespace Pipeline.Core.ErrorHandling;

public enum ErrorPolicyKind
{
    Fail,
    Skip,
    Retry
}

public class ErrorPolicy
{
    public ErrorPolicyKind Kind { get; init; } = ErrorPolicyKind.Fail;
    public int MaxRetries { get; init; } = 3;
    public TimeSpan InitialRetryDelay { get; init; } = TimeSpan.FromMilliseconds(100);
    public double BackoffMultiplier { get; init; } = 2.0;

    public static ErrorPolicy Fail => new() { Kind = ErrorPolicyKind.Fail };
    public static ErrorPolicy Skip => new() { Kind = ErrorPolicyKind.Skip };
    public static ErrorPolicy Retry(int maxRetries = 3) =>
        new() { Kind = ErrorPolicyKind.Retry, MaxRetries = maxRetries };
}

public record PoisonItem<T>(T Item, Exception Exception, string StageName, DateTime Timestamp);
```

### Pipeline.Core/ErrorHandling/RetryHandler.cs

```csharp
namespace Pipeline.Core.ErrorHandling;

public class RetryHandler
{
    private readonly ErrorPolicy _policy;
    private readonly Random _jitter = new();

    public RetryHandler(ErrorPolicy policy)
    {
        _policy = policy;
    }

    public async Task<TResult> ExecuteAsync<TResult>(
        Func<CancellationToken, Task<TResult>> action,
        CancellationToken ct = default)
    {
        int attempt = 0;
        var delay = _policy.InitialRetryDelay;

        while (true)
        {
            try
            {
                return await action(ct);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception) when (attempt < _policy.MaxRetries)
            {
                attempt++;
                var jitteredDelay = delay * (0.5 + _jitter.NextDouble());
                await Task.Delay(jitteredDelay, ct);
                delay *= _policy.BackoffMultiplier;
            }
        }
    }
}
```

### Pipeline.Core/ErrorHandling/PoisonQueue.cs

```csharp
using System.Collections.Concurrent;

namespace Pipeline.Core.ErrorHandling;

public class PoisonQueue<T>
{
    private readonly ConcurrentBag<PoisonItem<T>> _items = new();

    public int Count => _items.Count;

    public void Add(T item, Exception ex, string stageName)
    {
        _items.Add(new PoisonItem<T>(item, ex, stageName, DateTime.UtcNow));
    }

    public IReadOnlyList<PoisonItem<T>> GetAll() => _items.ToList();

    public void Clear() => _items.Clear();
}
```

### Pipeline.Core/Engine/StageRunner.cs

```csharp
using Pipeline.Core.Abstractions;
using Pipeline.Core.ErrorHandling;
using System.Diagnostics;

namespace Pipeline.Core.Engine;

public class StageRunner
{
    public static async Task RunSourceAsync<T>(
        IPipelineSource<T> source,
        ChannelLink<T> output,
        CancellationToken ct)
    {
        try
        {
            await foreach (var item in source.ProduceAsync(ct))
            {
                var sw = Stopwatch.StartNew();
                await output.Writer.WriteAsync(item, ct);
                sw.Stop();
                source.Metrics.RecordSuccess(sw.ElapsedTicks);
            }
        }
        finally
        {
            output.Writer.Complete();
        }
    }

    public static async Task RunTransformAsync<TIn, TOut>(
        IPipelineTransform<TIn, TOut> transform,
        ChannelLink<TIn> input,
        ChannelLink<TOut> output,
        int parallelism,
        ErrorPolicy errorPolicy,
        PoisonQueue<TIn>? poisonQueue,
        CancellationToken ct)
    {
        var workers = Enumerable.Range(0, parallelism).Select(_ =>
            Task.Run(async () =>
            {
                var retryHandler = errorPolicy.Kind == ErrorPolicyKind.Retry
                    ? new RetryHandler(errorPolicy) : null;

                await foreach (var item in input.Reader.ReadAllAsync(ct))
                {
                    var sw = Stopwatch.StartNew();
                    try
                    {
                        TOut result;
                        if (retryHandler is not null)
                        {
                            result = await retryHandler.ExecuteAsync(
                                async innerCt => await transform.ProcessAsync(item, innerCt), ct);
                        }
                        else
                        {
                            result = await transform.ProcessAsync(item, ct);
                        }

                        await output.Writer.WriteAsync(result, ct);
                        sw.Stop();
                        transform.Metrics.RecordSuccess(sw.ElapsedTicks);
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception ex)
                    {
                        transform.Metrics.RecordFailure();

                        switch (errorPolicy.Kind)
                        {
                            case ErrorPolicyKind.Skip:
                                poisonQueue?.Add(item, ex, transform.Name);
                                continue;

                            case ErrorPolicyKind.Retry:
                                // Retry exhausted, treat as skip or fail
                                poisonQueue?.Add(item, ex, transform.Name);
                                continue;

                            case ErrorPolicyKind.Fail:
                            default:
                                poisonQueue?.Add(item, ex, transform.Name);
                                throw;
                        }
                    }
                }
            }, ct)).ToArray();

        try
        {
            await Task.WhenAll(workers);
        }
        finally
        {
            output.Writer.Complete();
        }
    }

    public static async Task RunSinkAsync<T>(
        IPipelineSink<T> sink,
        ChannelLink<T> input,
        int parallelism,
        ErrorPolicy errorPolicy,
        PoisonQueue<T>? poisonQueue,
        CancellationToken ct)
    {
        var workers = Enumerable.Range(0, parallelism).Select(_ =>
            Task.Run(async () =>
            {
                var retryHandler = errorPolicy.Kind == ErrorPolicyKind.Retry
                    ? new RetryHandler(errorPolicy) : null;

                await foreach (var item in input.Reader.ReadAllAsync(ct))
                {
                    var sw = Stopwatch.StartNew();
                    try
                    {
                        if (retryHandler is not null)
                        {
                            await retryHandler.ExecuteAsync(async innerCt =>
                            {
                                await sink.ConsumeAsync(item, innerCt);
                                return true;
                            }, ct);
                        }
                        else
                        {
                            await sink.ConsumeAsync(item, ct);
                        }

                        sw.Stop();
                        sink.Metrics.RecordSuccess(sw.ElapsedTicks);
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception ex)
                    {
                        sink.Metrics.RecordFailure();

                        switch (errorPolicy.Kind)
                        {
                            case ErrorPolicyKind.Skip:
                                poisonQueue?.Add(item, ex, sink.Name);
                                continue;

                            case ErrorPolicyKind.Retry:
                                poisonQueue?.Add(item, ex, sink.Name);
                                continue;

                            case ErrorPolicyKind.Fail:
                            default:
                                poisonQueue?.Add(item, ex, sink.Name);
                                throw;
                        }
                    }
                }
            }, ct)).ToArray();

        await Task.WhenAll(workers);
        await sink.FlushAsync(ct);
    }
}
```

### Pipeline.Core/Blocks/TransformBlock.cs and Others

```csharp
using Pipeline.Core.Abstractions;

namespace Pipeline.Core.Blocks;

public class TransformBlock<TIn, TOut> : IPipelineTransform<TIn, TOut>
{
    private readonly Func<TIn, TOut> _transform;

    public string Name { get; }
    public StageMetrics Metrics { get; } = new();

    public TransformBlock(Func<TIn, TOut> transform, string? name = null)
    {
        _transform = transform;
        Name = name ?? $"Transform<{typeof(TIn).Name},{typeof(TOut).Name}>";
    }

    public Task<TOut> ProcessAsync(TIn input, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(_transform(input));
    }
}

public class AsyncTransformBlock<TIn, TOut> : IPipelineTransform<TIn, TOut>
{
    private readonly Func<TIn, CancellationToken, Task<TOut>> _transform;

    public string Name { get; }
    public StageMetrics Metrics { get; } = new();

    public AsyncTransformBlock(Func<TIn, CancellationToken, Task<TOut>> transform,
        string? name = null)
    {
        _transform = transform;
        Name = name ?? $"AsyncTransform<{typeof(TIn).Name},{typeof(TOut).Name}>";
    }

    public Task<TOut> ProcessAsync(TIn input, CancellationToken ct = default)
    {
        return _transform(input, ct);
    }
}

public class FilterBlock<T> : IPipelineTransform<T, T>
{
    private readonly Func<T, bool> _predicate;
    private long _filtered;

    public string Name { get; }
    public StageMetrics Metrics { get; } = new();
    public long FilteredCount => Interlocked.Read(ref _filtered);

    public FilterBlock(Func<T, bool> predicate, string? name = null)
    {
        _predicate = predicate;
        Name = name ?? $"Filter<{typeof(T).Name}>";
    }

    public Task<T> ProcessAsync(T input, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();

        if (_predicate(input))
            return Task.FromResult(input);

        Interlocked.Increment(ref _filtered);
        // Signal that this item should be dropped — the runner handles null convention
        // We use a special exception that the runner catches
        throw new FilteredOutException();
    }
}

/// <summary>Signals that an item was intentionally filtered out, not a real error.</summary>
public class FilteredOutException : Exception
{
    public FilteredOutException() : base("Item filtered out.") { }
}
```

### Pipeline.Core/Blocks/BatchBlock.cs

```csharp
using Pipeline.Core.Abstractions;

namespace Pipeline.Core.Blocks;

/// <summary>
/// Accumulates individual items into fixed-size batches.
/// The final batch may be smaller than the batch size.
/// This block is used as a special stage — it reads from an input channel
/// and writes batches to an output channel.
/// </summary>
public class BatchBlock<T>
{
    private readonly int _batchSize;

    public string Name { get; }

    public BatchBlock(int batchSize, string? name = null)
    {
        if (batchSize <= 0)
            throw new ArgumentOutOfRangeException(nameof(batchSize));

        _batchSize = batchSize;
        Name = name ?? $"Batch<{typeof(T).Name}>({batchSize})";
    }

    public async IAsyncEnumerable<IReadOnlyList<T>> BatchAsync(
        IAsyncEnumerable<T> source,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var batch = new List<T>(_batchSize);

        await foreach (var item in source.WithCancellation(ct))
        {
            batch.Add(item);

            if (batch.Count >= _batchSize)
            {
                yield return batch.ToList();
                batch.Clear();
            }
        }

        // Flush remaining items
        if (batch.Count > 0)
        {
            yield return batch;
        }
    }
}
```

### Pipeline.Core/Blocks/FlatMapBlock.cs

```csharp
using Pipeline.Core.Abstractions;

namespace Pipeline.Core.Blocks;

/// <summary>
/// Transforms one input item into zero or more output items.
/// </summary>
public class FlatMapBlock<TIn, TOut>
{
    private readonly Func<TIn, IEnumerable<TOut>> _flatMap;

    public string Name { get; }
    public StageMetrics Metrics { get; } = new();

    public FlatMapBlock(Func<TIn, IEnumerable<TOut>> flatMap, string? name = null)
    {
        _flatMap = flatMap;
        Name = name ?? $"FlatMap<{typeof(TIn).Name},{typeof(TOut).Name}>";
    }

    public IEnumerable<TOut> Process(TIn input) => _flatMap(input);
}
```

### Pipeline.Core/Metrics/PipelineMetrics.cs

```csharp
using Pipeline.Core.Abstractions;
using System.Diagnostics;
using System.Text;

namespace Pipeline.Core.Metrics;

public class PipelineMetrics
{
    private readonly List<IPipelineStage> _stages = new();
    private readonly Stopwatch _elapsed = new();

    public TimeSpan Elapsed => _elapsed.Elapsed;
    public IReadOnlyList<IPipelineStage> Stages => _stages;

    public void RegisterStage(IPipelineStage stage) => _stages.Add(stage);
    public void Start() => _elapsed.Start();
    public void Stop() => _elapsed.Stop();

    public string GetSummary()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Pipeline completed in {_elapsed.Elapsed:hh\\:mm\\:ss\\.fff}");
        sb.AppendLine(new string('-', 80));
        sb.AppendLine($"{"Stage",-35} {"Processed",12} {"Failed",10} {"Avg Latency",15}");
        sb.AppendLine(new string('-', 80));

        foreach (var stage in _stages)
        {
            var m = stage.Metrics;
            sb.AppendLine($"{stage.Name,-35} {m.ItemsProcessed,12:N0} " +
                $"{m.ItemsFailed,10:N0} {m.AverageLatencyMs,12:F2} ms");
        }

        return sb.ToString();
    }
}
```

### Pipeline.Core/Builder/PipelineBuilder.cs

```csharp
using Pipeline.Core.Abstractions;
using Pipeline.Core.Blocks;
using Pipeline.Core.Engine;
using Pipeline.Core.ErrorHandling;
using Pipeline.Core.Metrics;

namespace Pipeline.Core.Builder;

public class PipelineStageConfig
{
    public int Parallelism { get; set; } = 1;
    public int ChannelCapacity { get; set; } = 10_000;
    public ErrorPolicy ErrorPolicy { get; set; } = ErrorPolicy.Fail;
}

public static class PipelineBuilder
{
    public static PipelineBuilder<T> FromSource<T>(IPipelineSource<T> source)
    {
        return new PipelineBuilder<T>(source);
    }
}

public class PipelineBuilder<T>
{
    private readonly IPipelineSource<object> _source;
    private readonly List<(object stage, PipelineStageConfig config)> _stages = new();
    private PipelineStageConfig _nextConfig = new();
    private bool _enableMetrics;

    internal PipelineBuilder(IPipelineSource<T> source)
    {
        _source = new SourceAdapter<T>(source);
    }

    private PipelineBuilder(IPipelineSource<object> source,
        List<(object stage, PipelineStageConfig config)> stages,
        bool enableMetrics)
    {
        _source = source;
        _stages = stages;
        _enableMetrics = enableMetrics;
    }

    public PipelineBuilder<TOut> Transform<TOut>(Func<T, TOut> transform, string? name = null)
    {
        var block = new TransformBlock<T, TOut>(transform, name);
        return AddTransform<TOut>(block);
    }

    public PipelineBuilder<TOut> AsyncTransform<TOut>(
        Func<T, CancellationToken, Task<TOut>> transform, string? name = null)
    {
        var block = new AsyncTransformBlock<T, TOut>(transform, name);
        return AddTransform<TOut>(block);
    }

    public PipelineBuilder<T> Filter(Func<T, bool> predicate, string? name = null)
    {
        var block = new FilterBlock<T>(predicate, name);
        var config = _nextConfig;
        _nextConfig = new PipelineStageConfig();

        var newStages = new List<(object, PipelineStageConfig)>(_stages)
        {
            (new TransformAdapter<T, T>(block), config)
        };

        return new PipelineBuilder<T>(_source, newStages, _enableMetrics);
    }

    public PipelineBuilder<T> WithParallelism(int parallelism)
    {
        _nextConfig.Parallelism = parallelism;
        return this;
    }

    public PipelineBuilder<T> WithChannelCapacity(int capacity)
    {
        _nextConfig.ChannelCapacity = capacity;
        return this;
    }

    public PipelineBuilder<T> WithErrorPolicy(ErrorPolicy policy)
    {
        _nextConfig.ErrorPolicy = policy;
        return this;
    }

    public PipelineBuilder<T> WithMetrics()
    {
        _enableMetrics = true;
        return this;
    }

    public ExecutablePipeline Sink(IPipelineSink<T> sink)
    {
        var sinkConfig = _nextConfig;
        return new ExecutablePipeline(_source, _stages, new SinkAdapter<T>(sink),
            sinkConfig, _enableMetrics);
    }

    private PipelineBuilder<TOut> AddTransform<TOut>(IPipelineTransform<T, TOut> block)
    {
        var config = _nextConfig;
        _nextConfig = new PipelineStageConfig();

        var newStages = new List<(object, PipelineStageConfig)>(_stages)
        {
            (new TransformAdapter<T, TOut>(block), config)
        };

        return new PipelineBuilder<TOut>(_source, newStages, _enableMetrics);
    }

    // Adapters to erase generic types for storage
    private class SourceAdapter<TSource> : IPipelineSource<object>
    {
        private readonly IPipelineSource<TSource> _inner;
        public string Name => _inner.Name;
        public StageMetrics Metrics => _inner.Metrics;

        public SourceAdapter(IPipelineSource<TSource> inner) => _inner = inner;

        public async IAsyncEnumerable<object> ProduceAsync(
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
        {
            await foreach (var item in _inner.ProduceAsync(ct))
                yield return item!;
        }
    }

    internal class TransformAdapter<TIn, TOut>
    {
        public IPipelineTransform<TIn, TOut> Inner { get; }
        public TransformAdapter(IPipelineTransform<TIn, TOut> inner) => Inner = inner;
    }

    internal class SinkAdapter<TSink>
    {
        public IPipelineSink<TSink> Inner { get; }
        public SinkAdapter(IPipelineSink<TSink> inner) => Inner = inner;
    }
}

public class ExecutablePipeline
{
    private readonly IPipelineSource<object> _source;
    private readonly List<(object stage, PipelineStageConfig config)> _transforms;
    private readonly object _sink;
    private readonly PipelineStageConfig _sinkConfig;
    private readonly bool _enableMetrics;

    internal ExecutablePipeline(
        IPipelineSource<object> source,
        List<(object stage, PipelineStageConfig config)> transforms,
        object sink,
        PipelineStageConfig sinkConfig,
        bool enableMetrics)
    {
        _source = source;
        _transforms = transforms;
        _sink = sink;
        _sinkConfig = sinkConfig;
        _enableMetrics = enableMetrics;
    }

    public async Task<PipelineMetrics> RunAsync(CancellationToken ct = default)
    {
        var metrics = new PipelineMetrics();
        metrics.RegisterStage(_source);
        metrics.Start();

        // Build channel chain dynamically
        var sourceOutput = new ChannelLink<object>(10_000);

        // Start source
        var sourceTask = Task.Run(async () =>
        {
            try
            {
                await foreach (var item in _source.ProduceAsync(ct))
                {
                    await sourceOutput.Writer.WriteAsync(item, ct);
                    _source.Metrics.RecordSuccess(0);
                }
            }
            finally
            {
                sourceOutput.Writer.Complete();
            }
        }, ct);

        // Chain transforms
        var currentInput = sourceOutput;

        var transformTasks = new List<Task>();
        foreach (var (stage, config) in _transforms)
        {
            var output = new ChannelLink<object>(config.ChannelCapacity);

            var input = currentInput;
            var stageCapture = stage;
            var configCapture = config;

            // Use dynamic dispatch to handle the generic transform
            var task = Task.Run(async () =>
            {
                await RunGenericTransform(stageCapture, input, output,
                    configCapture, metrics, ct);
            }, ct);

            transformTasks.Add(task);
            currentInput = output;
        }

        // Start sink
        var sinkTask = RunGenericSink(_sink, currentInput, _sinkConfig, metrics, ct);

        await sourceTask;
        await Task.WhenAll(transformTasks);
        await sinkTask;

        metrics.Stop();
        return metrics;
    }

    private static async Task RunGenericTransform(
        object stage, ChannelLink<object> input, ChannelLink<object> output,
        PipelineStageConfig config, PipelineMetrics metrics, CancellationToken ct)
    {
        // Extract the inner transform via reflection-free dynamic approach
        var stageType = stage.GetType();
        var innerProp = stageType.GetProperty("Inner")!;
        dynamic innerTransform = innerProp.GetValue(stage)!;

        metrics.RegisterStage((IPipelineStage)innerTransform);

        var workers = Enumerable.Range(0, config.Parallelism).Select(_ =>
            Task.Run(async () =>
            {
                await foreach (var item in input.Reader.ReadAllAsync(ct))
                {
                    try
                    {
                        object result = await innerTransform.ProcessAsync((dynamic)item, ct);
                        await output.Writer.WriteAsync(result, ct);
                        ((IPipelineStage)innerTransform).Metrics.RecordSuccess(0);
                    }
                    catch (FilteredOutException) { /* item dropped */ }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception)
                    {
                        ((IPipelineStage)innerTransform).Metrics.RecordFailure();
                        if (config.ErrorPolicy.Kind == ErrorPolicyKind.Fail) throw;
                    }
                }
            }, ct)).ToArray();

        try { await Task.WhenAll(workers); }
        finally { output.Writer.Complete(); }
    }

    private static async Task RunGenericSink(
        object sinkAdapter, ChannelLink<object> input,
        PipelineStageConfig config, PipelineMetrics metrics, CancellationToken ct)
    {
        var sinkType = sinkAdapter.GetType();
        var innerProp = sinkType.GetProperty("Inner")!;
        dynamic innerSink = innerProp.GetValue(sinkAdapter)!;

        metrics.RegisterStage((IPipelineStage)innerSink);

        var workers = Enumerable.Range(0, config.Parallelism).Select(_ =>
            Task.Run(async () =>
            {
                await foreach (var item in input.Reader.ReadAllAsync(ct))
                {
                    try
                    {
                        await innerSink.ConsumeAsync((dynamic)item, ct);
                        ((IPipelineStage)innerSink).Metrics.RecordSuccess(0);
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception)
                    {
                        ((IPipelineStage)innerSink).Metrics.RecordFailure();
                        if (config.ErrorPolicy.Kind == ErrorPolicyKind.Fail) throw;
                    }
                }
            }, ct)).ToArray();

        await Task.WhenAll(workers);
        await innerSink.FlushAsync(ct);
    }
}
```

### Pipeline.SqlServer/SqlServerSource.cs

```csharp
using Microsoft.Data.SqlClient;
using Pipeline.Core.Abstractions;
using System.Runtime.CompilerServices;

namespace Pipeline.SqlServer;

public class SqlServerSource<T> : IPipelineSource<T>
{
    private readonly string _connectionString;
    private readonly string _query;
    private readonly Func<SqlDataReader, T> _mapper;

    public string Name { get; }
    public StageMetrics Metrics { get; } = new();

    public SqlServerSource(string connectionString, string query,
        Func<SqlDataReader, T> mapper, string? name = null)
    {
        _connectionString = connectionString;
        _query = query;
        _mapper = mapper;
        Name = name ?? $"SqlServerSource<{typeof(T).Name}>";
    }

    public async IAsyncEnumerable<T> ProduceAsync(
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        await using var command = new SqlCommand(_query, connection);
        command.CommandTimeout = 300;

        await using var reader = await command.ExecuteReaderAsync(
            System.Data.CommandBehavior.SequentialAccess, ct);

        while (await reader.ReadAsync(ct))
        {
            yield return _mapper(reader);
        }
    }
}
```

### Pipeline.SqlServer/SqlBulkCopySink.cs

```csharp
using Microsoft.Data.SqlClient;
using Pipeline.Core.Abstractions;
using System.Data;

namespace Pipeline.SqlServer;

public class SqlBulkCopySink<T> : IPipelineSink<IReadOnlyList<T>>
{
    private readonly string _connectionString;
    private readonly string _targetTable;
    private readonly Func<T, object[]> _mapper;
    private readonly string[] _columnNames;

    public string Name { get; }
    public StageMetrics Metrics { get; } = new();

    public SqlBulkCopySink(
        string connectionString,
        string targetTable,
        string[] columnNames,
        Func<T, object[]> mapper,
        string? name = null)
    {
        _connectionString = connectionString;
        _targetTable = targetTable;
        _columnNames = columnNames;
        _mapper = mapper;
        Name = name ?? $"SqlBulkCopySink<{typeof(T).Name}>";
    }

    public async Task ConsumeAsync(IReadOnlyList<T> batch, CancellationToken ct = default)
    {
        if (batch.Count == 0) return;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        using var bulkCopy = new SqlBulkCopy(connection)
        {
            DestinationTableName = _targetTable,
            BatchSize = batch.Count,
            BulkCopyTimeout = 120
        };

        for (int i = 0; i < _columnNames.Length; i++)
        {
            bulkCopy.ColumnMappings.Add(i, _columnNames[i]);
        }

        var rows = batch.Select(_mapper).ToList();
        using var reader = new ObjectArrayDataReader(rows, _columnNames);
        await bulkCopy.WriteToServerAsync(reader, ct);
    }

    public Task FlushAsync(CancellationToken ct = default) => Task.CompletedTask;
}

internal class ObjectArrayDataReader : IDataReader
{
    private readonly IReadOnlyList<object[]> _rows;
    private readonly string[] _columnNames;
    private int _index = -1;

    public ObjectArrayDataReader(IReadOnlyList<object[]> rows, string[] columnNames)
    {
        _rows = rows;
        _columnNames = columnNames;
    }

    public int FieldCount => _columnNames.Length;
    public bool Read() => ++_index < _rows.Count;
    public object GetValue(int i) => _rows[_index][i] ?? DBNull.Value;
    public string GetName(int i) => _columnNames[i];
    public int GetOrdinal(string name) => Array.IndexOf(_columnNames, name);
    public bool IsDBNull(int i) => _rows[_index][i] is null or DBNull;

    public int GetValues(object[] values)
    {
        var row = _rows[_index];
        var count = Math.Min(values.Length, row.Length);
        Array.Copy(row, values, count);
        return count;
    }

    // Minimal IDataReader implementation
    public object this[int i] => GetValue(i);
    public object this[string name] => GetValue(GetOrdinal(name));
    public int Depth => 0;
    public bool IsClosed => false;
    public int RecordsAffected => -1;
    public void Close() { }
    public void Dispose() { }
    public bool NextResult() => false;
    public DataTable GetSchemaTable() => new();
    public string GetDataTypeName(int i) => "object";
    public Type GetFieldType(int i) => typeof(object);
    public bool GetBoolean(int i) => (bool)GetValue(i);
    public byte GetByte(int i) => (byte)GetValue(i);
    public long GetBytes(int i, long o, byte[]? b, int bo, int l) => 0;
    public char GetChar(int i) => (char)GetValue(i);
    public long GetChars(int i, long o, char[]? b, int bo, int l) => 0;
    public IDataReader GetData(int i) => throw new NotSupportedException();
    public DateTime GetDateTime(int i) => (DateTime)GetValue(i);
    public decimal GetDecimal(int i) => (decimal)GetValue(i);
    public double GetDouble(int i) => (double)GetValue(i);
    public float GetFloat(int i) => (float)GetValue(i);
    public Guid GetGuid(int i) => (Guid)GetValue(i);
    public short GetInt16(int i) => (short)GetValue(i);
    public int GetInt32(int i) => (int)GetValue(i);
    public long GetInt64(int i) => (long)GetValue(i);
    public string GetString(int i) => (string)GetValue(i);
}
```

### Pipeline.Demo/Program.cs

```csharp
using Pipeline.Core.Abstractions;
using Pipeline.Core.Blocks;
using Pipeline.Core.Builder;
using Pipeline.Core.ErrorHandling;

// --- Demo: In-memory pipeline ---

Console.WriteLine("=== Async Data Pipeline Framework Demo ===");
Console.WriteLine();

// Define a simple record for demonstration
var source = new EnumerableSource<int>(
    Enumerable.Range(1, 100_000), "NumberSource");

var sink = new ListSink<string>("ResultSink");

var pipeline = PipelineBuilder
    .FromSource(source)
    .WithParallelism(4)
    .Transform(x => x * 2, "Double")
    .Filter(x => x % 3 != 0, "SkipMultiplesOf3")
    .Transform(x => $"Value: {x}", "Format")
    .WithMetrics()
    .Sink(sink);

using var cts = new CancellationTokenSource();
var metrics = await pipeline.RunAsync(cts.Token);

Console.WriteLine(metrics.GetSummary());
Console.WriteLine($"Sink received {sink.Items.Count:N0} items.");
Console.WriteLine($"First 5: {string.Join(", ", sink.Items.Take(5))}");

// --- Helper implementations for demo ---

public class EnumerableSource<T> : IPipelineSource<T>
{
    private readonly IEnumerable<T> _items;
    public string Name { get; }
    public StageMetrics Metrics { get; } = new();

    public EnumerableSource(IEnumerable<T> items, string name)
    {
        _items = items;
        Name = name;
    }

    public async IAsyncEnumerable<T> ProduceAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        foreach (var item in _items)
        {
            ct.ThrowIfCancellationRequested();
            yield return item;
            await Task.Yield();
        }
    }
}

public class ListSink<T> : IPipelineSink<T>
{
    private readonly List<T> _items = new();
    private readonly object _lock = new();

    public string Name { get; }
    public StageMetrics Metrics { get; } = new();
    public IReadOnlyList<T> Items
    {
        get { lock (_lock) return _items.ToList(); }
    }

    public ListSink(string name) => Name = name;

    public Task ConsumeAsync(T input, CancellationToken ct = default)
    {
        lock (_lock) _items.Add(input);
        return Task.CompletedTask;
    }

    public Task FlushAsync(CancellationToken ct = default) => Task.CompletedTask;
}
```

</details>

---

## What to Show Off

### Portfolio Presentation

- Draw the pipeline architecture on a whiteboard: sources feeding channels feeding transforms feeding channels feeding sinks, with backpressure arrows going upstream.
- Demo the framework with a live pipeline: show the metrics output updating in real-time as data flows through stages at different speeds.
- Show the fluent builder API and explain how generics track the type through the chain at compile time.
- Compare your framework's throughput to a naive sequential implementation.

### Interview Talking Points

- **Backpressure**: Explain why bounded channels are critical. Without backpressure, a fast source can overwhelm a slow sink and exhaust memory. Draw the "firehose into a straw" analogy.
- **Concurrency model**: Explain how multiple workers reading from the same channel naturally load-balance. Discuss why `Channel<T>` is superior to `BlockingCollection<T>` for async scenarios.
- **Error isolation**: Explain how per-stage error policies prevent one bad record from killing an entire pipeline. Connect this to real-world data quality issues.
- **Framework design**: Discuss the trade-offs of using generics for type safety vs. erasing types for dynamic pipeline construction. Explain why you chose the approach you did.

---

## Stretch Goals

1. **OracleSource Implementation**: Add `OracleSource<T>` using `Oracle.ManagedDataAccess.Core`, with ROWID-based chunking for parallel reads from partitioned tables.
2. **Pipeline Visualization**: Write a `PipelineVisualizer` that outputs a Mermaid diagram of the pipeline topology, showing stage names, parallelism, and channel capacities.
3. **Distributed Metrics**: Emit metrics to an `IMetricsExporter` interface with implementations for console, JSON file, and Prometheus-compatible format.
4. **Hot-Reload Configuration**: Support changing parallelism and channel capacity at runtime without restarting the pipeline, by draining and recreating affected stages.
5. **Composite Pipelines**: Support fan-out (one source feeding multiple independent downstream branches) and fan-in (multiple sources merging into one sink) topologies.
