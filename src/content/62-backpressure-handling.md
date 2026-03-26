# Backpressure Handling

When a producer generates data faster than a consumer can process it, the queue between them grows
without bound. This is **backpressure** — or rather, the lack of it. Without backpressure
mechanisms, your application will consume all available memory and crash.

---

## The Unbounded Growth Problem

```csharp
// DANGEROUS: unbounded queue
var queue = new ConcurrentQueue<Record>();

// Producer: 100K records/sec
_ = Task.Run(async () =>
{
    while (true)
    {
        queue.Enqueue(GenerateRecord());
        await Task.Delay(0);
    }
});

// Consumer: 10K records/sec
_ = Task.Run(async () =>
{
    while (true)
    {
        if (queue.TryDequeue(out var record))
            await SlowProcessAsync(record); // 100ms per record
    }
});

// After 1 minute: ~5.4 million items buffered in memory
```

> **Warning:** An unbounded `ConcurrentQueue` or `Channel.CreateUnbounded<T>()` will happily
> grow until your process is killed by the OS. Always plan for the case where producers outpace
> consumers.

---

## What Backpressure Means

Backpressure is a feedback mechanism that **slows down the producer** when the consumer cannot
keep up. The key insight: it is better to slow the entire pipeline than to exhaust memory.

| Strategy | How it Works | Trade-off |
|---|---|---|
| Block the producer | Producer waits until space is available | Highest data integrity, adds latency |
| Drop oldest | Discard the oldest buffered item | Good for real-time (latest data matters most) |
| Drop newest | Discard the incoming item | Preserves buffer order |
| Drop on write | Silently reject the write | Producer stays fast, data loss |

---

## Bounded Channels

`System.Threading.Channels` provides built-in backpressure:

```csharp
var channel = Channel.CreateBounded<Record>(new BoundedChannelOptions(capacity: 5000)
{
    FullMode = BoundedChannelFullMode.Wait // block producer when full
});
```

### BoundedChannelFullMode Options

| Mode | Behavior | Use Case |
|---|---|---|
| `Wait` | `WriteAsync` blocks until space is available | Default; preserves all data |
| `DropOldest` | Removes the oldest item to make room | Live dashboards, latest value wins |
| `DropNewest` | Drops the item being written | Rate-limited logging |
| `DropWrite` | Same as DropNewest (drops the new item) | Fire-and-forget telemetry |

```csharp
// Real-time sensor dashboard — only care about latest readings
var liveChannel = Channel.CreateBounded<SensorReading>(new BoundedChannelOptions(100)
{
    FullMode = BoundedChannelFullMode.DropOldest,
    SingleWriter = false,
    SingleReader = true
});
```

> **Tip:** For ETL pipelines, always use `BoundedChannelFullMode.Wait`. Data integrity trumps
> throughput — you never want silent data loss in a data pipeline.

---

## Backpressure with Wait Mode in Practice

```csharp
public static async Task ProducerAsync(ChannelWriter<Record> writer, CancellationToken ct)
{
    var sw = Stopwatch.StartNew();
    int count = 0;

    await foreach (var record in ReadSourceAsync(ct))
    {
        // This line BLOCKS when the channel is full — that IS the backpressure
        await writer.WriteAsync(record, ct);
        count++;

        if (count % 100_000 == 0)
        {
            double rate = count / sw.Elapsed.TotalSeconds;
            Console.WriteLine($"Producer: {count:N0} records ({rate:N0}/s)");
        }
    }

    writer.Complete();
}
```

When the bounded channel is full, `WriteAsync` awaits asynchronously. The producer does not spin
or allocate — it simply pauses until the consumer drains an item.

---

## SemaphoreSlim for Concurrency Limiting

When you need to limit how many concurrent operations run (e.g., database connections, HTTP
requests), `SemaphoreSlim` provides backpressure at the concurrency level:

```csharp
public class ThrottledWriter
{
    private readonly SemaphoreSlim _semaphore;

    public ThrottledWriter(int maxConcurrency)
    {
        _semaphore = new SemaphoreSlim(maxConcurrency);
    }

    public async Task ProcessBatchAsync(IEnumerable<Record> records, CancellationToken ct)
    {
        var tasks = records.Select(async record =>
        {
            await _semaphore.WaitAsync(ct);
            try
            {
                await WriteToDbAsync(record, ct);
            }
            finally
            {
                _semaphore.Release();
            }
        });

        await Task.WhenAll(tasks);
    }

    private async Task WriteToDbAsync(Record record, CancellationToken ct)
    {
        // Simulate database write
        await Task.Delay(50, ct);
    }
}
```

> **Note:** `SemaphoreSlim.WaitAsync()` is the async-friendly version. Never use
> `Semaphore` (the older, OS-level primitive) in async code.

### Combining Channels and Semaphores

```csharp
public async Task ConsumerWithThrottleAsync(
    ChannelReader<Record> input,
    int maxConcurrentWrites,
    CancellationToken ct)
{
    var semaphore = new SemaphoreSlim(maxConcurrentWrites);
    var writeTasks = new List<Task>();

    await foreach (var record in input.ReadAllAsync(ct))
    {
        await semaphore.WaitAsync(ct);

        writeTasks.Add(Task.Run(async () =>
        {
            try
            {
                await WriteToDbAsync(record, ct);
            }
            finally
            {
                semaphore.Release();
            }
        }, ct));
    }

    await Task.WhenAll(writeTasks);
}
```

---

## Rate Limiting with System.Threading.RateLimiting

.NET 7+ includes built-in rate limiters:

```csharp
using System.Threading.RateLimiting;

// Allow 1000 operations per second
var limiter = new TokenBucketRateLimiter(new TokenBucketRateLimiterOptions
{
    TokenLimit = 100,
    ReplenishmentPeriod = TimeSpan.FromMilliseconds(100),
    TokensPerPeriod = 100,
    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
    QueueLimit = 5000
});

public async Task RateLimitedProducerAsync(
    ChannelWriter<Record> writer,
    IAsyncEnumerable<Record> source,
    CancellationToken ct)
{
    await foreach (var record in source.WithCancellation(ct))
    {
        using var lease = await limiter.AcquireAsync(permitCount: 1, ct);

        if (lease.IsAcquired)
        {
            await writer.WriteAsync(record, ct);
        }
        else
        {
            Console.WriteLine("Rate limit exceeded, request queued or dropped.");
        }
    }
}
```

### Available Rate Limiters

| Limiter | Description |
|---|---|
| `TokenBucketRateLimiter` | Classic token bucket — smooth, allows short bursts |
| `FixedWindowRateLimiter` | Fixed time windows (e.g., 100 requests per minute) |
| `SlidingWindowRateLimiter` | Rolling window, smoother than fixed |
| `ConcurrencyLimiter` | Limits concurrent operations, similar to SemaphoreSlim |

---

## Monitoring Queue Depth

Detecting backpressure early prevents cascading failures:

```csharp
public class MonitoredChannel<T>
{
    private readonly Channel<T> _channel;
    private readonly int _capacity;
    private readonly ILogger _logger;
    private readonly Timer _monitorTimer;

    public MonitoredChannel(int capacity, ILogger logger)
    {
        _capacity = capacity;
        _logger = logger;
        _channel = Channel.CreateBounded<T>(new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.Wait
        });

        _monitorTimer = new Timer(ReportDepth, null, TimeSpan.Zero, TimeSpan.FromSeconds(5));
    }

    public ChannelWriter<T> Writer => _channel.Writer;
    public ChannelReader<T> Reader => _channel.Reader;

    private void ReportDepth(object? state)
    {
        // Reader.Count gives the current number of items in the channel
        int count = _channel.Reader.Count;
        double utilization = (double)count / _capacity * 100;

        _logger.LogInformation(
            "Channel depth: {Count}/{Capacity} ({Utilization:F1}%)",
            count, _capacity, utilization);

        if (utilization > 90)
        {
            _logger.LogWarning("Channel near capacity — consumer may be falling behind.");
        }
    }
}
```

> **Important:** `ChannelReader<T>.Count` is available on bounded channels. Use it for
> diagnostics only — do not make flow-control decisions based on it, as the count can change
> between reading it and acting on it.

---

## Real-World Example: Fast Source, Slow Sink

A common ETL scenario: reading from a fast in-memory cache, writing to a slow database.

```csharp
public class BackpressuredPipeline
{
    public async Task RunAsync(CancellationToken ct)
    {
        // Channel between source and sink — capacity limits memory usage
        var channel = Channel.CreateBounded<OrderEvent>(new BoundedChannelOptions(20_000)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleWriter = true,
            SingleReader = false
        });

        // Source: reads from Redis stream at ~50K events/sec
        var producer = ProduceFromRedisAsync(channel.Writer, ct);

        // Sink: 4 parallel writers to SQL Server at ~3K inserts/sec each = ~12K/sec
        var consumers = Enumerable.Range(0, 4)
            .Select(_ => ConsumeToSqlAsync(channel.Reader, ct))
            .ToArray();

        // The producer will be slowed to ~12K/sec by backpressure
        await producer;
        await Task.WhenAll(consumers);
    }

    private async Task ProduceFromRedisAsync(ChannelWriter<OrderEvent> writer, CancellationToken ct)
    {
        // Simulated fast source
        int count = 0;
        while (!ct.IsCancellationRequested)
        {
            var evt = await ReadFromRedisAsync(ct);
            await writer.WriteAsync(evt, ct); // blocks when channel is full
            count++;
            if (count % 50_000 == 0)
                Console.WriteLine($"Producer queued {count:N0} events");
        }
        writer.Complete();
    }

    private async Task ConsumeToSqlAsync(ChannelReader<OrderEvent> reader, CancellationToken ct)
    {
        var batch = new List<OrderEvent>(1000);

        await foreach (var evt in reader.ReadAllAsync(ct))
        {
            batch.Add(evt);
            if (batch.Count >= 1000)
            {
                await BulkInsertAsync(batch, ct);
                batch.Clear();
            }
        }

        if (batch.Count > 0)
            await BulkInsertAsync(batch, ct);
    }

    private Task<OrderEvent> ReadFromRedisAsync(CancellationToken ct)
        => Task.FromResult(new OrderEvent()); // placeholder

    private Task BulkInsertAsync(List<OrderEvent> batch, CancellationToken ct)
        => Task.Delay(50, ct); // simulates DB write
}

public record OrderEvent();
```

---

## Backpressure Decision Guide

```
Is data loss acceptable?
├── Yes → Is latest data most important?
│         ├── Yes → DropOldest
│         └── No  → DropNewest / DropWrite
└── No  → Use BoundedChannelFullMode.Wait
          └── Is throughput still too low?
              ├── Increase consumer parallelism (fan-out)
              ├── Batch writes (reduce per-item overhead)
              └── Scale vertically or horizontally
```

> **Caution:** Never ignore backpressure by switching to an unbounded queue "because it's
> simpler." The resulting OutOfMemoryException will arrive at 3 AM on a Saturday.

---

## Summary

| Mechanism | Best For |
|---|---|
| `BoundedChannel` with `Wait` | Data pipelines — no data loss |
| `BoundedChannel` with `DropOldest` | Real-time displays — latest value wins |
| `SemaphoreSlim` | Limiting concurrent I/O operations |
| `TokenBucketRateLimiter` | API rate limiting, smooth throughput |
| `ConcurrencyLimiter` | Hard cap on parallel work |
| Channel depth monitoring | Early warning for pipeline bottlenecks |
