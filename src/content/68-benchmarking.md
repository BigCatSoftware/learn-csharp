# Benchmarking with BenchmarkDotNet

Guessing which code is faster leads to wrong conclusions. **BenchmarkDotNet** is the standard .NET
benchmarking library that handles JIT warmup, statistical analysis, and garbage collection
measurement so you do not have to.

---

## Setup

```
dotnet new console -n MyBenchmarks
cd MyBenchmarks
dotnet add package BenchmarkDotNet
```

> **Important:** Always run benchmarks in **Release** mode. Debug builds disable optimizations
> and produce meaningless results:
> ```
> dotnet run -c Release
> ```

---

## Your First Benchmark

```csharp
using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Running;

BenchmarkRunner.Run<StringBenchmarks>();

[MemoryDiagnoser]
public class StringBenchmarks
{
    private readonly string[] _words = Enumerable.Range(0, 1000)
        .Select(i => $"word{i}")
        .ToArray();

    [Benchmark(Baseline = true)]
    public string Concatenation()
    {
        string result = "";
        foreach (var word in _words)
            result += word + " ";
        return result;
    }

    [Benchmark]
    public string StringBuilder()
    {
        var sb = new System.Text.StringBuilder();
        foreach (var word in _words)
            sb.Append(word).Append(' ');
        return sb.ToString();
    }

    [Benchmark]
    public string StringJoin()
    {
        return string.Join(' ', _words);
    }
}
```

Output:

```
| Method        |        Mean |     Error |    StdDev | Ratio |    Gen0 |   Gen1 | Allocated | Alloc Ratio |
|-------------- |------------:|----------:|----------:|------:|--------:|-------:|----------:|------------:|
| Concatenation | 1,234.56 us | 12.345 us | 10.123 us |  1.00 | 500.000 | 50.000 |   2.34 MB |        1.00 |
| StringBuilder |    12.34 us |  0.123 us |  0.103 us |  0.01 |   3.456 |      - |  14.16 KB |        0.01 |
| StringJoin    |     8.67 us |  0.087 us |  0.077 us |  0.01 |   2.345 |      - |   9.78 KB |        0.00 |
```

---

## Key Attributes

### [Benchmark]

Marks a method as a benchmark. The method must be `public` and can return a value (to prevent
dead code elimination).

```csharp
[Benchmark]
public int MyBenchmark()
{
    // Return the result so the JIT does not optimize it away
    return ComputeSomething();
}
```

### [Params]

Run the benchmark with multiple parameter values:

```csharp
[MemoryDiagnoser]
public class CollectionBenchmarks
{
    [Params(100, 1_000, 10_000, 100_000)]
    public int Size { get; set; }

    private int[] _data = null!;

    [GlobalSetup]
    public void Setup()
    {
        _data = Enumerable.Range(0, Size).ToArray();
    }

    [Benchmark]
    public int ListSum()
    {
        var list = new List<int>(_data);
        int sum = 0;
        for (int i = 0; i < list.Count; i++)
            sum += list[i];
        return sum;
    }

    [Benchmark]
    public int ArraySum()
    {
        int sum = 0;
        for (int i = 0; i < _data.Length; i++)
            sum += _data[i];
        return sum;
    }

    [Benchmark]
    public int SpanSum()
    {
        var span = _data.AsSpan();
        int sum = 0;
        for (int i = 0; i < span.Length; i++)
            sum += span[i];
        return sum;
    }
}
```

### [GlobalSetup] and [GlobalCleanup]

Run once before/after all iterations of a benchmark:

```csharp
[GlobalSetup]
public void Setup()
{
    // Prepare test data, open connections, etc.
    _connection = new SqlConnection(connectionString);
    _connection.Open();
}

[GlobalCleanup]
public void Cleanup()
{
    _connection?.Dispose();
}
```

### [IterationSetup] and [IterationCleanup]

Run before/after *each* iteration (use sparingly — adds overhead):

```csharp
[IterationSetup]
public void IterationSetup()
{
    _list = new List<int>(Enumerable.Range(0, 10_000));
}
```

---

## Memory Diagnoser

`[MemoryDiagnoser]` reports heap allocations and GC collections:

```csharp
[MemoryDiagnoser]
public class AllocationBenchmarks
{
    [Benchmark]
    public string[] LinqToArray()
    {
        return Enumerable.Range(0, 1000).Select(i => i.ToString()).ToArray();
    }

    [Benchmark]
    public string[] ManualArray()
    {
        var result = new string[1000];
        for (int i = 0; i < 1000; i++)
            result[i] = i.ToString();
        return result;
    }
}
```

The output includes:
- **Gen0/Gen1/Gen2**: number of GC collections per 1000 operations
- **Allocated**: bytes allocated per operation

> **Tip:** For hot paths, reducing allocations is often more impactful than reducing CPU time.
> GC pauses affect latency unpredictably.

---

## Interpreting Results

| Column | Meaning |
|---|---|
| Mean | Average execution time |
| Error | Half of the 99.9% confidence interval |
| StdDev | Standard deviation across iterations |
| Median | Middle value (less sensitive to outliers) |
| Ratio | Relative to the `[Benchmark(Baseline = true)]` method |
| Gen0 | GC Gen0 collections per 1000 operations |
| Allocated | Heap bytes allocated per single operation |

### What "Error" Means

If `Mean = 12.34 us` and `Error = 0.12 us`, the true mean is likely between 12.22 and 12.46
with 99.9% confidence.

### When Results Are Unreliable

Watch for:
- **High StdDev/Mean ratio** (> 15%): something is interfering (background processes, thermal throttling)
- **Very fast benchmarks** (< 1 ns): you might be measuring overhead, not your code
- **Wildly different runs**: close other applications, disable power saving

---

## Common Pitfalls

### 1. Dead Code Elimination

The JIT may remove code whose result is unused:

```csharp
// BAD: result is discarded — JIT may eliminate the entire body
[Benchmark]
public void BadBenchmark()
{
    var result = ComputeExpensiveValue();
}

// GOOD: return the result
[Benchmark]
public int GoodBenchmark()
{
    return ComputeExpensiveValue();
}
```

### 2. Benchmarking Debug Builds

```
// WRONG:
dotnet run

// CORRECT:
dotnet run -c Release
```

### 3. Constant Folding

The JIT pre-computes constant expressions at compile time:

```csharp
// BAD: the JIT computes this at compile time
[Benchmark]
public double BadMath() => Math.Sqrt(144.0); // always 12.0

// GOOD: use a field the JIT cannot predict
private double _value = 144.0;

[Benchmark]
public double GoodMath() => Math.Sqrt(_value);
```

### 4. Not Warming Up

BenchmarkDotNet handles warmup automatically. Do **not** add manual warmup loops:

```csharp
// WRONG: manual warmup is unnecessary and skews results
[Benchmark]
public int Wrong()
{
    for (int i = 0; i < 100; i++) Compute(); // "warmup" — don't do this
    return Compute();
}
```

---

## Benchmarking Collection Types

```csharp
[MemoryDiagnoser]
public class LookupBenchmarks
{
    [Params(100, 10_000)]
    public int Size { get; set; }

    private Dictionary<int, string> _dict = null!;
    private SortedDictionary<int, string> _sorted = null!;
    private List<KeyValuePair<int, string>> _list = null!;
    private int _searchKey;

    [GlobalSetup]
    public void Setup()
    {
        _dict = Enumerable.Range(0, Size).ToDictionary(i => i, i => $"val{i}");
        _sorted = new SortedDictionary<int, string>(_dict);
        _list = _dict.ToList();
        _searchKey = Size / 2;
    }

    [Benchmark(Baseline = true)]
    public string? DictionaryLookup() => _dict.TryGetValue(_searchKey, out var v) ? v : null;

    [Benchmark]
    public string? SortedDictionaryLookup() => _sorted.TryGetValue(_searchKey, out var v) ? v : null;

    [Benchmark]
    public string? ListLinearSearch() => _list.FirstOrDefault(kv => kv.Key == _searchKey).Value;
}
```

---

## Benchmarking Serialization

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

[MemoryDiagnoser]
public class SerializationBenchmarks
{
    private readonly Order _order = new()
    {
        Id = 12345,
        Customer = "Alice",
        Items = Enumerable.Range(0, 50)
            .Select(i => new OrderItem { ProductId = i, Quantity = i + 1, Price = i * 9.99m })
            .ToList()
    };

    private readonly string _json;
    private readonly byte[] _jsonBytes;

    public SerializationBenchmarks()
    {
        _json = JsonSerializer.Serialize(_order);
        _jsonBytes = JsonSerializer.SerializeToUtf8Bytes(_order);
    }

    [Benchmark(Baseline = true)]
    public string SerializeToString() => JsonSerializer.Serialize(_order);

    [Benchmark]
    public byte[] SerializeToUtf8() => JsonSerializer.SerializeToUtf8Bytes(_order);

    [Benchmark]
    public Order? DeserializeFromString() => JsonSerializer.Deserialize<Order>(_json);

    [Benchmark]
    public Order? DeserializeFromUtf8() => JsonSerializer.Deserialize<Order>(_jsonBytes);
}

// Using source generators for even faster serialization
[JsonSerializable(typeof(Order))]
public partial class OrderJsonContext : JsonSerializerContext { }

public class Order
{
    public int Id { get; set; }
    public string Customer { get; set; } = "";
    public List<OrderItem> Items { get; set; } = new();
}

public class OrderItem
{
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public decimal Price { get; set; }
}
```

---

## Advanced: Custom Configurations

```csharp
using BenchmarkDotNet.Configs;
using BenchmarkDotNet.Jobs;
using BenchmarkDotNet.Environments;

var config = DefaultConfig.Instance
    .AddJob(Job.Default.WithRuntime(CoreRuntime.Core80))
    .AddJob(Job.Default.WithRuntime(CoreRuntime.Core90));

BenchmarkRunner.Run<MyBenchmarks>(config);
```

---

## Summary

| Concern | Solution |
|---|---|
| Accurate timing | BenchmarkDotNet handles warmup and statistics |
| Memory measurement | `[MemoryDiagnoser]` attribute |
| Multiple parameters | `[Params]` attribute |
| Setup/teardown | `[GlobalSetup]` / `[GlobalCleanup]` |
| Dead code elimination | Return values from benchmark methods |
| Constant folding | Use instance fields, not literals |
| Release mode | Always `dotnet run -c Release` |
| Comparing approaches | Use `[Benchmark(Baseline = true)]` and Ratio column |
