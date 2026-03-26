# Unsafe Code and Pointers

C# is a memory-safe language by default, but the `unsafe` keyword unlocks direct pointer manipulation when you need maximum performance or interoperability with native code. This lesson covers when and how to use unsafe code responsibly.

## When Is Unsafe Code Justified?

Unsafe code should be a last resort. Valid use cases include:

- **Native interop (P/Invoke)**: passing pointers to C/C++ libraries.
- **Performance-critical code**: pixel manipulation, binary protocols, cryptography.
- **Custom memory management**: memory-mapped files, shared memory.
- **Porting native algorithms**: translating C code that relies on pointer arithmetic.

> **Warning:** Unsafe code bypasses the CLR's memory safety guarantees. Bugs in unsafe code cause access violations, memory corruption, and security vulnerabilities that the runtime cannot catch.

## Enabling Unsafe Code

You must explicitly opt in at the project level:

```xml
<!-- In your .csproj -->
<PropertyGroup>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
</PropertyGroup>
```

Then mark methods, blocks, or types with the `unsafe` keyword:

```csharp
// Unsafe method
unsafe void ProcessBuffer(byte* data, int length)
{
    for (int i = 0; i < length; i++)
        data[i] = (byte)(data[i] ^ 0xFF); // Invert all bytes
}

// Unsafe block within a safe method
void SafeMethod()
{
    unsafe
    {
        int value = 42;
        int* p = &value;
        Console.WriteLine($"Value at address {(nint)p:X}: {*p}");
    }
}
```

## Pointer Types

| Syntax | Meaning |
|---|---|
| `int*` | Pointer to an `int` |
| `byte*` | Pointer to a `byte` |
| `void*` | Pointer to an unspecified type |
| `int**` | Pointer to a pointer to an `int` |
| `&variable` | Address-of operator |
| `*pointer` | Dereference operator |
| `pointer->member` | Member access through pointer |

```csharp
unsafe
{
    int x = 10;
    int y = 20;

    int* px = &x;
    int* py = &y;

    Console.WriteLine($"x = {*px}, y = {*py}");

    // Swap using pointers
    int temp = *px;
    *px = *py;
    *py = temp;

    Console.WriteLine($"x = {x}, y = {y}"); // x = 20, y = 10
}
```

## The fixed Statement

Managed objects can be moved by the GC at any time. The `fixed` statement **pins** an object so you can safely take a pointer to it.

```csharp
unsafe
{
    byte[] managed = { 1, 2, 3, 4, 5, 6, 7, 8 };

    fixed (byte* ptr = managed)
    {
        // GC will not move 'managed' while inside this block
        for (int i = 0; i < managed.Length; i++)
        {
            Console.Write($"{ptr[i]:X2} ");
        }
    }
    // 'managed' is unpinned here, GC can move it again
}
```

> **Caution:** Pinning objects prevents the GC from compacting memory. Excessive pinning causes heap fragmentation. Pin for the shortest duration possible.

### Pinning Multiple Objects

```csharp
unsafe
{
    byte[] source = GetSourceData();
    byte[] destination = new byte[source.Length];

    fixed (byte* src = source)
    fixed (byte* dst = destination)
    {
        Buffer.MemoryCopy(src, dst, destination.Length, source.Length);
    }
}
```

## stackalloc

Allocates memory on the stack instead of the heap. The memory is automatically freed when the method returns, with zero GC involvement.

```csharp
// Modern syntax: stackalloc to Span<T> (no unsafe required!)
Span<int> numbers = stackalloc int[100];
for (int i = 0; i < numbers.Length; i++)
    numbers[i] = i * i;

// Unsafe pointer version
unsafe
{
    int* buffer = stackalloc int[100];
    for (int i = 0; i < 100; i++)
        buffer[i] = i * i;

    Console.WriteLine($"buffer[50] = {buffer[50]}"); // 2500
}
```

> **Important:** Stack space is limited (~1 MB per thread). Only use `stackalloc` for small, bounded allocations. A `StackOverflowException` is unrecoverable.

## sizeof

Returns the size in bytes of an unmanaged type.

```csharp
unsafe
{
    Console.WriteLine($"int:    {sizeof(int)} bytes");     // 4
    Console.WriteLine($"long:   {sizeof(long)} bytes");    // 8
    Console.WriteLine($"double: {sizeof(double)} bytes");  // 8
    Console.WriteLine($"char:   {sizeof(char)} bytes");    // 2

    Console.WriteLine($"Pixel:  {sizeof(Pixel)} bytes");   // 4
}

[StructLayout(LayoutKind.Sequential, Pack = 1)]
struct Pixel
{
    public byte R, G, B, A;
}
```

## Pointer Arithmetic

Pointer arithmetic in C# works like C: adding 1 to an `int*` advances by `sizeof(int)` bytes.

```csharp
unsafe
{
    int[] data = { 10, 20, 30, 40, 50 };

    fixed (int* start = data)
    {
        int* current = start;
        int* end = start + data.Length;

        while (current < end)
        {
            Console.Write($"{*current} "); // 10 20 30 40 50
            current++;  // Advances by sizeof(int) = 4 bytes
        }
    }
}
```

## Real Example: Fast Image Processing

Processing pixel data directly through pointers avoids bounds checking and array indexing overhead.

```csharp
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct Rgba32
{
    public byte R, G, B, A;
}

public static class FastImageProcessor
{
    /// <summary>
    /// Converts an image to grayscale using luminance weights.
    /// Processes ~4x faster than safe array indexing.
    /// </summary>
    public static unsafe void ToGrayscale(byte[] pixelData, int width, int height)
    {
        int pixelCount = width * height;

        fixed (byte* data = pixelData)
        {
            Rgba32* pixel = (Rgba32*)data;
            Rgba32* end = pixel + pixelCount;

            while (pixel < end)
            {
                // ITU-R BT.709 luminance formula
                byte gray = (byte)(0.2126 * pixel->R + 0.7152 * pixel->G + 0.0722 * pixel->B);
                pixel->R = gray;
                pixel->G = gray;
                pixel->B = gray;
                // pixel->A remains unchanged
                pixel++;
            }
        }
    }

    /// <summary>
    /// Applies a brightness adjustment. Negative values darken, positive brighten.
    /// </summary>
    public static unsafe void AdjustBrightness(byte[] pixelData, int adjustment)
    {
        fixed (byte* data = pixelData)
        {
            byte* current = data;
            byte* end = data + pixelData.Length;

            while (current < end)
            {
                // Process R, G, B (skip A every 4th byte)
                for (int c = 0; c < 3; c++)
                {
                    int newValue = current[c] + adjustment;
                    current[c] = (byte)Math.Clamp(newValue, 0, 255);
                }
                current += 4; // Skip to next pixel (RGBA = 4 bytes)
            }
        }
    }
}
```

## Real Example: Interop with Native Libraries

```csharp
public static class NativeInterop
{
    // Import a C function: void process_data(float* input, float* output, int count);
    [DllImport("native_math.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern unsafe void process_data(float* input, float* output, int count);

    public static unsafe float[] ProcessWithNativeLib(float[] input)
    {
        float[] output = new float[input.Length];

        fixed (float* inputPtr = input)
        fixed (float* outputPtr = output)
        {
            process_data(inputPtr, outputPtr, input.Length);
        }

        return output;
    }

    // Interop with a struct containing a fixed-size buffer
    [StructLayout(LayoutKind.Sequential)]
    public unsafe struct NativeHeader
    {
        public int Version;
        public int DataLength;
        public fixed byte Magic[4]; // Inline fixed-size array
    }

    public static unsafe NativeHeader ReadHeader(ReadOnlySpan<byte> data)
    {
        fixed (byte* ptr = data)
        {
            return *(NativeHeader*)ptr;
        }
    }
}
```

## Real Example: Custom Memory Allocation

```csharp
public unsafe class NativeBuffer : IDisposable
{
    private byte* _ptr;
    private readonly int _length;
    private bool _disposed;

    public NativeBuffer(int length)
    {
        _length = length;
        _ptr = (byte*)NativeMemory.AllocZeroed((nuint)length);
    }

    public Span<byte> AsSpan()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        return new Span<byte>(_ptr, _length);
    }

    public ref byte this[int index]
    {
        get
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if ((uint)index >= (uint)_length)
                throw new IndexOutOfRangeException();
            return ref _ptr[index];
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            NativeMemory.Free(_ptr);
            _ptr = null;
            _disposed = true;
        }
    }
}

// Usage
using var buffer = new NativeBuffer(1024 * 1024); // 1 MB, not on managed heap
var span = buffer.AsSpan();
span.Fill(0xAB);
Console.WriteLine($"First byte: 0x{span[0]:X2}");
```

## Span\<T\> as a Safe Alternative

Before reaching for `unsafe`, consider whether `Span<T>` can solve the problem. It provides pointer-like performance with full bounds checking.

```csharp
// Unsafe version
unsafe void SumUnsafe(int* data, int length, out long result)
{
    result = 0;
    for (int i = 0; i < length; i++)
        result += data[i];
}

// Safe Span version (same performance in practice due to JIT optimizations)
void SumSafe(ReadOnlySpan<int> data, out long result)
{
    result = 0;
    foreach (int value in data)
        result += value;
}

// Reinterpreting memory layout (safe alternative to pointer casting)
byte[] rawBytes = GetRawBytes();
ReadOnlySpan<int> asInts = MemoryMarshal.Cast<byte, int>(rawBytes);
Console.WriteLine($"First int: {asInts[0]}");
```

> **Tip:** The JIT compiler eliminates bounds checks in `Span<T>` when it can prove the access is in range (e.g., in `for` loops bounded by `.Length`). This makes `Span<T>` effectively as fast as raw pointers in most scenarios.

## When to Use Unsafe vs Safe Alternatives

| Need | Safe Alternative | When Unsafe Is Needed |
|---|---|---|
| Slicing arrays without copy | `Span<T>`, `Memory<T>` | Almost never |
| Stack allocation | `stackalloc` + `Span<T>` | Only if Span API is insufficient |
| Reinterpret cast | `MemoryMarshal.Cast<T1,T2>` | Dealing with void pointers |
| Native interop | `SafeHandle`, `Span<T>` marshaling | Complex native structs with pointers |
| High-perf pixel processing | `Span<T>` with `MemoryMarshal` | When profiling proves Span is slower |
| Custom allocator | `NativeMemory` + `Span<T>` | Yes, requires unsafe for raw alloc |

## Unsafe Code Checklist

Before writing unsafe code, verify these points:

1. **Profile first**: Is the safe version actually a measured bottleneck?
2. **Try Span\<T\>**: Can `Span<T>`, `Memory<T>`, or `MemoryMarshal` solve the problem?
3. **Minimize scope**: Keep `unsafe` blocks as small as possible.
4. **Validate inputs**: Perform all bounds checking before entering unsafe code.
5. **Pin briefly**: Use `fixed` for the shortest duration necessary.
6. **Document assumptions**: Explain why unsafe is necessary and what invariants must hold.
7. **Test thoroughly**: Unsafe bugs are silent corruption; add extensive unit tests.

> **Note:** Code marked `unsafe` requires the calling assembly to have full trust. It cannot run in restricted sandboxes, and some environments (like Blazor WebAssembly AOT) may have limitations on unsafe code.

## Summary

Unsafe code and pointers give you the performance characteristics of C within C#, but they trade away the safety net of the managed runtime. Always start with safe abstractions like `Span<T>` and `MemoryMarshal`, profile to identify real bottlenecks, and only then introduce `unsafe` blocks with careful validation and minimal scope. When used responsibly, unsafe code lets you build high-performance systems that rival native code while keeping the rest of your codebase safely managed.
