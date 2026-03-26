# Memory Management and GC

Understanding how .NET manages memory is critical for building high-performance applications. The garbage collector (GC) handles most allocation and deallocation automatically, but knowing its internals helps you write code that works with it rather than against it.

## Stack vs Heap

.NET uses two primary memory regions:

| Feature | Stack | Heap |
|---|---|---|
| Allocation speed | Extremely fast (pointer bump) | Slower (GC managed) |
| Deallocation | Automatic on method return | Garbage collected |
| Size | Small (~1 MB per thread) | Large (limited by system RAM) |
| Stores | Local value types, method params, return addresses | Reference type instances, boxed values |
| Thread safety | Private to each thread | Shared across all threads |

```csharp
void Example()
{
    int x = 42;              // Stack: value type local
    Span<byte> buf = stackalloc byte[256]; // Stack: explicit stack alloc

    string name = "hello";   // Heap: string object; 'name' reference on stack
    var list = new List<int>(); // Heap: List object; 'list' reference on stack

    var point = new Point(1, 2); // Stack: if Point is a struct
}
```

## Value Types vs Reference Types: Memory Layout

```
Value Type (struct):          Reference Type (class):
Stack/Inline                  Stack              Heap
+----------+                  +----------+       +------------------+
| x:  42   |                  | ref: ----+-----> | SyncBlock        |
| y:  17   |                  +----------+       | TypeHandle       |
+----------+                                     | x: 42            |
                                                  | y: 17            |
                                                  +------------------+
```

> **Note:** A struct stored inside a class field lives on the heap as part of the containing object. "Value types go on the stack" is a simplification; it depends on where the variable is declared.

## GC Generations

The .NET GC uses a generational algorithm based on the observation that most objects die young.

| Generation | Contains | Collected | Typical Size |
|---|---|---|---|
| Gen 0 | Newly allocated objects | Very frequently | ~256 KB - 4 MB |
| Gen 1 | Survived one Gen 0 collection | Frequently | ~512 KB - 4 MB |
| Gen 2 | Long-lived objects | Infrequently (expensive) | Grows as needed |
| LOH | Objects >= 85,000 bytes | With Gen 2 collections | Grows as needed |
| POH | Pinned objects (.NET 5+) | With Gen 2 collections | Grows as needed |

```csharp
// Check which generation an object is in
var data = new byte[100];
Console.WriteLine($"Generation: {GC.GetGeneration(data)}"); // 0

GC.Collect(0);
Console.WriteLine($"Generation: {GC.GetGeneration(data)}"); // 1

GC.Collect(1);
Console.WriteLine($"Generation: {GC.GetGeneration(data)}"); // 2
```

### How a Collection Works

1. GC **suspends** all managed threads (stop-the-world pause).
2. **Mark phase**: walks from roots (stack variables, statics, GC handles) and marks all reachable objects.
3. **Sweep/Compact phase**: reclaims unmarked objects, compacts survivors to eliminate fragmentation.
4. **Promotes** survivors to the next generation.
5. Resumes all threads.

> **Important:** Gen 2 and LOH collections cause the longest pauses because they scan the most memory. Reducing objects that survive to Gen 2 is one of the most impactful performance optimizations.

## Large Object Heap (LOH)

Objects 85,000 bytes or larger are allocated directly on the LOH. The LOH is only collected during Gen 2 collections and is **not compacted by default**.

```csharp
// This goes straight to LOH (85,000+ bytes)
var largeArray = new byte[100_000];
Console.WriteLine($"Generation: {GC.GetGeneration(largeArray)}"); // 2 (LOH)

// Enable LOH compaction if fragmentation is a problem
GCSettings.LargeObjectHeapCompactionMode = GCLargeObjectHeapCompactionMode.CompactOnce;
GC.Collect();
```

> **Warning:** Frequent LOH allocations cause fragmentation and expensive Gen 2 collections. Use `ArrayPool<T>` to rent and return large arrays instead.

## GC.Collect: When to Use

Almost never. The GC is self-tuning. Forcing collections can **degrade** performance.

```csharp
// Acceptable uses:
// 1. After a large, one-time operation that created many temporary objects
void AfterBulkImport()
{
    // ... import complete, millions of temp objects created ...
    GC.Collect();
    GC.WaitForPendingFinalizers();
    GC.Collect(); // Second pass for objects with finalizers
}

// 2. Benchmarking: ensure a clean baseline
GC.Collect();
GC.WaitForPendingFinalizers();
GC.Collect();
var sw = Stopwatch.StartNew();
// ... benchmark code ...
```

## Reducing GC Pressure

GC pressure occurs when your code allocates objects faster than the GC can efficiently collect them. Here are techniques to reduce it.

### Use ArrayPool\<T\>

```csharp
using System.Buffers;

// Instead of: var buffer = new byte[8192];
byte[] buffer = ArrayPool<byte>.Shared.Rent(8192);
try
{
    int bytesRead = await stream.ReadAsync(buffer.AsMemory(0, 8192));
    ProcessData(buffer.AsSpan(0, bytesRead));
}
finally
{
    ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
}
```

> **Tip:** `ArrayPool.Rent` may return an array larger than requested. Always track the actual length you need separately.

### Use MemoryPool\<T\>

`MemoryPool<T>` wraps `ArrayPool<T>` and returns `IMemoryOwner<T>` for automatic disposal.

```csharp
using System.Buffers;

using IMemoryOwner<byte> owner = MemoryPool<byte>.Shared.Rent(4096);
Memory<byte> memory = owner.Memory.Slice(0, 4096);
// memory is valid until owner is disposed
```

### Object Pooling with ObjectPool\<T\>

For expensive-to-create objects, use `Microsoft.Extensions.ObjectPool`.

```csharp
using Microsoft.Extensions.ObjectPool;

// Create a pool for StringBuilder
var policy = new StringBuilderPooledObjectPolicy
{
    InitialCapacity = 256,
    MaximumRetainedCapacity = 4096
};
var pool = new DefaultObjectPool<StringBuilder>(policy);

// Rent, use, return
var sb = pool.Get();
try
{
    sb.Append("Processing item ");
    sb.Append(itemId);
    sb.Append(" at ");
    sb.Append(DateTime.UtcNow);
    logger.LogInformation(sb.ToString());
}
finally
{
    pool.Return(sb); // StringBuilder.Clear() called automatically by policy
}
```

### String Interning

Identical strings can share the same memory through interning.

```csharp
// The CLR automatically interns string literals
string a = "hello";
string b = "hello";
Console.WriteLine(ReferenceEquals(a, b)); // True - same object

// Manually intern runtime strings
string loaded = LoadFromDatabase(); // "hello"
string interned = string.Intern(loaded);
Console.WriteLine(ReferenceEquals(a, interned)); // True

// Check without interning
string found = string.IsInterned(loaded); // Returns interned version or null
```

> **Caution:** Interned strings live forever (rooted by the intern table). Only intern strings that appear frequently and persist for the app's lifetime, like enum names or status codes.

## Struct vs Class Performance

```csharp
// Class: heap allocation, GC tracked, 16+ bytes overhead
public class PointClass
{
    public double X { get; set; }
    public double Y { get; set; }
}

// Struct: stack/inline, no GC overhead, no header
public struct PointStruct
{
    public double X { get; set; }
    public double Y { get; set; }
}
```

| Factor | `struct` | `class` |
|---|---|---|
| Allocation | Stack or inline | Heap (GC managed) |
| Object header | None | 8-16 bytes (sync block + type handle) |
| Copy semantics | Copied by value | Copied by reference |
| Array layout | Contiguous (cache-friendly) | Array of pointers (indirection) |
| Best for | Small (<= 16 bytes), immutable data | Large or mutable shared data |
| GC impact | None when stack-allocated | Adds GC pressure |

```csharp
// Array of structs: one contiguous block of memory
var structArray = new PointStruct[1_000_000]; // ~16 MB, one allocation

// Array of classes: 1 million heap objects + pointer array
var classArray = new PointClass[1_000_000]; // ~40 MB, 1,000,001 allocations
for (int i = 0; i < classArray.Length; i++)
    classArray[i] = new PointClass(); // Each is a separate heap object
```

## Real Profiling Example

Use `GC.GetGCMemoryInfo()` and event counters to understand GC behavior at runtime.

```csharp
public static class MemoryDiagnostics
{
    public static void PrintGCStats()
    {
        var info = GC.GetGCMemoryInfo();
        Console.WriteLine("=== GC Memory Report ===");
        Console.WriteLine($"  Heap Size:        {info.HeapSizeBytes / 1024.0 / 1024:F1} MB");
        Console.WriteLine($"  Fragmented:       {info.FragmentedBytes / 1024.0 / 1024:F1} MB");
        Console.WriteLine($"  Memory Load:      {info.MemoryLoadBytes / 1024.0 / 1024:F1} MB");
        Console.WriteLine($"  Total Available:  {info.TotalAvailableMemoryBytes / 1024.0 / 1024:F1} MB");
        Console.WriteLine($"  High Memory:      {info.HighMemoryLoadThresholdBytes / 1024.0 / 1024:F1} MB");
        Console.WriteLine($"  GC Gen0 Count:    {GC.CollectionCount(0)}");
        Console.WriteLine($"  GC Gen1 Count:    {GC.CollectionCount(1)}");
        Console.WriteLine($"  GC Gen2 Count:    {GC.CollectionCount(2)}");
        Console.WriteLine($"  Total Memory:     {GC.GetTotalMemory(false) / 1024.0 / 1024:F1} MB");
        Console.WriteLine($"  Total Allocated:  {GC.GetTotalAllocatedBytes() / 1024.0 / 1024:F1} MB");
    }

    public static void MeasureAllocations(Action action, string label)
    {
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();

        long before = GC.GetTotalAllocatedBytes(precise: true);
        int gen0Before = GC.CollectionCount(0);

        action();

        long after = GC.GetTotalAllocatedBytes(precise: true);
        int gen0After = GC.CollectionCount(0);

        Console.WriteLine($"[{label}] Allocated: {(after - before) / 1024.0:F1} KB, " +
                          $"Gen0 collections: {gen0After - gen0Before}");
    }
}

// Usage
MemoryDiagnostics.MeasureAllocations(() =>
{
    // Version A: many small allocations
    var results = new List<string>();
    for (int i = 0; i < 100_000; i++)
        results.Add($"Item {i}");
}, "String interpolation loop");

MemoryDiagnostics.MeasureAllocations(() =>
{
    // Version B: pooled StringBuilder
    var sb = new StringBuilder();
    var results = new List<string>(100_000);
    for (int i = 0; i < 100_000; i++)
    {
        sb.Clear();
        sb.Append("Item ").Append(i);
        results.Add(sb.ToString());
    }
}, "StringBuilder reuse");
```

## Practical Guidelines

1. **Avoid unnecessary allocations** in hot paths (tight loops, per-request code).
2. **Prefer `Span<T>`** and `Memory<T>` for slicing data without copying.
3. **Use `ArrayPool<T>.Shared`** for temporary byte/char buffers.
4. **Make small, immutable data types structs** to avoid heap allocations.
5. **Pre-size collections** with capacity hints (`new List<T>(expectedCount)`).
6. **Avoid finalizers** unless wrapping unmanaged resources; they delay collection by one GC cycle.
7. **Profile before optimizing**: use `dotnet-counters`, `dotnet-trace`, or Visual Studio Diagnostic Tools to find the real bottleneck.

> **Note:** The .NET GC has two modes: **Workstation** (low-latency, single GC thread) and **Server** (high-throughput, one GC thread per core). ASP.NET Core defaults to Server GC. You can configure this in your `.csproj`:
> ```xml
> <PropertyGroup>
>   <ServerGarbageCollection>true</ServerGarbageCollection>
>   <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
> </PropertyGroup>
> ```

## Summary

Memory management in .NET is largely automatic, but informed developers can dramatically reduce GC pressure and improve performance. Use value types for small data, pool large buffers with `ArrayPool<T>`, profile with built-in diagnostics, and understand the generational model so you can avoid expensive Gen 2 collections. In the next lesson, we will explore unsafe code and pointers for the rare scenarios where you need to bypass the managed memory model entirely.
