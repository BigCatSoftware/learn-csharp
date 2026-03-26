# Iterators and Yield

Iterators let you produce sequences of values lazily — one at a time, on demand — instead of building an entire collection in memory. The `yield return` keyword turns an ordinary method into a state machine that pauses execution after each value and resumes when the caller asks for the next one.

## The Basics of yield return

Any method that returns `IEnumerable<T>` or `IEnumerator<T>` and contains a `yield return` statement is an iterator method.

```csharp
public static IEnumerable<int> OneTwoThree()
{
    Console.WriteLine("Yielding 1");
    yield return 1;

    Console.WriteLine("Yielding 2");
    yield return 2;

    Console.WriteLine("Yielding 3");
    yield return 3;
}

// Usage
foreach (int n in OneTwoThree())
{
    Console.WriteLine($"Got: {n}");
}

// Output:
// Yielding 1
// Got: 1
// Yielding 2
// Got: 2
// Yielding 3
// Got: 3
```

> **Important:** The body of the iterator method does not execute when you call it. Execution begins only when the caller starts enumerating (e.g., via `foreach` or `.MoveNext()`). This is called **deferred execution**.

## yield break

Use `yield break` to end the sequence early.

```csharp
public static IEnumerable<int> TakeWhilePositive(IEnumerable<int> source)
{
    foreach (int item in source)
    {
        if (item <= 0)
            yield break; // stop producing values

        yield return item;
    }
}

var numbers = new[] { 5, 3, 8, -1, 10, 7 };
foreach (int n in TakeWhilePositive(numbers))
    Console.Write($"{n} "); // 5 3 8
```

## How It Works Under the Hood

The compiler transforms your iterator method into a class that implements `IEnumerable<T>` and `IEnumerator<T>`. This generated class is a **state machine** with a state field that tracks where execution should resume.

```csharp
// You write this:
public static IEnumerable<int> Count(int from, int to)
{
    for (int i = from; i <= to; i++)
        yield return i;
}

// The compiler generates something roughly like this:
private sealed class CountIterator : IEnumerable<int>, IEnumerator<int>
{
    private int _state;    // tracks where to resume
    private int _current;  // the value returned by Current
    private int _from;
    private int _to;
    private int _i;

    public int Current => _current;

    public bool MoveNext()
    {
        switch (_state)
        {
            case 0:
                _i = _from;
                _state = 1;
                goto case 1;
            case 1:
                if (_i <= _to)
                {
                    _current = _i;
                    _i++;
                    return true;
                }
                _state = -1;
                return false;
            default:
                return false;
        }
    }

    // Reset, Dispose, GetEnumerator omitted for brevity
}
```

> **Note:** You never need to write this boilerplate yourself. The compiler handles all of it. Understanding the transformation helps you reason about behavior — for example, local variables become fields on the generated class and persist across `MoveNext()` calls.

## Lazy Evaluation in Practice

Iterators are lazy. Values are computed only when requested. This means you can represent sequences that would be impossibly large (or infinite) without running out of memory.

### Infinite Sequences

```csharp
public static IEnumerable<long> Fibonacci()
{
    long a = 0, b = 1;

    while (true)
    {
        yield return a;
        (a, b) = (b, a + b);
    }
}

// Take just the first 10 Fibonacci numbers
foreach (long fib in Fibonacci().Take(10))
    Console.Write($"{fib} "); // 0 1 1 2 3 5 8 13 21 34
```

### Generating Prime Numbers

```csharp
public static IEnumerable<int> Primes()
{
    yield return 2;

    for (int candidate = 3; ; candidate += 2)
    {
        if (IsPrime(candidate))
            yield return candidate;
    }
}

private static bool IsPrime(int n)
{
    if (n < 2) return false;
    for (int i = 2; i * i <= n; i++)
    {
        if (n % i == 0) return false;
    }
    return true;
}

// First 20 primes
var first20 = Primes().Take(20).ToList();
```

> **Tip:** Infinite iterators are perfectly safe as long as the consumer limits how many elements it takes. Combine them with `.Take()`, `.TakeWhile()`, or manual `break` in a `foreach`.

## Reading Large Files Line by Line

Instead of loading an entire file into memory with `File.ReadAllLines()`, use an iterator to stream lines lazily.

```csharp
public static IEnumerable<string> ReadLines(string filePath)
{
    using StreamReader reader = new(filePath);

    string? line;
    while ((line = reader.ReadLine()) is not null)
    {
        yield return line;
    }
}

// Process a multi-gigabyte log file with constant memory usage
foreach (string line in ReadLines("/var/log/app/huge.log"))
{
    if (line.Contains("ERROR"))
        Console.WriteLine(line);
}
```

> **Warning:** The `using` statement inside an iterator keeps the resource open for the lifetime of the enumeration. If the consumer doesn't fully enumerate (e.g., breaks early), the `Dispose()` method on the enumerator will close the resource. Always use `foreach` or call `Dispose()` on the enumerator to avoid resource leaks.

## Paginated API Results

Iterators are a natural fit for hiding pagination logic behind a simple `foreach`.

```csharp
public static IEnumerable<User> GetAllUsers(IUserApiClient api)
{
    int page = 1;
    const int pageSize = 100;

    while (true)
    {
        List<User> batch = api.GetUsers(page, pageSize);

        if (batch.Count == 0)
            yield break;

        foreach (User user in batch)
            yield return user;

        page++;
    }
}

// The caller sees a simple, flat sequence
foreach (User user in GetAllUsers(apiClient))
{
    Console.WriteLine($"{user.Name} ({user.Email})");
}
```

> **Note:** For async pagination, consider using `IAsyncEnumerable<T>` with `await foreach` and `yield return` in an `async` iterator method. See the async iterators section below.

## Tree Traversal

Iterators make recursive data structure traversal clean and composable.

```csharp
public class TreeNode<T>
{
    public T Value { get; set; }
    public List<TreeNode<T>> Children { get; } = new();

    public TreeNode(T value) => Value = value;

    // Depth-first traversal as an iterator
    public IEnumerable<T> DepthFirst()
    {
        yield return Value;

        foreach (var child in Children)
        {
            foreach (T descendant in child.DepthFirst())
                yield return descendant;
        }
    }

    // Breadth-first traversal
    public IEnumerable<T> BreadthFirst()
    {
        var queue = new Queue<TreeNode<T>>();
        queue.Enqueue(this);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            yield return current.Value;

            foreach (var child in current.Children)
                queue.Enqueue(child);
        }
    }
}

// Usage
var root = new TreeNode<string>("root");
root.Children.Add(new TreeNode<string>("A"));
root.Children.Add(new TreeNode<string>("B"));
root.Children[0].Children.Add(new TreeNode<string>("A1"));
root.Children[0].Children.Add(new TreeNode<string>("A2"));

foreach (string node in root.DepthFirst())
    Console.Write($"{node} "); // root A A1 A2 B
```

## Async Iterators (IAsyncEnumerable\<T\>)

C# 8.0 introduced async iterators, combining `async`/`await` with `yield return`.

```csharp
public static async IAsyncEnumerable<User> GetAllUsersAsync(IUserApiClient api)
{
    int page = 1;

    while (true)
    {
        List<User> batch = await api.GetUsersAsync(page, pageSize: 50);

        if (batch.Count == 0)
            yield break;

        foreach (User user in batch)
            yield return user;

        page++;
    }
}

// Consuming with await foreach
await foreach (User user in GetAllUsersAsync(apiClient))
{
    await ProcessUserAsync(user);
}
```

## Composing Iterator Pipelines

One of the most powerful aspects of iterators is composability. Each step in a pipeline is lazy.

```csharp
public static IEnumerable<string> ProcessLogFile(string path)
{
    return ReadLines(path)
        .Where(line => !string.IsNullOrWhiteSpace(line))
        .Where(line => line.Contains("ERROR"))
        .Select(line => ExtractTimestamp(line) + ": " + ExtractMessage(line));
}

// Nothing executes until you iterate
foreach (string entry in ProcessLogFile("app.log").Take(100))
    Console.WriteLine(entry);
```

## Common Pitfalls

### Pitfall 1: Argument Validation Is Deferred

```csharp
// BAD: The null check won't run until enumeration starts
public static IEnumerable<T> BadFilter<T>(IEnumerable<T> source, Func<T, bool> predicate)
{
    if (source is null) throw new ArgumentNullException(nameof(source));
    foreach (T item in source)
        if (predicate(item))
            yield return item;
}

// GOOD: Separate validation from iteration
public static IEnumerable<T> GoodFilter<T>(IEnumerable<T> source, Func<T, bool> predicate)
{
    if (source is null) throw new ArgumentNullException(nameof(source));
    if (predicate is null) throw new ArgumentNullException(nameof(predicate));
    return FilterCore(source, predicate);
}

private static IEnumerable<T> FilterCore<T>(IEnumerable<T> source, Func<T, bool> predicate)
{
    foreach (T item in source)
        if (predicate(item))
            yield return item;
}
```

### Pitfall 2: Multiple Enumeration

```csharp
// BAD: Enumerates the sequence twice (two API calls, two file reads, etc.)
IEnumerable<int> values = GetExpensiveSequence();
Console.WriteLine($"Count: {values.Count()}");      // first enumeration
Console.WriteLine($"Sum: {values.Sum()}");           // second enumeration

// GOOD: Materialize once if you need multiple passes
var materialized = GetExpensiveSequence().ToList();
Console.WriteLine($"Count: {materialized.Count}");
Console.WriteLine($"Sum: {materialized.Sum()}");
```

> **Caution:** LINQ methods like `.Count()`, `.Any()`, `.ToList()` trigger enumeration. Calling multiple such methods on the same iterator will re-execute the entire pipeline each time.

## Key Takeaways

1. `yield return` turns a method into a lazy, pull-based state machine.
2. `yield break` terminates the sequence early.
3. Execution is deferred until the caller starts iterating.
4. Iterators enable infinite sequences, streamed file processing, and transparent pagination.
5. Async iterators (`IAsyncEnumerable<T>`) extend the pattern to async I/O scenarios.
6. Always validate arguments eagerly in a wrapper method, not inside the iterator body.
7. Be aware of multiple enumeration when consuming `IEnumerable<T>`.
