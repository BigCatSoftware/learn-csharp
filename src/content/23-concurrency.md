# Concurrency and Parallelism

*Multi-threaded and parallel programming*

Concurrency (managing multiple tasks) and parallelism (running tasks simultaneously) are essential for building responsive, high-performance applications.

## Task Parallel Library

```csharp
// Parallel.ForEach - data parallelism
var urls = new List<string> { /* many URLs */ };

await Parallel.ForEachAsync(urls, async (url, ct) =>
{
    using var client = new HttpClient();
    var content = await client.GetStringAsync(url, ct);
    await ProcessContentAsync(content);
});

// Parallel.For
Parallel.For(0, 1000, i =>
{
    HeavyComputation(i);
});
```

## Channels

Producer-consumer pattern:

```csharp
var channel = Channel.CreateBounded<WorkItem>(100);

// Producer
async Task ProduceAsync(ChannelWriter<WorkItem> writer)
{
    for (int i = 0; i < 1000; i++)
    {
        await writer.WriteAsync(new WorkItem(i));
    }
    writer.Complete();
}

// Consumer
async Task ConsumeAsync(ChannelReader<WorkItem> reader)
{
    await foreach (var item in reader.ReadAllAsync())
    {
        await ProcessAsync(item);
    }
}

// Run concurrently
await Task.WhenAll(
    ProduceAsync(channel.Writer),
    ConsumeAsync(channel.Reader)
);
```

> **Tip:** Channels are the preferred way to communicate between producer and consumer tasks. They handle synchronization and backpressure automatically.

## Thread Safety

```csharp
// NOT thread-safe
private int _counter;
void Increment() => _counter++;  // Race condition!

// Thread-safe with Interlocked
private int _safeCounter;
void SafeIncrement() => Interlocked.Increment(ref _safeCounter);

// Thread-safe with lock
private readonly object _lock = new();
private List<string> _items = new();

void AddItem(string item)
{
    lock (_lock)
    {
        _items.Add(item);
    }
}
```

## Concurrent Collections

```csharp
// Thread-safe dictionary
var cache = new ConcurrentDictionary<string, int>();

cache.TryAdd("key", 1);
cache.AddOrUpdate("key", 1, (key, old) => old + 1);
int value = cache.GetOrAdd("key", _ => ComputeValue());

// Thread-safe queue
var queue = new ConcurrentQueue<WorkItem>();
queue.Enqueue(new WorkItem());
if (queue.TryDequeue(out var item))
    Process(item);

// Thread-safe bag (unordered)
var bag = new ConcurrentBag<int>();
bag.Add(42);
```

## SemaphoreSlim

Limit concurrent access:

```csharp
private readonly SemaphoreSlim _semaphore = new(maxCount: 5);

async Task ProcessWithThrottleAsync(IEnumerable<string> urls)
{
    var tasks = urls.Select(async url =>
    {
        await _semaphore.WaitAsync();
        try
        {
            return await DownloadAsync(url);
        }
        finally
        {
            _semaphore.Release();
        }
    });

    await Task.WhenAll(tasks);
}
```

> **Warning:** Deadlocks occur when two or more threads wait for each other indefinitely. Avoid nested locks, always acquire locks in the same order, and prefer `async`/`await` over blocking calls.

## Timer and Periodic Tasks

```csharp
// PeriodicTimer (.NET 6+)
using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));

while (await timer.WaitForNextTickAsync(cancellationToken))
{
    await CheckHealthAsync();
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use `async`/`await` for I/O | Block with `.Result` or `.Wait()` |
| Use `Channel<T>` for producer-consumer | Use shared mutable state |
| Use `ConcurrentDictionary` | Lock around a regular Dictionary |
| Use `SemaphoreSlim` for throttling | Use `Thread.Sleep` |
| Cancel with `CancellationToken` | Abort threads |

> **Important:** The golden rule of concurrency: minimize shared mutable state. If data isn't shared between threads, you don't need synchronization. Prefer message passing (channels) over shared memory when possible.
