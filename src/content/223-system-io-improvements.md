# System.IO Improvements

*Chapter 14.4 — System.IO Improvements*

## Overview

Data Engineers spend a disproportionate amount of time reading and writing files — CSV
exports from Sage, JSON responses from APIs, Parquet files for analytics, and flat files
from legacy systems. The `System.IO` namespace has received significant improvements
across .NET 8 through .NET 10 that directly benefit these workloads.

This lesson covers:

- **`RandomAccess`** — High-performance file I/O without `FileStream` overhead.
- **`IAsyncEnumerable` file reading** — Streaming line-by-line without loading into memory.
- **UTF-8 improvements** — `Utf8JsonReader`, UTF-8 string literals, avoiding transcoding.
- **`System.IO.Pipelines`** — The high-throughput I/O model from ASP.NET Core, available
  for your data pipelines.
- **New file APIs** — `File.ReadLinesAsync`, `Path` improvements, and more.

The theme is the same across all of these: **stream data instead of buffering it**, and
**use UTF-8 natively instead of transcoding**.

## Core Concepts

### The Problem with Traditional File I/O

```csharp
// This loads the ENTIRE file into memory — 2 GB file = 2 GB RAM
string[] lines = File.ReadAllLines("budget_export.csv");

// This is better but still allocates a string per line
foreach (var line in File.ReadLines("budget_export.csv"))
{
    // Each line is a new string allocation
    Process(line);
}
```

For a 2 GB CSV file with 10 million lines, `ReadAllLines` uses ~4 GB (UTF-16 encoding
doubles the size). Even `ReadLines` allocates 10 million string objects.

### RandomAccess Class

`RandomAccess` provides static methods for scatter/gather I/O at specific file offsets,
bypassing `FileStream`'s internal buffer and position tracking:

```csharp
using System.IO;
using Microsoft.Win32.SafeHandles;

// Open a file handle directly
using SafeFileHandle handle = File.OpenHandle(
    "large_dataset.bin",
    FileMode.Open,
    FileAccess.Read,
    FileShare.Read,
    FileOptions.Asynchronous | FileOptions.SequentialScan
);

// Read at a specific offset — no seeking, no internal buffer
byte[] buffer = new byte[4096];
long offset = 1024 * 1024; // Start at 1 MB
int bytesRead = RandomAccess.Read(handle, buffer, offset);

// Scatter read — read into multiple buffers in one syscall
Memory<byte> header = new byte[128];
Memory<byte> payload = new byte[4096];
long totalRead = RandomAccess.Read(handle, new[] { header, payload }, fileOffset: 0);
```

### IAsyncEnumerable for File Reading

Streaming files line-by-line with `await foreach`:

```csharp
// Built-in: File.ReadLinesAsync returns IAsyncEnumerable<string>
await foreach (var line in File.ReadLinesAsync("budget_export.csv"))
{
    // Each line is yielded one at a time — constant memory usage
    var parts = line.Split(',');
    await ProcessRowAsync(parts);
}
```

### UTF-8 Everywhere

.NET strings are UTF-16 internally, but files, APIs, and databases use UTF-8. Every
conversion costs CPU time and memory:

```
File (UTF-8) --> StreamReader --> string (UTF-16) --> Encoding.UTF8 --> byte[] (UTF-8) --> Network
```

Modern .NET lets you stay in UTF-8:

```csharp
// UTF-8 string literals (C# 11+)
ReadOnlySpan<byte> header = "ProjectId,CostCode,Amount\n"u8;

// Write UTF-8 directly to a stream — no transcoding
await using var stream = File.Create("output.csv");
await stream.WriteAsync(header.ToArray());
```

### System.IO.Pipelines

Pipelines provide a producer/consumer model for I/O with built-in backpressure and
buffer management. Originally built for Kestrel's HTTP performance, they work great
for parsing large data files:

```
Producer (reads from file) --> Pipe --> Consumer (parses data)
     Writes to PipeWriter      |      Reads from PipeReader
                                |
                          Backpressure
```

## Code Examples

### Streaming CSV Parser with IAsyncEnumerable

```csharp
using System.Runtime.CompilerServices;

public static class CsvStreamReader
{
    /// <summary>
    /// Reads a CSV file and yields typed records one at a time.
    /// Memory usage is constant regardless of file size.
    /// </summary>
    public static async IAsyncEnumerable<BudgetRecord> ReadBudgetFileAsync(
        string filePath,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await using var stream = new FileStream(
            filePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 65536,  // 64 KB read buffer
            FileOptions.Asynchronous | FileOptions.SequentialScan
        );

        using var reader = new StreamReader(stream, leaveOpen: true);

        // Skip header
        await reader.ReadLineAsync(ct);

        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            var parts = line.Split(',');
            if (parts.Length < 4) continue;

            yield return new BudgetRecord(
                ProjectId: parts[0].Trim(),
                CostCode: parts[1].Trim(),
                Amount: decimal.TryParse(parts[2], out var amt) ? amt : 0m,
                Date: DateOnly.TryParse(parts[3], out var dt) ? dt : DateOnly.MinValue
            );
        }
    }
}

public record BudgetRecord(string ProjectId, string CostCode, decimal Amount, DateOnly Date);

// Usage — process millions of rows with constant memory
await foreach (var record in CsvStreamReader.ReadBudgetFileAsync("budget_2026.csv", ct))
{
    if (record.Amount > 100_000m)
    {
        await InsertToAzureSqlAsync(record, ct);
    }
}
```

### High-Performance File Copy with RandomAccess

```csharp
public static async Task CopyFileOptimizedAsync(
    string source,
    string destination,
    CancellationToken ct = default)
{
    const int bufferSize = 1024 * 1024; // 1 MB chunks

    using var sourceHandle = File.OpenHandle(
        source, FileMode.Open, FileAccess.Read, FileShare.Read,
        FileOptions.Asynchronous | FileOptions.SequentialScan);

    using var destHandle = File.OpenHandle(
        destination, FileMode.Create, FileAccess.Write, FileShare.None,
        FileOptions.Asynchronous);

    long fileLength = RandomAccess.GetLength(sourceHandle);
    byte[] buffer = new byte[bufferSize];
    long offset = 0;

    while (offset < fileLength)
    {
        ct.ThrowIfCancellationRequested();

        int bytesRead = await RandomAccess.ReadAsync(
            sourceHandle, buffer, offset, ct);

        if (bytesRead == 0) break;

        await RandomAccess.WriteAsync(
            destHandle, buffer.AsMemory(0, bytesRead), offset, ct);

        offset += bytesRead;
    }
}
```

### System.IO.Pipelines for Parsing Large Files

```csharp
using System.Buffers;
using System.IO.Pipelines;
using System.Text;

public class PipelineCsvParser
{
    public async Task<int> CountHighValueRows(string filePath, decimal threshold)
    {
        await using var stream = File.OpenRead(filePath);
        var reader = PipeReader.Create(stream, new StreamPipeReaderOptions(
            bufferSize: 65536,
            minimumReadSize: 4096
        ));

        int count = 0;
        bool headerSkipped = false;

        while (true)
        {
            ReadResult result = await reader.ReadAsync();
            ReadOnlySequence<byte> buffer = result.Buffer;

            while (TryReadLine(ref buffer, out ReadOnlySequence<byte> line))
            {
                if (!headerSkipped)
                {
                    headerSkipped = true;
                    continue;
                }

                if (ParseAndCheck(line, threshold))
                    count++;
            }

            reader.AdvanceTo(buffer.Start, buffer.End);

            if (result.IsCompleted)
                break;
        }

        await reader.CompleteAsync();
        return count;
    }

    private static bool TryReadLine(
        ref ReadOnlySequence<byte> buffer,
        out ReadOnlySequence<byte> line)
    {
        var position = buffer.PositionOf((byte)'\n');
        if (position == null)
        {
            line = default;
            return false;
        }

        line = buffer.Slice(0, position.Value);
        buffer = buffer.Slice(buffer.GetPosition(1, position.Value));
        return true;
    }

    private static bool ParseAndCheck(ReadOnlySequence<byte> line, decimal threshold)
    {
        // Work with UTF-8 bytes directly — no string allocation
        Span<byte> lineSpan = stackalloc byte[(int)line.Length];
        line.CopyTo(lineSpan);

        // Find the third comma (amount field)
        int commaCount = 0;
        int start = 0;
        int end = 0;

        for (int i = 0; i < lineSpan.Length; i++)
        {
            if (lineSpan[i] == (byte)',')
            {
                commaCount++;
                if (commaCount == 2) start = i + 1;
                if (commaCount == 3) { end = i; break; }
            }
        }

        if (end <= start) return false;

        Span<char> amountChars = stackalloc char[end - start];
        Encoding.UTF8.GetChars(lineSpan[start..end], amountChars);

        return decimal.TryParse(amountChars, out var amount) && amount > threshold;
    }
}
```

### Buffered Writing with ArrayPool

```csharp
public class CsvBatchWriter : IAsyncDisposable
{
    private readonly StreamWriter _writer;
    private readonly StringBuilder _buffer;
    private readonly int _flushThreshold;
    private int _rowCount;

    public CsvBatchWriter(string filePath, int flushThreshold = 10_000)
    {
        _writer = new StreamWriter(filePath, append: false, Encoding.UTF8, bufferSize: 65536);
        _buffer = new StringBuilder(flushThreshold * 100); // estimate 100 chars per row
        _flushThreshold = flushThreshold;
    }

    public async Task WriteHeaderAsync(params ReadOnlySpan<string> columns)
    {
        _buffer.AppendJoin(',', columns.ToArray());
        _buffer.AppendLine();
        await FlushBufferAsync();
    }

    public async Task WriteRowAsync(string projectId, string costCode, decimal amount)
    {
        _buffer.Append(projectId);
        _buffer.Append(',');
        _buffer.Append(costCode);
        _buffer.Append(',');
        _buffer.Append(amount);
        _buffer.AppendLine();

        _rowCount++;
        if (_rowCount >= _flushThreshold)
        {
            await FlushBufferAsync();
            _rowCount = 0;
        }
    }

    private async Task FlushBufferAsync()
    {
        if (_buffer.Length == 0) return;
        await _writer.WriteAsync(_buffer);
        _buffer.Clear();
    }

    public async ValueTask DisposeAsync()
    {
        await FlushBufferAsync();
        await _writer.DisposeAsync();
    }
}

// Usage
await using var writer = new CsvBatchWriter("output.csv");
await writer.WriteHeaderAsync("ProjectId", "CostCode", "Amount");

await foreach (var row in GetRowsAsync())
{
    await writer.WriteRowAsync(row.ProjectId, row.CostCode, row.Amount);
}
```

## Common Patterns

### File I/O Decision Tree

```
Is the file < 10 MB?
├── Yes → File.ReadAllText / File.ReadAllLines (simple, fine for small files)
└── No → Is it line-oriented (CSV, log)?
    ├── Yes → File.ReadLinesAsync / IAsyncEnumerable
    └── No → Is it binary or needs random access?
        ├── Yes → RandomAccess with SafeFileHandle
        └── No → System.IO.Pipelines for maximum throughput
```

### FileOptions Matter

```csharp
// Sequential read (most data pipelines) — OS pre-fetches ahead
FileOptions.SequentialScan | FileOptions.Asynchronous

// Random access (seeking to specific records)
FileOptions.RandomAccess | FileOptions.Asynchronous

// Write-through (critical data — no OS cache)
FileOptions.WriteThrough

// Temporary file (OS may keep in memory)
FileOptions.DeleteOnClose
```

### Choosing Buffer Sizes

| Scenario | Buffer Size | Why |
|----------|------------|-----|
| Small config files | 4 KB (default) | Not worth tuning |
| CSV line reading | 64 KB | Covers most lines with room to spare |
| Binary file copy | 1 MB | Balances syscall overhead vs memory |
| Network stream | 8-16 KB | Matches typical TCP segment sizes |
| Pipelines parsing | 64 KB pipe buffer | Backpressure handles the rest |

## Gotchas and Pitfalls

1. **`File.ReadAllText` on large files** — Allocates the entire file as a UTF-16 string.
   A 1 GB UTF-8 file becomes ~2 GB in memory. Use streaming instead.

2. **`StreamReader` default encoding** — `StreamReader` defaults to UTF-8, but legacy files
   from construction ERPs may be Windows-1252 or ASCII. Specify encoding explicitly:

```csharp
using var reader = new StreamReader(path, Encoding.GetEncoding("windows-1252"));
```

3. **Forgetting `FileOptions.Asynchronous`** — Without this flag, async methods on
   `FileStream` fake async by wrapping synchronous calls in `Task.Run`. This wastes a
   ThreadPool thread. Always pass the flag.

4. **Not disposing file handles** — `SafeFileHandle` from `File.OpenHandle` must be
   disposed. Use `using` statements.

5. **Cross-platform path separators** — Use `Path.Combine` instead of string concatenation:

```csharp
// Bad — breaks on Linux
string path = "data\\" + "budgets\\" + "2026.csv";

// Good — works everywhere
string path = Path.Combine("data", "budgets", "2026.csv");
```

6. **BOM (Byte Order Mark)** — Some tools write a UTF-8 BOM (EF BB BF) at the start of
   CSV files. `StreamReader` strips it automatically, but `PipeReader` does not. If your
   first field looks wrong, check for BOM bytes.

7. **File locking on Windows** — `FileShare.Read` allows other processes to read. If your
   pipeline reads a file that another process (like Sage) might be writing, use
   `FileShare.ReadWrite` and handle incomplete reads.

## Performance Considerations

### Benchmark: Reading a 500 MB CSV (Approximate)

| Method | Time | Peak Memory | Allocations |
|--------|------|-------------|-------------|
| `File.ReadAllLines` | 3.2s | 1.8 GB | 10M strings |
| `File.ReadLines` (sync) | 2.8s | 50 MB | 10M strings |
| `File.ReadLinesAsync` | 2.9s | 50 MB | 10M strings |
| `StreamReader` + `ReadLineAsync` | 2.7s | 50 MB | 10M strings |
| `PipeReader` (UTF-8 native) | 1.1s | 5 MB | ~0 (stack) |
| `RandomAccess` (parallel chunks) | 0.8s | 20 MB | Minimal |

The gap between "simple but allocating" and "Pipelines/RandomAccess" is 2-4x. For a
nightly pipeline that processes hundreds of files, this adds up.

### Disk I/O is Usually the Bottleneck

```
SSD sequential read:  ~3 GB/s
HDD sequential read:  ~150 MB/s
Azure Blob download:  ~100-500 MB/s (depends on tier)
Network (1 Gbps):     ~125 MB/s

C# string parsing:    ~1-2 GB/s (CPU-bound)
```

If your data comes from Azure Blob Storage, the network transfer is likely slower than
your parsing code. Optimize the parsing only after you have maximized download throughput
(parallel downloads, larger block sizes).

## BNBuilders Context

### Common File Types at a Construction Company

| File | Source | Format | Size | Approach |
|------|--------|--------|------|----------|
| Budget export | Sage 300 | CSV (Windows-1252) | 10-500 MB | `File.ReadLinesAsync` + encoding |
| Daily logs | Procore API | JSON | 1-50 MB | `System.Text.Json` streaming |
| Plan documents | Bluebeam | PDF | 50-500 MB | Binary, `RandomAccess` |
| Submittals | Procore | Mixed | Varies | Store in Blob, metadata in SQL |
| Payroll data | Viewpoint | Fixed-width | 5-20 MB | `PipeReader` for fixed-width parsing |
| RFI attachments | Email | Various | < 10 MB | `File.ReadAllBytes` is fine |

### Example: Reading a Sage Export with Legacy Encoding

```csharp
public static async IAsyncEnumerable<SageBudgetLine> ReadSageExportAsync(
    string filePath,
    [EnumeratorCancellation] CancellationToken ct = default)
{
    // Sage 300 exports in Windows-1252 encoding with BOM
    Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    var encoding = Encoding.GetEncoding("windows-1252");

    await using var stream = new FileStream(
        filePath, FileMode.Open, FileAccess.Read, FileShare.Read,
        bufferSize: 65536, FileOptions.SequentialScan | FileOptions.Asynchronous);

    using var reader = new StreamReader(stream, encoding);

    // Sage exports have a 3-line header
    for (int i = 0; i < 3; i++)
        await reader.ReadLineAsync(ct);

    while (await reader.ReadLineAsync(ct) is { } line)
    {
        if (line.Length < 10) continue; // skip blank lines

        // Sage uses tab-separated values
        var fields = line.Split('\t');
        if (fields.Length < 8) continue;

        yield return new SageBudgetLine(
            Project: fields[0].Trim(),
            CostCode: fields[1].Trim(),
            Phase: fields[2].Trim(),
            Description: fields[3].Trim(),
            OriginalBudget: ParseDecimal(fields[4]),
            RevisedBudget: ParseDecimal(fields[5]),
            Committed: ParseDecimal(fields[6]),
            ActualToDate: ParseDecimal(fields[7])
        );
    }
}

private static decimal ParseDecimal(string value)
{
    // Sage formats: "1,234.56" or "(1,234.56)" for negative
    var cleaned = value.Trim().Replace(",", "");
    if (cleaned.StartsWith('(') && cleaned.EndsWith(')'))
    {
        cleaned = "-" + cleaned[1..^1];
    }
    return decimal.TryParse(cleaned, out var result) ? result : 0m;
}

public record SageBudgetLine(
    string Project, string CostCode, string Phase, string Description,
    decimal OriginalBudget, decimal RevisedBudget, decimal Committed, decimal ActualToDate);
```

## Interview / Senior Dev Questions

1. **Q: When would you use `System.IO.Pipelines` over `StreamReader`?**
   A: When you need maximum throughput and minimal allocations — typically for files over
   100 MB with a known binary or text format. Pipelines let you work with raw UTF-8 bytes,
   avoid per-line string allocations, and provide backpressure between reading and parsing.
   For simple CSV files under 50 MB, `StreamReader` with `ReadLineAsync` is simpler and
   sufficient.

2. **Q: What is the `RandomAccess` class and when is it useful?**
   A: `RandomAccess` provides static methods for reading/writing at specific file offsets
   using a `SafeFileHandle`. It is useful when you need to: (a) read specific portions of
   a large file without seeking, (b) do scatter/gather I/O, or (c) read from multiple
   positions in parallel (each call is independent).

3. **Q: Why does a 1 GB UTF-8 file use ~2 GB of memory when loaded as a .NET string?**
   A: .NET strings are stored as UTF-16, which uses 2 bytes per ASCII character (vs 1 byte
   in UTF-8). So a file that is mostly ASCII roughly doubles in size when loaded into a
   `string`. This is why modern APIs emphasize working with `byte[]` / `Span<byte>` in
   UTF-8 to avoid transcoding.

4. **Q: How does `FileOptions.SequentialScan` improve performance?**
   A: It hints to the OS that the file will be read sequentially, enabling aggressive
   read-ahead prefetching. The OS loads subsequent disk pages into cache before you request
   them, reducing wait time on I/O. This is the right choice for data pipeline files that
   are read start-to-finish.

## Quiz

**Question 1:** What happens when you call `File.ReadAllLines` on a 2 GB file?

a) It streams the file efficiently, yielding one line at a time
b) It loads the entire file into memory, potentially causing an `OutOfMemoryException`
c) It throws an `IOException` because the file is too large
d) It reads the first 1000 lines and stops

<details>
<summary>Answer</summary>

**b) It loads the entire file into memory.** `File.ReadAllLines` reads the entire file
and returns a `string[]`. A 2 GB UTF-8 file becomes ~4 GB in memory (UTF-16 encoding),
which can cause `OutOfMemoryException`. Use `File.ReadLinesAsync` or `PipeReader` instead.

</details>

**Question 2:** What is the primary advantage of `System.IO.Pipelines` over `StreamReader`?

a) It supports more file formats
b) It works with raw bytes (UTF-8), avoiding string allocations and transcoding
c) It compresses files automatically
d) It is simpler to use

<details>
<summary>Answer</summary>

**b) It works with raw bytes, avoiding string allocations and transcoding.** Pipelines let
you parse UTF-8 bytes directly from the I/O buffer without creating `string` objects. This
eliminates millions of allocations for large files and avoids UTF-8 to UTF-16 conversion.

</details>

**Question 3:** Which `FileOptions` flag should you use for a data pipeline reading a CSV
file from start to finish?

a) `FileOptions.RandomAccess`
b) `FileOptions.WriteThrough`
c) `FileOptions.SequentialScan | FileOptions.Asynchronous`
d) `FileOptions.DeleteOnClose`

<details>
<summary>Answer</summary>

**c) `FileOptions.SequentialScan | FileOptions.Asynchronous`.** `SequentialScan` tells the
OS to prefetch data since you are reading linearly. `Asynchronous` enables true async I/O
instead of wrapping synchronous calls in `Task.Run`.

</details>

**Question 4:** A legacy ERP exports CSV files in Windows-1252 encoding. What must you do
before reading it with `StreamReader`?

a) Nothing — `StreamReader` auto-detects all encodings
b) Register `CodePagesEncodingProvider` and specify the encoding explicitly
c) Convert the file to UTF-8 first using a shell command
d) Use `File.ReadAllBytes` and decode manually

<details>
<summary>Answer</summary>

**b) Register `CodePagesEncodingProvider` and specify the encoding.** .NET Core and later
do not include legacy code page encodings by default. Call
`Encoding.RegisterProvider(CodePagesEncodingProvider.Instance)` first, then pass
`Encoding.GetEncoding("windows-1252")` to the `StreamReader` constructor.

</details>
