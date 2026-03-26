# Threading Primitives

Threading primitives are the fundamental building blocks for coordinating concurrent access to shared resources in .NET. While higher-level abstractions like `Task` and `async/await` handle most scenarios, understanding these primitives is essential for writing correct, high-performance multithreaded code.

## The Thread Class

The `Thread` class provides direct control over OS-level threads. Use it when you need long-running background work with explicit lifecycle management.

```csharp
// Creating and starting a thread
var thread = new Thread(() =>
{
    for (int i = 0; i < 5; i++)
    {
        Console.WriteLine($"Worker thread: {i} (Thread ID: Environment.CurrentManagedThreadId)");
        Thread.Sleep(100);
    }
});

thread.Name = "MyWorker";
thread.IsBackground = true; // Won't prevent app from exiting
thread.Start();

// Wait for thread to complete (with timeout)
bool completed = thread.Join(TimeSpan.FromSeconds(5));
Console.WriteLine($"Thread completed: {completed}");
```

> **Warning:** Creating threads directly is expensive (~1 MB stack per thread). Prefer `ThreadPool` or `Task.Run` for short-lived work. Reserve `Thread` for dedicated, long-running operations.

## ThreadPool

The `ThreadPool` manages a pool of reusable worker threads, avoiding the cost of creating and destroying threads repeatedly.

```csharp
// Queue work to the thread pool
ThreadPool.QueueUserWorkItem(state =>
{
    Console.WriteLine($"Running on pool thread {Environment.CurrentManagedThreadId}");
});

// With typed state to avoid closure allocations
ThreadPool.QueueUserWorkItem(static (string message) =>
{
    Console.WriteLine(message);
}, "Hello from pool", preferLocal: false);
```

## Monitor and the lock Statement

The `lock` statement compiles down to `Monitor.Enter` / `Monitor.Exit`. It provides mutual exclusion so only one thread enters the critical section at a time.

```csharp
public class BankAccount
{
    private readonly object _lock = new();
    private decimal _balance;

    public decimal Balance
    {
        get { lock (_lock) { return _balance; } }
    }

    public bool TryTransfer(BankAccount target, decimal amount)
    {
        // Always lock in a consistent order to avoid deadlocks
        object firstLock = _lock.GetHashCode() < target._lock.GetHashCode() ? _lock : target._lock;
        object secondLock = firstLock == _lock ? target._lock : _lock;

        lock (firstLock)
        {
            lock (secondLock)
            {
                if (_balance < amount) return false;
                _balance -= amount;
                target._balance += amount;
                return true;
            }
        }
    }
}
```

> **Tip:** Use `Monitor.TryEnter` with a timeout to avoid indefinite blocking:
> ```csharp
> bool lockTaken = false;
> try
> {
>     Monitor.TryEnter(_lock, TimeSpan.FromSeconds(1), ref lockTaken);
>     if (lockTaken) { /* critical section */ }
>     else { /* handle timeout */ }
> }
> finally { if (lockTaken) Monitor.Exit(_lock); }
> ```

## Mutex

A `Mutex` works like `lock` but can synchronize across **processes**. This makes it ideal for ensuring only one instance of an application runs.

```csharp
using var mutex = new Mutex(initiallyOwned: false, name: "Global\\MyAppSingleInstance");

if (!mutex.WaitOne(TimeSpan.Zero))
{
    Console.WriteLine("Another instance is already running.");
    return;
}

try
{
    Console.WriteLine("Application started. Press Enter to exit.");
    Console.ReadLine();
}
finally
{
    mutex.ReleaseMutex();
}
```

> **Important:** Named mutexes are system-wide. Prefix with `Global\` for cross-session visibility or `Local\` for per-session scope.

## Semaphore and SemaphoreSlim

Semaphores allow a limited number of threads to access a resource concurrently. `SemaphoreSlim` is the lightweight, in-process version.

### Real Example: Rate Limiter with SemaphoreSlim

```csharp
public class RateLimitedHttpClient
{
    private readonly HttpClient _client = new();
    private readonly SemaphoreSlim _throttle;

    public RateLimitedHttpClient(int maxConcurrentRequests)
    {
        _throttle = new SemaphoreSlim(maxConcurrentRequests, maxConcurrentRequests);
    }

    public async Task<string> GetAsync(string url, CancellationToken ct = default)
    {
        await _throttle.WaitAsync(ct);
        try
        {
            Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] Requesting {url} " +
                              $"(slots available: {_throttle.CurrentCount})");
            return await _client.GetStringAsync(url, ct);
        }
        finally
        {
            _throttle.Release();
        }
    }

    public async Task<string[]> GetManyAsync(IEnumerable<string> urls)
    {
        var tasks = urls.Select(url => GetAsync(url));
        return await Task.WhenAll(tasks);
    }
}

// Usage: only 5 requests fly at once
var client = new RateLimitedHttpClient(maxConcurrentRequests: 5);
var results = await client.GetManyAsync(urls);
```

## ReaderWriterLockSlim

Allows multiple concurrent readers **or** a single exclusive writer. Ideal for read-heavy caches.

### Real Example: Thread-Safe Cache

```csharp
public class ThreadSafeCache<TKey, TValue> where TKey : notnull
{
    private readonly Dictionary<TKey, TValue> _cache = new();
    private readonly ReaderWriterLockSlim _rwLock = new();
    private readonly Func<TKey, TValue> _factory;

    public ThreadSafeCache(Func<TKey, TValue> factory) => _factory = factory;

    public TValue GetOrAdd(TKey key)
    {
        // Try read lock first (many readers allowed simultaneously)
        _rwLock.EnterReadLock();
        try
        {
            if (_cache.TryGetValue(key, out var value))
                return value;
        }
        finally { _rwLock.ExitReadLock(); }

        // Upgrade to write lock (exclusive)
        _rwLock.EnterWriteLock();
        try
        {
            // Double-check after acquiring write lock
            if (_cache.TryGetValue(key, out var value))
                return value;

            value = _factory(key);
            _cache[key] = value;
            return value;
        }
        finally { _rwLock.ExitWriteLock(); }
    }

    public IReadOnlyList<TValue> GetAll()
    {
        _rwLock.EnterReadLock();
        try { return _cache.Values.ToList(); }
        finally { _rwLock.ExitReadLock(); }
    }
}
```

> **Note:** `ReaderWriterLockSlim` outperforms `lock` only when reads vastly outnumber writes. If reads and writes are roughly equal, a simple `lock` may be faster due to lower overhead.

## ManualResetEventSlim and AutoResetEvent

These signaling primitives let threads wait for a signal from another thread.

| Primitive | Behavior After Signal | Use Case |
|---|---|---|
| `ManualResetEventSlim` | Stays signaled (all waiters released) | One-time initialization gate |
| `AutoResetEvent` | Auto-resets after releasing one waiter | Turn-based coordination |

### Real Example: Coordinating Multiple Threads with Events

```csharp
public class PipelineCoordinator
{
    private readonly ManualResetEventSlim _dataReady = new(false);
    private readonly AutoResetEvent _processNext = new(false);
    private readonly ConcurrentQueue<string> _queue = new();
    private volatile bool _complete;

    public void RunPipeline()
    {
        // Start 3 worker threads
        var workers = Enumerable.Range(0, 3)
            .Select(id => new Thread(() => Worker(id)) { IsBackground = true })
            .ToList();

        workers.ForEach(w => w.Start());

        // Producer: signal when data is available
        foreach (var item in new[] { "Alpha", "Bravo", "Charlie", "Delta", "Echo" })
        {
            _queue.Enqueue(item);
            _processNext.Set(); // Wake one worker
        }

        _complete = true;
        _dataReady.Set(); // Signal all workers to check for completion

        workers.ForEach(w => w.Join());
        Console.WriteLine("Pipeline complete.");
    }

    private void Worker(int id)
    {
        while (true)
        {
            // Wait for either a specific item or the completion signal
            WaitHandle.WaitAny(new[] { _processNext, _dataReady.WaitHandle });

            if (_queue.TryDequeue(out var item))
            {
                Console.WriteLine($"Worker {id} processing: {item}");
                Thread.Sleep(50); // Simulate work
            }
            else if (_complete)
            {
                break;
            }
        }
    }
}
```

## Interlocked Operations

`Interlocked` provides atomic operations on shared variables without locks. These are the fastest synchronization primitives available.

```csharp
public class AtomicStatistics
{
    private long _requestCount;
    private long _totalResponseTimeMs;
    private long _errorCount;

    public void RecordSuccess(long responseTimeMs)
    {
        Interlocked.Increment(ref _requestCount);
        Interlocked.Add(ref _totalResponseTimeMs, responseTimeMs);
    }

    public void RecordError()
    {
        Interlocked.Increment(ref _requestCount);
        Interlocked.Increment(ref _errorCount);
    }

    public (long Requests, double AvgMs, long Errors) GetSnapshot()
    {
        long requests = Interlocked.Read(ref _requestCount);
        long totalMs = Interlocked.Read(ref _totalResponseTimeMs);
        long errors = Interlocked.Read(ref _errorCount);

        double avgMs = requests > 0 ? (double)totalMs / (requests - errors) : 0;
        return (requests, avgMs, errors);
    }

    // Atomic compare-and-swap for lock-free max tracking
    public void UpdateMax(ref long currentMax, long candidate)
    {
        long initial;
        do
        {
            initial = Interlocked.Read(ref currentMax);
            if (candidate <= initial) return;
        }
        while (Interlocked.CompareExchange(ref currentMax, candidate, initial) != initial);
    }
}
```

## Choosing the Right Primitive

| Scenario | Recommended Primitive |
|---|---|
| Simple mutual exclusion (in-process) | `lock` / `Monitor` |
| Cross-process mutual exclusion | `Mutex` |
| Limiting concurrent access (async) | `SemaphoreSlim` |
| Limiting concurrent access (cross-process) | `Semaphore` |
| Read-heavy shared data | `ReaderWriterLockSlim` |
| One-time initialization signal | `ManualResetEventSlim` |
| Turn-based thread signaling | `AutoResetEvent` |
| Atomic counter/flag updates | `Interlocked` |
| Short-lived parallel work | `ThreadPool` / `Task.Run` |
| Dedicated long-running thread | `Thread` |

> **Caution:** Mixing multiple locking primitives increases deadlock risk. Establish a clear lock ordering and document it. Prefer higher-level abstractions (`Task`, `Channel`, concurrent collections) when they fit the problem.

## Summary

Threading primitives give you fine-grained control over synchronization, but that control comes with responsibility. Always start with the simplest correct solution, measure to confirm a bottleneck exists, and only then reach for lower-level primitives. In the next lesson, we will look at concurrent collections that encapsulate many of these primitives behind safe, ergonomic APIs.
