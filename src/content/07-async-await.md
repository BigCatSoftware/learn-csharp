# Async and Await

*Asynchronous programming in C#*

Asynchronous programming allows your application to perform work without blocking the calling thread. This is essential for responsive UIs, scalable web servers, and efficient I/O operations.

## The Basics

```csharp
// Synchronous - blocks the thread
string content = File.ReadAllText("data.txt");

// Asynchronous - frees the thread while waiting
string content = await File.ReadAllTextAsync("data.txt");
```

The `async` keyword enables `await` in a method. The `await` keyword suspends execution until the awaited task completes, **without blocking the thread**:

```csharp
public async Task<string> FetchDataAsync(string url)
{
    using var client = new HttpClient();
    string result = await client.GetStringAsync(url);
    return result;
}
```

## Task and Task\<T\>

| Return Type | When to Use |
|-------------|-------------|
| `Task<T>` | Async method that returns a value of type T |
| `Task` | Async method that returns no value |
| `ValueTask<T>` | High-performance scenarios (frequently synchronous completion) |
| `void` | Only for event handlers — avoid otherwise |

```csharp
// Returns a value
public async Task<int> CalculateAsync()
{
    await Task.Delay(1000); // Simulate work
    return 42;
}

// Returns nothing
public async Task ProcessAsync()
{
    await Task.Delay(1000);
    Console.WriteLine("Done!");
}

// Value task - for hot paths
public async ValueTask<int> GetCachedValueAsync()
{
    if (_cache.TryGetValue("key", out int value))
        return value; // No allocation - synchronous return

    value = await ComputeExpensiveValueAsync();
    _cache["key"] = value;
    return value;
}
```

> **Warning:** Never use `async void` except for event handlers. Exceptions in `async void` methods cannot be caught and will crash your application.

## Running Tasks in Parallel

```csharp
// Sequential - slow (3 seconds total)
var user = await GetUserAsync(userId);
var orders = await GetOrdersAsync(userId);
var recommendations = await GetRecommendationsAsync(userId);

// Parallel - fast (1 second total, all run concurrently)
var userTask = GetUserAsync(userId);
var ordersTask = GetOrdersAsync(userId);
var recsTask = GetRecommendationsAsync(userId);

await Task.WhenAll(userTask, ordersTask, recsTask);

var user = userTask.Result;
var orders = ordersTask.Result;
var recommendations = recsTask.Result;
```

```csharp
// WhenAny - first to complete wins
var tasks = urls.Select(url => FetchAsync(url));
var firstCompleted = await Task.WhenAny(tasks);
var result = await firstCompleted;
```

> **Tip:** Start all independent async operations before awaiting any of them. This allows them to run concurrently rather than sequentially.

## Cancellation

Use `CancellationToken` to support cooperative cancellation:

```csharp
public async Task<string> DownloadAsync(string url, CancellationToken ct = default)
{
    using var client = new HttpClient();
    var response = await client.GetAsync(url, ct);
    ct.ThrowIfCancellationRequested();
    return await response.Content.ReadAsStringAsync(ct);
}

// Usage
var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
try
{
    string data = await DownloadAsync("https://example.com", cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("Download was cancelled or timed out.");
}
```

## Async Streams (C# 8+)

Process items as they arrive rather than waiting for all of them:

```csharp
public async IAsyncEnumerable<int> GenerateSequenceAsync(
    [EnumeratorCancellation] CancellationToken ct = default)
{
    for (int i = 0; i < 100; i++)
    {
        await Task.Delay(100, ct);
        yield return i;
    }
}

// Consume with await foreach
await foreach (var number in GenerateSequenceAsync())
{
    Console.WriteLine(number);
    if (number >= 10) break;
}
```

## Common Pitfalls

```csharp
// WRONG: Blocking on async code (can deadlock!)
var result = GetDataAsync().Result;     // Don't do this
var result2 = GetDataAsync().GetAwaiter().GetResult(); // Also bad

// RIGHT: Await it properly
var result = await GetDataAsync();

// WRONG: Unnecessary async/await wrapper
public async Task<int> GetValueAsync()
{
    return await _repository.GetValueAsync(); // Unnecessary wrapper
}

// RIGHT: Just pass the task through
public Task<int> GetValueAsync()
{
    return _repository.GetValueAsync();
}
```

> **Caution:** Never call `.Result` or `.Wait()` on a task from a synchronous context — this can cause deadlocks. Always propagate `async` up the call chain.

## Real-World Example

```csharp
public class WeatherService
{
    private readonly HttpClient _client;
    private readonly IMemoryCache _cache;

    public async Task<WeatherData> GetWeatherAsync(
        string city,
        CancellationToken ct = default)
    {
        var cacheKey = $"weather:{city}";

        if (_cache.TryGetValue(cacheKey, out WeatherData cached))
            return cached;

        var response = await _client.GetAsync($"/api/weather/{city}", ct);
        response.EnsureSuccessStatusCode();

        var weather = await response.Content.ReadFromJsonAsync<WeatherData>(ct);

        _cache.Set(cacheKey, weather, TimeSpan.FromMinutes(10));

        return weather;
    }
}
```
