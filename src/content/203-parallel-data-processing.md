# Parallel Data Processing

*Chapter 13.4 — Data Engineering Patterns in C#*

## Overview

Modern data pipelines must saturate available CPU, memory, and network bandwidth to
meet SLAs. C# offers several complementary concurrency primitives for data engineering:
`Parallel.ForEachAsync` for bounded parallel work, `System.Threading.Channels` for
producer/consumer pipelines, `SemaphoreSlim` for throttling, and `Task.WhenAll` for
fan-out/fan-in. This lesson covers each primitive, when to use it, how to apply
backpressure so producers do not overwhelm consumers, and how to compose them into
high-throughput ETL pipelines.

## Core Concepts

### Parallel.ForEachAsync
Introduced in .NET 6. Processes items from an `IAsyncEnumerable<T>` or
`IEnumerable<T>` with bounded concurrency. Ideal when each item is an independent
unit of work (e.g., processing one chunk of rows).

### System.Threading.Channels
A high-performance async producer/consumer queue. Bounded channels provide built-in
backpressure — the producer awaits when the channel is full. Unbounded channels
never block the writer but risk memory exhaustion.

### Producer/Consumer Pattern
One or more producers generate data, one or more consumers process it. The channel
decouples them: producers and consumers run at their own pace, bounded by the
channel's capacity.

### Backpressure
When a downstream stage is slower than an upstream stage, backpressure signals the
upstream to slow down. Without backpressure, fast producers fill memory until OOM.

### SemaphoreSlim
A lightweight semaphore for limiting concurrent access to a resource. Use it when
you need finer control than `MaxDegreeOfParallelism` — for example, limiting
concurrent Oracle connections while allowing higher parallelism for CPU transforms.

## Code Examples

### Parallel.ForEachAsync — Chunk Processing

```csharp
public async Task ProcessChunksParallelAsync(
    IReadOnlyList<PkRange> chunks,
    CancellationToken ct)
{
    var totalRows = 0;

    await Parallel.ForEachAsync(
        chunks,
        new ParallelOptions
        {
            MaxDegreeOfParallelism = 8,
            CancellationToken = ct
        },
        async (chunk, token) =>
        {
            // Each iteration gets its own connection from the pool
            await using var conn = await CreateOracleConnectionAsync(token);
            var rows = await ExtractAndLoadChunkAsync(conn, chunk, token);
            Interlocked.Add(ref totalRows, rows);
        });

    _logger.LogInformation("Processed {Total} total rows", totalRows);
}
```

### Channels — Producer/Consumer Pipeline

```csharp
public class ChannelPipeline
{
    private readonly int _boundedCapacity;

    public ChannelPipeline(int boundedCapacity = 100)
        => _boundedCapacity = boundedCapacity;

    public async Task RunAsync(CancellationToken ct)
    {
        // Bounded channel: producer blocks when 100 batches are queued
        var extractChannel = Channel.CreateBounded<RawBatch>(
            new BoundedChannelOptions(_boundedCapacity)
            {
                FullMode = BoundedChannelFullMode.Wait,
                SingleWriter = true,
                SingleReader = false
            });

        var loadChannel = Channel.CreateBounded<CleanBatch>(
            new BoundedChannelOptions(_boundedCapacity)
            {
                FullMode = BoundedChannelFullMode.Wait,
                SingleWriter = false,
                SingleReader = true
            });

        // Start all stages concurrently
        var extractTask = ProduceAsync(extractChannel.Writer, ct);
        var transformTask = TransformAsync(
            extractChannel.Reader, loadChannel.Writer, ct);
        var loadTask = ConsumeAsync(loadChannel.Reader, ct);

        await Task.WhenAll(extractTask, transformTask, loadTask);
    }

    private async Task ProduceAsync(
        ChannelWriter<RawBatch> writer, CancellationToken ct)
    {
        try
        {
            await foreach (var batch in ReadBatchesFromOracleAsync(ct))
            {
                // This awaits if the channel is full — backpressure!
                await writer.WriteAsync(batch, ct);
            }
        }
        finally
        {
            writer.Complete();
        }
    }

    private async Task TransformAsync(
        ChannelReader<RawBatch> reader,
        ChannelWriter<CleanBatch> writer,
        CancellationToken ct)
    {
        try
        {
            await foreach (var raw in reader.ReadAllAsync(ct))
            {
                var clean = Transform(raw);
                await writer.WriteAsync(clean, ct);
            }
        }
        finally
        {
            writer.Complete();
        }
    }

    private async Task ConsumeAsync(
        ChannelReader<CleanBatch> reader, CancellationToken ct)
    {
        await foreach (var batch in reader.ReadAllAsync(ct))
        {
            await BulkLoadToSqlServerAsync(batch, ct);
        }
    }
}
```

### Multi-Consumer Channel

```csharp
public async Task RunMultiConsumerAsync(CancellationToken ct)
{
    var channel = Channel.CreateBounded<RawBatch>(50);

    // One producer
    var producer = ProduceAsync(channel.Writer, ct);

    // Multiple consumers — they compete for items from the channel
    var consumers = Enumerable.Range(0, 4)
        .Select(_ => ConsumeAsync(channel.Reader, ct))
        .ToArray();

    await producer;
    await Task.WhenAll(consumers);
}

private async Task ConsumeAsync(
    ChannelReader<RawBatch> reader, CancellationToken ct)
{
    // ReadAllAsync is safe for multiple readers —
    // each item is delivered to exactly one consumer
    await foreach (var batch in reader.ReadAllAsync(ct))
    {
        await ProcessBatchAsync(batch, ct);
    }
}
```

### SemaphoreSlim — Connection Throttling

```csharp
public class ThrottledExtractor
{
    private readonly SemaphoreSlim _oracleThrottle;
    private readonly SemaphoreSlim _sqlServerThrottle;

    public ThrottledExtractor(
        int maxOracleConnections = 10,
        int maxSqlServerConnections = 20)
    {
        _oracleThrottle = new SemaphoreSlim(maxOracleConnections);
        _sqlServerThrottle = new SemaphoreSlim(maxSqlServerConnections);
    }

    public async Task<int> ExtractAndLoadAsync(
        PkRange chunk, CancellationToken ct)
    {
        // Throttle Oracle reads
        await _oracleThrottle.WaitAsync(ct);
        List<RawRow> rows;
        try
        {
            rows = await ReadFromOracleAsync(chunk, ct);
        }
        finally
        {
            _oracleThrottle.Release();
        }

        var transformed = Transform(rows);

        // Throttle SQL Server writes (different limit)
        await _sqlServerThrottle.WaitAsync(ct);
        try
        {
            return await WriteToSqlServerAsync(transformed, ct);
        }
        finally
        {
            _sqlServerThrottle.Release();
        }
    }
}
```

### Combining Channels with Parallel.ForEachAsync

```csharp
public async Task RunHybridPipelineAsync(CancellationToken ct)
{
    var channel = Channel.CreateBounded<IReadOnlyList<CleanRow>>(20);

    // Producer: parallel extraction feeds into a channel
    var producer = Task.Run(async () =>
    {
        try
        {
            var chunks = await GetChunksAsync(ct);
            await Parallel.ForEachAsync(
                chunks,
                new ParallelOptions { MaxDegreeOfParallelism = 8 },
                async (chunk, token) =>
                {
                    var rows = await ExtractChunkAsync(chunk, token);
                    var clean = Transform(rows);
                    await channel.Writer.WriteAsync(clean, token);
                });
        }
        finally
        {
            channel.Writer.Complete();
        }
    }, ct);

    // Consumer: sequential bulk loads to avoid SqlBulkCopy contention
    var consumer = Task.Run(async () =>
    {
        await foreach (var batch in channel.Reader.ReadAllAsync(ct))
        {
            await BulkLoadAsync(batch, ct);
        }
    }, ct);

    await Task.WhenAll(producer, consumer);
}
```

### Backpressure Monitoring

```csharp
public class MonitoredChannel<T>
{
    private readonly Channel<T> _channel;
    private readonly int _capacity;
    private readonly ILogger _logger;
    private int _waitCount;

    public MonitoredChannel(int capacity, ILogger logger)
    {
        _capacity = capacity;
        _logger = logger;
        _channel = Channel.CreateBounded<T>(
            new BoundedChannelOptions(capacity)
            {
                FullMode = BoundedChannelFullMode.Wait
            });
    }

    public ChannelReader<T> Reader => _channel.Reader;

    public async ValueTask WriteAsync(T item, CancellationToken ct)
    {
        // If the channel is full, we are experiencing backpressure
        if (_channel.Reader.Count >= _capacity)
        {
            var waits = Interlocked.Increment(ref _waitCount);
            _logger.LogWarning(
                "Backpressure: channel full ({Capacity}), " +
                "producer waiting (total waits: {Waits})",
                _capacity, waits);
        }

        await _channel.Writer.WriteAsync(item, ct);
    }

    public void Complete() => _channel.Writer.Complete();

    public int CurrentCount => _channel.Reader.Count;
    public int TotalBackpressureWaits => _waitCount;
}
```

### Async Rate Limiter

```csharp
public class RateLimiter
{
    private readonly SemaphoreSlim _semaphore;
    private readonly TimeSpan _interval;

    /// <summary>
    /// Allows at most <paramref name="maxPerInterval"/> operations
    /// per <paramref name="interval"/>.
    /// </summary>
    public RateLimiter(int maxPerInterval, TimeSpan interval)
    {
        _semaphore = new SemaphoreSlim(maxPerInterval, maxPerInterval);
        _interval = interval;
    }

    public async Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        CancellationToken ct)
    {
        await _semaphore.WaitAsync(ct);

        try
        {
            return await operation(ct);
        }
        finally
        {
            // Release the slot after the interval, not immediately
            _ = Task.Delay(_interval, ct).ContinueWith(
                _ => _semaphore.Release(),
                TaskScheduler.Default);
        }
    }
}
```

## Common Patterns

### Pattern 1: Staged Pipeline with Different Parallelism

```
Oracle Extract (8 parallel) → Channel → Transform (4 parallel) → Channel → Load (2 parallel)
```

Each stage has its own concurrency limit based on the bottleneck resource:
- Extract: bounded by Oracle sessions
- Transform: bounded by CPU cores
- Load: bounded by SQL Server throughput (SqlBulkCopy contention)

### Pattern 2: Fan-Out / Fan-In

```csharp
public async Task<AggregateResult> FanOutAsync(
    IReadOnlyList<string> tables, CancellationToken ct)
{
    // Fan-out: process all tables in parallel
    var tasks = tables.Select(t => ProcessTableAsync(t, ct));
    var results = await Task.WhenAll(tasks);

    // Fan-in: aggregate results
    return new AggregateResult(
        TotalRows: results.Sum(r => r.RowCount),
        TotalDuration: results.Max(r => r.Duration));
}
```

### Pattern 3: Sliding Window Consumer

```csharp
public async Task ProcessWithSlidingWindowAsync(
    ChannelReader<Batch> reader,
    int windowSize,
    CancellationToken ct)
{
    var inflight = new List<Task>(windowSize);

    await foreach (var batch in reader.ReadAllAsync(ct))
    {
        if (inflight.Count >= windowSize)
        {
            var completed = await Task.WhenAny(inflight);
            inflight.Remove(completed);
            await completed; // Propagate exceptions
        }

        inflight.Add(ProcessBatchAsync(batch, ct));
    }

    await Task.WhenAll(inflight);
}
```

## Gotchas and Pitfalls

### 1. Forgetting to Complete the Channel Writer
If the producer throws and does not call `writer.Complete()`, consumers block forever
on `ReadAllAsync`. Always use `try/finally` to complete the writer.

```csharp
// WRONG — consumer hangs if producer throws
await foreach (var item in source) { await writer.WriteAsync(item); }
writer.Complete();

// RIGHT — complete is called even on exception
try { await foreach (var item in source) { await writer.WriteAsync(item); } }
finally { writer.Complete(); }
```

### 2. Parallel.ForEachAsync Swallows Exceptions by Default
If one item throws, `Parallel.ForEachAsync` cancels remaining items and propagates
an `AggregateException`. But if you catch inside the delegate, the exception is
silently swallowed. Log and rethrow, or collect failures for retry.

### 3. Thread Safety in Shared State
`Interlocked.Add` is safe for counters. `ConcurrentBag` is safe for collections.
Regular `List<T>` is NOT safe for concurrent adds — use `ConcurrentBag<T>` or
lock-guarded access.

### 4. SemaphoreSlim Leak
If you `await semaphore.WaitAsync()` but throw before `Release()`, the semaphore
count is permanently decremented. Always release in a `finally` block.

### 5. Channel Capacity Too Small
A bounded channel with capacity 1 serializes the pipeline. The producer writes one
item, blocks, waits for the consumer to read it. You lose all overlap. Set capacity
to at least `2 * consumer_parallelism` to keep consumers fed.

### 6. Oversubscription
Running 50 parallel Oracle reads, 50 parallel transforms, and 50 parallel loads on
an 8-core machine means 150 concurrent tasks fighting for 8 cores. Context switching
kills throughput. Right-size each stage independently.

## Performance Considerations

**Throughput formula:**
```
Pipeline throughput = min(extract_throughput, transform_throughput, load_throughput)
```

The slowest stage is the bottleneck. Add parallelism to the bottleneck stage first.

**Measuring per-stage throughput:**

```csharp
public class StageThroughputMonitor
{
    private long _itemsProcessed;
    private readonly Stopwatch _sw = Stopwatch.StartNew();

    public void RecordItems(int count)
        => Interlocked.Add(ref _itemsProcessed, count);

    public double ItemsPerSecond
        => _itemsProcessed / _sw.Elapsed.TotalSeconds;

    public override string ToString()
        => $"{ItemsPerSecond:N0} items/sec ({_itemsProcessed:N0} total)";
}
```

**Channel sizing guidelines:**

| Channel Capacity | Behavior |
|-----------------|----------|
| 1 | Fully synchronized, no overlap |
| 2-5 | Minimal buffering, tight backpressure |
| 10-50 | Good overlap, moderate memory |
| 100+ | Maximum throughput, higher memory |
| Unbounded | No backpressure, OOM risk |

**Parallelism guidelines for ETL:**

| Resource | Typical Max Parallelism |
|----------|------------------------|
| Oracle connections | 8-15 |
| SQL Server connections | 15-30 |
| CPU-bound transforms | `Environment.ProcessorCount` |
| Network I/O | 20-50 |
| SqlBulkCopy instances | 2-4 (contention above this) |

## BNBuilders Context

### Oracle CMiC Read Parallelism

CMiC on Oracle typically supports 50-100 concurrent sessions total. Your ETL should
claim no more than 10-15 to avoid impacting CMiC users (project managers entering
costs, accountants running reports). Use `SemaphoreSlim(12)` to enforce this.

### SQL Server Write Throughput

SQL Server handles concurrent `SqlBulkCopy` well up to ~4 parallel streams per table.
Beyond that, lock contention on the target table reduces throughput. If loading multiple
tables, parallelize across tables rather than within a single table.

### Pipeline Architecture at BNBuilders

```
Oracle CMiC (8 parallel readers)
    → Channel<RawBatch>(capacity: 30)
    → Transform (4 parallel workers)
    → Channel<CleanBatch>(capacity: 20)
    → SqlBulkCopy (2 parallel writers)
    → SQL Server Warehouse
```

This pipeline saturates Oracle reads (the bottleneck) while keeping SQL Server writes
efficient. The channels absorb bursts — if transform is temporarily slow, the extract
buffers up to 30 batches before backpressure kicks in.

### Equipment Utilization Pipeline

Equipment data is small but joins are complex (equipment to job to cost code). Use
a single-threaded extract (no chunking needed), channel to a transform stage that
enriches with dimension lookups, and a single-writer load.

## Interview / Senior Dev Questions

1. **"When would you use Channels over Parallel.ForEachAsync?"**
   When you have distinct pipeline stages with different parallelism needs. Channels
   decouple stages and provide backpressure. `Parallel.ForEachAsync` is simpler when
   each item is fully independent and processed by a single function.

2. **"How do you detect that your pipeline has a bottleneck?"**
   Measure per-stage throughput. If the extract channel is always full and the load
   channel is always empty, the load stage is the bottleneck. Monitor
   `channel.Reader.Count` over time.

3. **"What is the risk of an unbounded channel?"**
   A fast producer fills memory without limit. If the producer extracts 1M batches at
   10K rows each before the consumer keeps up, you have 10B rows in memory.

4. **"How do you gracefully shut down a channel pipeline?"**
   Signal cancellation via `CancellationToken`. The producer catches
   `OperationCanceledException`, completes the writer. Consumers drain remaining items
   from the channel, then exit. Wait for all tasks with `Task.WhenAll`.

## Quiz

### Question 1
You have a pipeline: Extract (Channel) -> Transform (Channel) -> Load. The extract
channel is always at capacity (50/50) and the load channel is always near zero (2/50).
Which stage is the bottleneck?

<details>
<summary>Show Answer</summary>

**Transform or Load.** The extract channel being full means the producer is faster than
the consumer (transform). The load channel being empty means the load stage is keeping
up with whatever transform produces. The bottleneck is the **Transform** stage — it
cannot consume extract output fast enough and cannot produce load input fast enough
to fill the load channel. Add more parallelism to the transform stage.
</details>

### Question 2
What happens if you forget `writer.Complete()` in a channel producer?

<details>
<summary>Show Answer</summary>

The consumer's `ReadAllAsync()` loop never terminates. It will block indefinitely
waiting for more items. The pipeline hangs. Always call `writer.Complete()` in a
`finally` block to ensure it is called even if the producer throws an exception.
</details>

### Question 3
You use `SemaphoreSlim(10)` to limit Oracle connections but `Parallel.ForEachAsync`
with `MaxDegreeOfParallelism = 20`. What happens?

<details>
<summary>Show Answer</summary>

At most 10 of the 20 parallel tasks can acquire the semaphore at any time. The other
10 tasks are alive but blocked on `WaitAsync()`, consuming thread pool threads without
doing useful work. This wastes thread pool resources. Either reduce
`MaxDegreeOfParallelism` to 10 to match the semaphore, or restructure so the semaphore
only guards the connection-using portion of each task.
</details>

### Question 4
Why is `BoundedChannelFullMode.Wait` preferred over `DropOldest` for ETL pipelines?

<details>
<summary>Show Answer</summary>

`DropOldest` silently discards data when the channel is full. In an ETL pipeline, every
row must be processed — dropping batches means data loss. `Wait` applies backpressure
by making the producer await until space is available, ensuring no data is lost. Use
`DropOldest` only for telemetry/metrics where losing some data points is acceptable.
</details>

### Question 5
You run 4 concurrent `SqlBulkCopy` operations to the same table and throughput is
lower than 2 concurrent operations. Why?

<details>
<summary>Show Answer</summary>

Lock contention. `SqlBulkCopy` acquires bulk update locks (or table locks with
`TABLOCK` hint) on the destination table. With 4 concurrent writers, they contend for
these locks, causing serialization and overhead. SQL Server handles 2-3 concurrent bulk
copies efficiently but degrades beyond that for a single table. Parallelize across
different tables instead, or use a staging table per writer and merge afterwards.
</details>
