# Concurrent Collections

The `System.Collections.Concurrent` namespace provides thread-safe collection classes designed for multithreaded scenarios. They eliminate the need for external locking in most cases, reducing bugs and often improving performance over manually locked standard collections.

## Why Not Just Lock a Regular Collection?

Wrapping every access to a `Dictionary<TKey, TValue>` or `List<T>` in a `lock` works but has significant drawbacks:

- **Coarse-grained locking** serializes all access, creating a bottleneck.
- **Forgetting a lock** on even one access path causes race conditions.
- **Composition problems** arise when you need atomic read-modify-write operations.

Concurrent collections use fine-grained locking, lock-free algorithms, or a combination of both to solve these issues.

## ConcurrentDictionary\<TKey, TValue\>

The workhorse of concurrent collections. It uses striped locking internally, so different keys can be accessed simultaneously.

```csharp
var userSessions = new ConcurrentDictionary<string, DateTime>();

// Add or update atomically
userSessions.AddOrUpdate(
    key: "user-42",
    addValue: DateTime.UtcNow,
    updateValueFactory: (key, existing) => DateTime.UtcNow
);

// Get or create on first access
var session = userSessions.GetOrAdd("user-99", key => DateTime.UtcNow);

// Atomic conditional removal
bool removed = userSessions.TryRemove("user-42", out DateTime lastSeen);
```

> **Warning:** The delegate passed to `GetOrAdd` or `AddOrUpdate` may execute **more than once** under contention. Ensure these delegates are idempotent and free of side effects.

### Real Example: Thread-Safe Hit Counter

```csharp
public class HitCounter
{
    private readonly ConcurrentDictionary<string, long> _counts = new();

    public void RecordHit(string endpoint)
    {
        _counts.AddOrUpdate(endpoint, addValue: 1,
            updateValueFactory: (_, count) => count + 1);
    }

    public long GetCount(string endpoint)
    {
        return _counts.GetValueOrDefault(endpoint, 0);
    }

    public IReadOnlyDictionary<string, long> GetSnapshot()
    {
        // ToArray provides a snapshot; iteration is safe but not a frozen point-in-time
        return _counts.ToDictionary(kvp => kvp.Key, kvp => kvp.Value);
    }

    public void PrintTopEndpoints(int n)
    {
        var top = _counts
            .OrderByDescending(kvp => kvp.Value)
            .Take(n);

        foreach (var (endpoint, count) in top)
            Console.WriteLine($"  {endpoint}: {count:N0} hits");
    }
}
```

## ConcurrentQueue\<T\>

A thread-safe FIFO queue built on lock-free linked segments. Ideal for producer-consumer patterns.

```csharp
var workQueue = new ConcurrentQueue<WorkItem>();

// Producer thread
workQueue.Enqueue(new WorkItem("Process invoice #1001"));
workQueue.Enqueue(new WorkItem("Send notification"));

// Consumer thread
while (workQueue.TryDequeue(out WorkItem? item))
{
    Console.WriteLine($"Processing: {item.Description}");
}
```

### Real Example: Multi-Threaded Work Queue

```csharp
public class SimpleWorkQueue<T>
{
    private readonly ConcurrentQueue<T> _queue = new();
    private readonly SemaphoreSlim _signal = new(0);
    private readonly CancellationTokenSource _cts = new();

    public void Enqueue(T item)
    {
        _queue.Enqueue(item);
        _signal.Release();
    }

    public async Task StartWorkersAsync(int workerCount, Func<T, Task> processor)
    {
        var workers = Enumerable.Range(0, workerCount)
            .Select(_ => Task.Run(async () =>
            {
                while (!_cts.Token.IsCancellationRequested)
                {
                    await _signal.WaitAsync(_cts.Token);
                    if (_queue.TryDequeue(out T? item))
                        await processor(item);
                }
            }));

        await Task.WhenAll(workers);
    }

    public void Stop() => _cts.Cancel();
}
```

## ConcurrentStack\<T\>

A thread-safe LIFO stack using lock-free compare-and-swap operations. Supports batch operations via `PushRange` and `TryPopRange`.

```csharp
var stack = new ConcurrentStack<int>();

// Push multiple items at once (more efficient than individual pushes)
stack.PushRange(new[] { 1, 2, 3, 4, 5 });

// Pop multiple items
var buffer = new int[3];
int popped = stack.TryPopRange(buffer);
Console.WriteLine($"Popped {popped} items: {string.Join(", ", buffer.Take(popped))}");
// Output: Popped 3 items: 5, 4, 3
```

## ConcurrentBag\<T\>

An unordered, thread-safe collection optimized for scenarios where the same thread both produces and consumes items. Each thread gets a local list, minimizing contention.

```csharp
var bag = new ConcurrentBag<double>();

// Parallel aggregation - each thread adds to the bag
Parallel.For(0, 1000, i =>
{
    double result = Math.Sqrt(i) * Math.PI;
    bag.Add(result);
});

Console.WriteLine($"Collected {bag.Count} results");
Console.WriteLine($"Sum: {bag.Sum():F2}");
```

> **Tip:** `ConcurrentBag<T>` shines in work-stealing scenarios like `Parallel.ForEach`. For strict FIFO or LIFO ordering, use `ConcurrentQueue<T>` or `ConcurrentStack<T>` instead.

## BlockingCollection\<T\>

A wrapper around any `IProducerConsumerCollection<T>` that adds blocking semantics and bounded capacity. It is the classic producer-consumer primitive.

```csharp
// Bounded collection - blocks producers when full
using var collection = new BlockingCollection<LogEntry>(boundedCapacity: 1000);

// Producer thread
Task.Run(() =>
{
    foreach (var entry in GetLogEntries())
    {
        collection.Add(entry); // Blocks if collection is full
    }
    collection.CompleteAdding(); // Signal no more items
});

// Consumer thread - blocks when empty, exits when complete
foreach (var entry in collection.GetConsumingEnumerable())
{
    WriteToFile(entry);
}
// GetConsumingEnumerable exits when CompleteAdding is called and the collection is empty
```

### Real Example: Multi-Threaded Log Aggregator

```csharp
public class LogAggregator : IDisposable
{
    private readonly BlockingCollection<string> _buffer;
    private readonly Task _writerTask;
    private readonly StreamWriter _writer;

    public LogAggregator(string filePath, int bufferSize = 5000)
    {
        _buffer = new BlockingCollection<string>(bufferSize);
        _writer = new StreamWriter(filePath, append: true) { AutoFlush = false };

        _writerTask = Task.Factory.StartNew(() =>
        {
            int batchCount = 0;
            foreach (string line in _buffer.GetConsumingEnumerable())
            {
                _writer.WriteLine(line);
                if (++batchCount % 100 == 0)
                    _writer.Flush();
            }
            _writer.Flush();
        }, TaskCreationOptions.LongRunning);
    }

    // Called from many threads simultaneously
    public void Log(string message)
    {
        string formatted = $"[{DateTime.UtcNow:O}] [{Environment.CurrentManagedThreadId:D3}] {message}";
        if (!_buffer.TryAdd(formatted, TimeSpan.FromSeconds(1)))
            Console.Error.WriteLine("Log buffer full, dropping message.");
    }

    public void Dispose()
    {
        _buffer.CompleteAdding();
        _writerTask.Wait();
        _writer.Dispose();
        _buffer.Dispose();
    }
}
```

## IProducerConsumerCollection\<T\>

This interface defines the contract that `BlockingCollection<T>` wraps. You can implement it to create custom backing stores.

```csharp
// BlockingCollection defaults to ConcurrentQueue, but you can swap it:
var lifoCollection = new BlockingCollection<int>(new ConcurrentStack<int>());
var bagCollection = new BlockingCollection<int>(new ConcurrentBag<int>());
```

## Performance Comparison

| Collection | Ordering | Best For | Internal Mechanism | Relative Throughput |
|---|---|---|---|---|
| `ConcurrentDictionary` | By key | Keyed lookups, caches | Striped locks | High (read-heavy) |
| `ConcurrentQueue` | FIFO | Producer-consumer pipelines | Lock-free segments | Very High |
| `ConcurrentStack` | LIFO | Undo stacks, object pools | Lock-free CAS | Very High |
| `ConcurrentBag` | Unordered | Same-thread produce/consume | Thread-local lists | Highest (low contention) |
| `BlockingCollection` | Depends on backing | Bounded producer-consumer | Wraps another collection | Moderate (blocking) |
| `lock` + `Dictionary` | By key | Low contention, simple code | Exclusive lock | Low (high contention) |
| `lock` + `List` | Insertion order | Low contention, simple code | Exclusive lock | Low (high contention) |

## When to Use What

| Scenario | Recommended |
|---|---|
| Thread-safe key-value cache | `ConcurrentDictionary<TKey, TValue>` |
| Multiple producers, single consumer | `ConcurrentQueue<T>` or `BlockingCollection<T>` |
| Bounded buffer with backpressure | `BlockingCollection<T>` with capacity |
| Parallel aggregation of results | `ConcurrentBag<T>` |
| Object pool (reuse expensive objects) | `ConcurrentStack<T>` or `ConcurrentBag<T>` |
| Simple shared list, low contention | `lock` + `List<T>` |
| Async producer-consumer | `Channel<T>` (see next lesson) |

> **Note:** For async code, prefer `Channel<T>` over `BlockingCollection<T>`. `BlockingCollection` blocks threads, while `Channel` integrates with `async/await` and does not waste thread pool threads.

### Real Example: Parallel Aggregation with ConcurrentBag

```csharp
public static class ParallelAggregator
{
    public static async Task<AggregateResult> AnalyzeFilesAsync(string[] filePaths)
    {
        var wordCounts = new ConcurrentDictionary<string, int>();
        var errors = new ConcurrentBag<string>();
        long totalLines = 0;

        await Parallel.ForEachAsync(filePaths,
            new ParallelOptions { MaxDegreeOfParallelism = 8 },
            async (filePath, ct) =>
        {
            try
            {
                var lines = await File.ReadAllLinesAsync(filePath, ct);
                Interlocked.Add(ref totalLines, lines.Length);

                foreach (var line in lines)
                {
                    foreach (var word in line.Split(' ', StringSplitOptions.RemoveEmptyEntries))
                    {
                        wordCounts.AddOrUpdate(word.ToLowerInvariant(), 1, (_, c) => c + 1);
                    }
                }
            }
            catch (Exception ex)
            {
                errors.Add($"{filePath}: {ex.Message}");
            }
        });

        return new AggregateResult(
            TotalLines: totalLines,
            UniqueWords: wordCounts.Count,
            TopWords: wordCounts.OrderByDescending(x => x.Value).Take(10).ToList(),
            Errors: errors.ToList()
        );
    }
}

public record AggregateResult(
    long TotalLines,
    int UniqueWords,
    List<KeyValuePair<string, int>> TopWords,
    List<string> Errors
);
```

> **Caution:** Iterating a concurrent collection (e.g., `foreach`, LINQ) provides a snapshot-like view that is safe but not a frozen point-in-time. Items may be added or removed during iteration. If you need an exact snapshot, copy to an array first with `ToArray()`.

## Summary

Concurrent collections remove the error-prone burden of manual locking for shared data structures. They use sophisticated internal algorithms to maximize throughput under contention. Choose the right collection based on your access pattern (keyed lookup, FIFO, LIFO, unordered) and whether you need bounded capacity. In the next lesson, we will explore `Channel<T>`, the modern async-native alternative for producer-consumer pipelines.
