# Spans and Memory

Working with arrays and strings in C# often involves hidden allocations — substring calls create new strings, array slicing creates new arrays, and parsing routines scatter small objects across the managed heap. **Span\<T\>** and **Memory\<T\>** were introduced to give you a way to work with contiguous regions of memory without allocating new objects for every slice or view.

## Why Spans Matter

Every time you call `string.Substring()` or copy part of an array, the runtime allocates a new object on the heap. In hot paths — parsers, serializers, protocol handlers — these micro-allocations add up fast, causing GC pressure and latency spikes.

Spans let you create *views* into existing memory without copying anything.

## Span\<T\> Basics

A `Span<T>` is a ref struct that represents a contiguous region of arbitrary memory. It can point to managed arrays, native memory, or stack-allocated memory.

```csharp
int[] numbers = { 10, 20, 30, 40, 50, 60, 70, 80 };

// Create a span over the entire array
Span<int> allNumbers = numbers.AsSpan();

// Slice without allocation — just a view into the same array
Span<int> middle = allNumbers.Slice(2, 4); // [30, 40, 50, 60]

// Modify through the span — changes the original array
middle[0] = 999;
Console.WriteLine(numbers[2]); // 999
```

> **Important:** `Span<T>` is a `ref struct`, which means it can only live on the stack. You cannot store it in a field of a class, box it, or use it in async methods. This constraint is what makes it so fast.

## ReadOnlySpan\<T\>

When you don't need to modify the underlying data, use `ReadOnlySpan<T>`. Strings implicitly convert to `ReadOnlySpan<char>`.

```csharp
string message = "Hello, World!";

// No allocation — just a view into the string's internal buffer
ReadOnlySpan<char> hello = message.AsSpan(0, 5);
ReadOnlySpan<char> world = message.AsSpan(7, 5);

Console.WriteLine(hello.ToString()); // "Hello"
Console.WriteLine(world.ToString()); // "World"
```

## stackalloc with Spans

You can allocate small buffers on the stack and wrap them in a `Span<T>`, avoiding the heap entirely.

```csharp
public static int SumSmallBuffer(ReadOnlySpan<int> input)
{
    // Allocate a working buffer on the stack — zero GC pressure
    Span<int> buffer = stackalloc int[64];

    int count = Math.Min(input.Length, buffer.Length);
    input[..count].CopyTo(buffer);

    int sum = 0;
    for (int i = 0; i < count; i++)
        sum += buffer[i];

    return sum;
}
```

> **Warning:** Only use `stackalloc` for small, bounded sizes. Stack space is limited (usually 1 MB per thread). Allocating too much will cause a `StackOverflowException`.

## Before and After: Parsing Without Allocations

### Before — Allocation-Heavy Parsing

```csharp
// Every Split and Substring allocates new string objects
public static List<(string Name, int Age)> ParseCsvClassic(string csv)
{
    var results = new List<(string, int)>();
    string[] lines = csv.Split('\n');          // allocates array + strings

    foreach (string line in lines)
    {
        if (string.IsNullOrWhiteSpace(line)) continue;
        string[] parts = line.Split(',');      // allocates again
        string name = parts[0].Trim();         // allocates trimmed string
        int age = int.Parse(parts[1].Trim());  // allocates trimmed string
        results.Add((name, age));
    }

    return results;
}
```

### After — Span-Based Zero-Allocation Parsing

```csharp
public static List<(string Name, int Age)> ParseCsvSpan(ReadOnlySpan<char> csv)
{
    var results = new List<(string, int)>();

    while (!csv.IsEmpty)
    {
        // Find the next line
        int newlineIndex = csv.IndexOf('\n');
        ReadOnlySpan<char> line;

        if (newlineIndex >= 0)
        {
            line = csv[..newlineIndex].Trim();
            csv = csv[(newlineIndex + 1)..];
        }
        else
        {
            line = csv.Trim();
            csv = ReadOnlySpan<char>.Empty;
        }

        if (line.IsEmpty) continue;

        // Find the comma separator
        int commaIndex = line.IndexOf(',');
        if (commaIndex < 0) continue;

        ReadOnlySpan<char> nameSpan = line[..commaIndex].Trim();
        ReadOnlySpan<char> ageSpan = line[(commaIndex + 1)..].Trim();

        // Only allocate strings at the very end
        string name = nameSpan.ToString();
        int age = int.Parse(ageSpan);

        results.Add((name, age));
    }

    return results;
}
```

> **Tip:** `int.Parse`, `double.Parse`, and many other BCL methods have overloads accepting `ReadOnlySpan<char>`, so you can parse numbers without ever allocating an intermediate string.

## Processing Binary Protocols

Spans are ideal for reading structured binary data.

```csharp
public readonly struct PacketHeader
{
    public byte Version { get; }
    public ushort Length { get; }
    public uint SequenceNumber { get; }

    public PacketHeader(byte version, ushort length, uint sequenceNumber)
    {
        Version = version;
        Length = length;
        SequenceNumber = sequenceNumber;
    }

    public static PacketHeader Parse(ReadOnlySpan<byte> data)
    {
        if (data.Length < 7)
            throw new ArgumentException("Buffer too small for packet header.");

        byte version = data[0];
        ushort length = BitConverter.ToUInt16(data[1..3]);
        uint seqNum = BitConverter.ToUInt32(data[3..7]);

        return new PacketHeader(version, length, seqNum);
    }
}

// Usage
byte[] rawData = GetNetworkBytes();
var header = PacketHeader.Parse(rawData.AsSpan());
ReadOnlySpan<byte> payload = rawData.AsSpan(7, header.Length);
```

## Memory\<T\> and ReadOnlyMemory\<T\>

Because `Span<T>` is a ref struct, you cannot use it in async methods, store it in collections, or put it on the heap. `Memory<T>` solves this — it is a regular struct that wraps the same underlying data and can produce a `Span<T>` on demand.

```csharp
public static async Task ProcessDataAsync(Memory<byte> data)
{
    // Cannot use Span<T> across an await boundary,
    // but Memory<T> works fine as a parameter.

    // When you need a Span, get it within a synchronous block
    int header = ParseHeader(data.Span[..4]);

    await Task.Delay(100); // simulate async I/O

    // After the await, get the span again
    ProcessPayload(data[4..].Span);
}

private static int ParseHeader(ReadOnlySpan<byte> header)
    => BitConverter.ToInt32(header);

private static void ProcessPayload(ReadOnlySpan<byte> payload)
{
    // process payload bytes...
}
```

> **Note:** `Memory<T>.Span` returns a new `Span<T>` each time. The span must be used and discarded before the next `await`. Never store the span across an await boundary.

## Comparison Table

| Feature | `T[]` (Array) | `ArraySegment<T>` | `Span<T>` | `Memory<T>` |
|---|---|---|---|---|
| **Heap allocated** | Yes | Wraps array | No (stack only) | Wraps array |
| **Slicing allocates** | Yes (new array) | No | No | No |
| **Usable in async** | Yes | Yes | No | Yes |
| **Storable in fields** | Yes | Yes | No (ref struct) | Yes |
| **Points to stack mem** | No | No | Yes | No |
| **Points to native mem** | No | No | Yes | No |
| **Performance** | Baseline | Same as array | Best | Near-best |
| **Introduced in** | C# 1.0 | .NET 2.0 | C# 7.2 / .NET Core 2.1 | .NET Core 2.1 |

## Span-Based String Operations

.NET provides span-friendly alternatives to common string operations.

```csharp
public static bool ContainsHeaderValue(
    ReadOnlySpan<char> httpHeader,
    ReadOnlySpan<char> targetKey)
{
    // Find the colon separating key from value
    int colonIndex = httpHeader.IndexOf(':');
    if (colonIndex < 0) return false;

    ReadOnlySpan<char> key = httpHeader[..colonIndex].Trim();

    return key.Equals(targetKey, StringComparison.OrdinalIgnoreCase);
}

// Usage — no allocations
string header = "Content-Type: application/json";
bool isContentType = ContainsHeaderValue(header, "Content-Type"); // true
```

## Span with LINQ-style Operations

Spans don't work with LINQ, but you can write efficient loops.

```csharp
public static int CountOccurrences(ReadOnlySpan<char> text, char target)
{
    int count = 0;
    foreach (char c in text)
    {
        if (c == target)
            count++;
    }
    return count;
}

public static int Sum(ReadOnlySpan<int> values)
{
    int total = 0;
    foreach (int v in values)
        total += v;
    return total;
}
```

## When to Use What

- **Use `Span<T>`** in synchronous, CPU-bound hot paths where you need zero-allocation slicing.
- **Use `ReadOnlySpan<T>`** when you only need to read the data, especially for string parsing.
- **Use `Memory<T>`** when you need to pass slices across async boundaries or store them in collections.
- **Use plain arrays** when the data needs to live on the heap and you don't have performance concerns.
- **Use `stackalloc` + `Span<T>`** for small temporary buffers in tight loops.

> **Caution:** Do not over-optimize. Spans add complexity. Profile your code first and apply span-based techniques where allocations are actually a bottleneck.

## Key Takeaways

1. `Span<T>` provides zero-allocation views over contiguous memory — arrays, strings, stack, or native buffers.
2. `ReadOnlySpan<T>` is the read-only counterpart and works naturally with strings.
3. `Memory<T>` bridges the gap when you need span-like slicing in async or heap-stored contexts.
4. `stackalloc` combined with `Span<T>` lets you avoid the heap entirely for small buffers.
5. Many BCL methods now accept spans, enabling end-to-end allocation-free parsing pipelines.
