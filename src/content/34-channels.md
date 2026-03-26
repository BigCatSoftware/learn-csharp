# Channels

`System.Threading.Channels` provides a modern, high-performance, async-native producer-consumer data structure. Channels are the preferred way to pass data between asynchronous producers and consumers in .NET, replacing `BlockingCollection<T>` for async code.

## Why Channels?

Unlike `BlockingCollection<T>` which blocks threads, channels integrate seamlessly with `async/await`. This means producer and consumer code can yield threads back to the pool while waiting, making channels far more scalable for I/O-bound workloads.

```csharp
using System.Threading.Channels;

// Create a channel
var channel = Channel.CreateUnbounded<string>();

// Producer
await channel.Writer.WriteAsync("Hello");
await channel.Writer.WriteAsync("World");
channel.Writer.Complete();

// Consumer
await foreach (var message in channel.Reader.ReadAllAsync())
{
    Console.WriteLine(message);
}
```

## Bounded vs Unbounded Channels

| Feature | `CreateUnbounded<T>()` | `CreateBounded<T>(capacity)` |
|---|---|---|
| Capacity | Unlimited (memory-bound) | Fixed maximum |
| Writer blocks? | Never | When full (backpressure) |
| Memory safety | Risk of OOM if consumer is slow | Naturally bounded |
| Use case | Fast consumers, low-volume | High-volume, need backpressure |

```csharp
// Unbounded: use when consumer keeps up or volume is low
var unbounded = Channel.CreateUnbounded<LogEntry>(new UnboundedChannelOptions
{
    SingleReader = true,   // Optimization hint
    SingleWriter = false
});

// Bounded: use when you need backpressure control
var bounded = Channel.CreateBounded<WorkItem>(new BoundedChannelOptions(capacity: 100)
{
    FullMode = BoundedChannelFullMode.Wait, // Default: await until space
    SingleReader = false,
    SingleWriter = false
});
```

## BoundedChannelFullMode

When a bounded channel is full, the `FullMode` option controls what happens:

| Mode | Behavior |
|---|---|
| `Wait` | `WriteAsync` awaits until space is available (default) |
| `DropNewest` | Drops the newest item in the channel to make room |
| `DropOldest` | Drops the oldest item in the channel to make room |
| `DropWrite` | Drops the item being written (silently discards) |

```csharp
// Metrics channel that drops oldest data when overwhelmed
var metricsChannel = Channel.CreateBounded<MetricPoint>(new BoundedChannelOptions(500)
{
    FullMode = BoundedChannelFullMode.DropOldest // Keep latest metrics
});
```

> **Tip:** Use `DropOldest` for telemetry and metrics where recent data matters more than completeness. Use `Wait` for work queues where every item must be processed.

## ChannelReader\<T\> and ChannelWriter\<T\>

Channels expose separate `Reader` and `Writer` interfaces. Pass only the interface each component needs to enforce directionality at compile time.

```csharp
public class DataPipeline
{
    // Producer only gets the writer
    public static async Task ProduceAsync(ChannelWriter<int> writer, CancellationToken ct)
    {
        try
        {
            for (int i = 0; i < 1000; i++)
            {
                await writer.WriteAsync(i, ct);
            }
        }
        finally
        {
            writer.Complete();
        }
    }

    // Consumer only gets the reader
    public static async Task ConsumeAsync(ChannelReader<int> reader, CancellationToken ct)
    {
        await foreach (var item in reader.ReadAllAsync(ct))
        {
            Console.WriteLine($"Received: {item}");
        }
    }
}
```

> **Important:** Always call `writer.Complete()` (or `Complete(exception)`) when the producer is done. Without this, consumers awaiting `ReadAllAsync` will hang forever. Use `try/finally` to ensure completion even on errors.

## Handling Backpressure

Backpressure is the mechanism by which a slow consumer signals the producer to slow down. Bounded channels implement this naturally.

```csharp
public static async Task BackpressureDemo()
{
    var channel = Channel.CreateBounded<int>(new BoundedChannelOptions(5)
    {
        FullMode = BoundedChannelFullMode.Wait
    });

    // Fast producer
    var producer = Task.Run(async () =>
    {
        for (int i = 0; i < 50; i++)
        {
            await channel.Writer.WriteAsync(i);
            Console.WriteLine($"  Produced: {i} (queue: ~{channel.Reader.Count})");
        }
        channel.Writer.Complete();
    });

    // Slow consumer
    var consumer = Task.Run(async () =>
    {
        await foreach (var item in channel.Reader.ReadAllAsync())
        {
            Console.WriteLine($"  Consumed: {item}");
            await Task.Delay(100); // Simulate slow processing
        }
    });

    await Task.WhenAll(producer, consumer);
}
```

The producer will pause at `WriteAsync` whenever the channel holds 5 items, naturally throttling itself without any explicit coordination code.

## Real Example: Multi-Stage Data Processing Pipeline

A pipeline where data flows through stages: Read -> Parse -> Validate -> Store.

```csharp
public class DataProcessingPipeline
{
    public async Task RunAsync(IEnumerable<string> filePaths, CancellationToken ct)
    {
        // Stage channels
        var rawLines = Channel.CreateBounded<string>(1000);
        var parsed = Channel.CreateBounded<Record>(500);
        var validated = Channel.CreateBounded<Record>(500);

        // Launch pipeline stages concurrently
        var readTask = ReadFilesAsync(filePaths, rawLines.Writer, ct);
        var parseTask = ParseAsync(rawLines.Reader, parsed.Writer, ct);
        var validateTask = ValidateAsync(parsed.Reader, validated.Writer, ct);
        var storeTask = StoreAsync(validated.Reader, ct);

        await Task.WhenAll(readTask, parseTask, validateTask, storeTask);
    }

    private async Task ReadFilesAsync(IEnumerable<string> paths,
        ChannelWriter<string> output, CancellationToken ct)
    {
        try
        {
            foreach (var path in paths)
            {
                await foreach (var line in File.ReadLinesAsync(path, ct))
                {
                    await output.WriteAsync(line, ct);
                }
            }
        }
        finally { output.Complete(); }
    }

    private async Task ParseAsync(ChannelReader<string> input,
        ChannelWriter<Record> output, CancellationToken ct)
    {
        try
        {
            await foreach (var line in input.ReadAllAsync(ct))
            {
                if (Record.TryParse(line, out var record))
                    await output.WriteAsync(record, ct);
            }
        }
        finally { output.Complete(); }
    }

    private async Task ValidateAsync(ChannelReader<Record> input,
        ChannelWriter<Record> output, CancellationToken ct)
    {
        try
        {
            await foreach (var record in input.ReadAllAsync(ct))
            {
                if (record.IsValid())
                    await output.WriteAsync(record, ct);
            }
        }
        finally { output.Complete(); }
    }

    private async Task StoreAsync(ChannelReader<Record> input, CancellationToken ct)
    {
        var batch = new List<Record>(100);
        await foreach (var record in input.ReadAllAsync(ct))
        {
            batch.Add(record);
            if (batch.Count >= 100)
            {
                await SaveBatchAsync(batch);
                batch.Clear();
            }
        }
        if (batch.Count > 0)
            await SaveBatchAsync(batch);
    }

    private Task SaveBatchAsync(List<Record> batch) =>
        Task.Delay(10); // Simulated DB write
}
```

## Real Example: Fan-Out / Fan-In Pattern

Distribute work across multiple workers, then merge results.

```csharp
public static class FanOutFanIn
{
    public static async Task<List<TResult>> ProcessAsync<TInput, TResult>(
        IEnumerable<TInput> items,
        Func<TInput, CancellationToken, Task<TResult>> processor,
        int workerCount = 4,
        CancellationToken ct = default)
    {
        var input = Channel.CreateBounded<TInput>(workerCount * 2);
        var output = Channel.CreateUnbounded<TResult>();

        // Fan-out: distribute items to workers
        var feeder = Task.Run(async () =>
        {
            try
            {
                foreach (var item in items)
                    await input.Writer.WriteAsync(item, ct);
            }
            finally { input.Writer.Complete(); }
        }, ct);

        // Workers process in parallel
        var workers = Enumerable.Range(0, workerCount).Select(_ => Task.Run(async () =>
        {
            await foreach (var item in input.Reader.ReadAllAsync(ct))
            {
                var result = await processor(item, ct);
                await output.Writer.WriteAsync(result, ct);
            }
        }, ct)).ToArray();

        // Fan-in: collect all results
        _ = Task.Run(async () =>
        {
            await feeder;
            await Task.WhenAll(workers);
            output.Writer.Complete();
        }, ct);

        var results = new List<TResult>();
        await foreach (var result in output.Reader.ReadAllAsync(ct))
        {
            results.Add(result);
        }

        return results;
    }
}

// Usage
var urls = Enumerable.Range(1, 100).Select(i => $"https://api.example.com/items/{i}");
var results = await FanOutFanIn.ProcessAsync(urls, async (url, ct) =>
{
    using var client = new HttpClient();
    return await client.GetStringAsync(url, ct);
}, workerCount: 8);
```

## Real Example: Web Scraper with Bounded Concurrency

```csharp
public class BoundedWebScraper
{
    private readonly HttpClient _http = new();
    private readonly int _maxConcurrency;

    public BoundedWebScraper(int maxConcurrency) => _maxConcurrency = maxConcurrency;

    public async Task<Dictionary<string, string>> ScrapeAsync(
        IEnumerable<string> urls, CancellationToken ct = default)
    {
        var urlChannel = Channel.CreateBounded<string>(new BoundedChannelOptions(_maxConcurrency * 2)
        {
            FullMode = BoundedChannelFullMode.Wait
        });
        var results = new ConcurrentDictionary<string, string>();

        // Feed URLs
        var feeder = Task.Run(async () =>
        {
            try
            {
                foreach (var url in urls)
                    await urlChannel.Writer.WriteAsync(url, ct);
            }
            finally { urlChannel.Writer.Complete(); }
        }, ct);

        // Scrape with bounded concurrency
        var scrapers = Enumerable.Range(0, _maxConcurrency).Select(_ => Task.Run(async () =>
        {
            await foreach (var url in urlChannel.Reader.ReadAllAsync(ct))
            {
                try
                {
                    var html = await _http.GetStringAsync(url, ct);
                    results[url] = html;
                    Console.WriteLine($"Scraped {url} ({html.Length:N0} chars)");
                }
                catch (Exception ex)
                {
                    results[url] = $"ERROR: {ex.Message}";
                }
            }
        }, ct)).ToArray();

        await feeder;
        await Task.WhenAll(scrapers);
        return new Dictionary<string, string>(results);
    }
}
```

## Real Example: Log Aggregator

```csharp
public sealed class ChannelLogAggregator : IAsyncDisposable
{
    private readonly Channel<string> _channel;
    private readonly Task _processTask;
    private readonly StreamWriter _writer;

    public ChannelLogAggregator(string outputPath)
    {
        _channel = Channel.CreateBounded<string>(new BoundedChannelOptions(10_000)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true
        });

        _writer = new StreamWriter(outputPath, append: true);
        _processTask = ProcessLogsAsync();
    }

    public ValueTask LogAsync(string message) =>
        _channel.Writer.WriteAsync($"[{DateTime.UtcNow:O}] {message}");

    public bool TryLog(string message) =>
        _channel.Writer.TryWrite($"[{DateTime.UtcNow:O}] {message}");

    private async Task ProcessLogsAsync()
    {
        int count = 0;
        await foreach (var entry in _channel.Reader.ReadAllAsync())
        {
            await _writer.WriteLineAsync(entry);
            if (++count % 50 == 0)
                await _writer.FlushAsync();
        }
        await _writer.FlushAsync();
    }

    public async ValueTask DisposeAsync()
    {
        _channel.Writer.Complete();
        await _processTask;
        await _writer.DisposeAsync();
    }
}
```

> **Note:** Setting `SingleReader = true` or `SingleWriter = true` allows the channel to use faster internal code paths. Always set these hints when applicable.

## Channel vs BlockingCollection

| Feature | `Channel<T>` | `BlockingCollection<T>` |
|---|---|---|
| Async support | Native `async/await` | Blocks threads |
| Backpressure | `Wait`, `DropOldest`, etc. | Blocking only |
| Performance | Allocation-free hot path | Good but allocates more |
| `IAsyncEnumerable` | `ReadAllAsync()` | Not available |
| Cancellation | First-class `CancellationToken` | Supported but clunky |
| Recommended for | New async code | Legacy sync code |

## Summary

Channels are the modern foundation for async producer-consumer patterns in .NET. Use bounded channels when you need backpressure, unbounded channels for low-volume or fast-consumer scenarios, and fan-out/fan-in for parallel processing. Their separation of `ChannelReader` and `ChannelWriter` enforces clean architectural boundaries between pipeline stages. In the next lesson, we will explore how .NET manages memory under the hood with the garbage collector.
