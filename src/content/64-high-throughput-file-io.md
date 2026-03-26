# High-Throughput File I/O

When your input file is 1 GB, any approach works. When it is 10 GB or 100 GB, the choice of I/O
strategy determines whether your program finishes in minutes or hours — or runs out of memory
entirely.

---

## Reading Strategies Compared

| Method | Memory Usage | Speed | Async | Best For |
|---|---|---|---|---|
| `File.ReadAllText` | Entire file in RAM | Slow for large files | Yes | Small files (< 100 MB) |
| `File.ReadAllLines` | Entire file in RAM | Slow for large files | Yes | Small files needing line access |
| `File.ReadLines` | One line at a time | Good | No (sync only) | Medium files, simple parsing |
| `StreamReader` | Buffered (4 KB default) | Good | Yes | General purpose |
| `System.IO.Pipelines` | Pool-rented buffers | Excellent | Yes | High-throughput, low-allocation |
| `MemoryMappedFile` | OS page cache | Excellent | No | Random access, shared memory |

---

## StreamReader: The Baseline

```csharp
public static async IAsyncEnumerable<string> ReadLinesAsync(
    string path,
    [EnumeratorCancellation] CancellationToken ct = default)
{
    using var reader = new StreamReader(path, bufferSize: 65_536);

    while (await reader.ReadLineAsync(ct) is { } line)
    {
        yield return line;
    }
}
```

> **Tip:** The default `StreamReader` buffer is 1,024 bytes. For large files, increase it to
> 64 KB or higher. This reduces the number of OS read calls significantly.

---

## FileOptions for Performance

```csharp
var stream = new FileStream(
    path,
    FileMode.Open,
    FileAccess.Read,
    FileShare.Read,
    bufferSize: 65_536,
    options: FileOptions.SequentialScan | FileOptions.Asynchronous);

using var reader = new StreamReader(stream);
```

| Option | Effect |
|---|---|
| `FileOptions.SequentialScan` | Hints the OS to use read-ahead buffering |
| `FileOptions.Asynchronous` | Enables true async I/O (not thread pool simulation) |
| `FileOptions.RandomAccess` | Disables read-ahead; use with memory-mapped files |

> **Important:** `FileOptions.Asynchronous` must be set when using `ReadAsync` / `WriteAsync`.
> Without it, the runtime simulates async by blocking a thread pool thread.

---

## System.IO.Pipelines: Maximum Throughput

`System.IO.Pipelines` is the I/O framework used internally by ASP.NET Core's Kestrel server.
It provides zero-copy, pooled-buffer I/O.

```csharp
using System.Buffers;
using System.IO.Pipelines;
using System.Text;

public static async Task ProcessWithPipelinesAsync(string path, CancellationToken ct)
{
    await using var stream = new FileStream(
        path, FileMode.Open, FileAccess.Read, FileShare.Read,
        bufferSize: 0, // Pipelines manages its own buffering
        FileOptions.SequentialScan | FileOptions.Asynchronous);

    var pipeReader = PipeReader.Create(stream, new StreamPipeReaderOptions(
        bufferSize: 65_536,
        minimumReadSize: 32_768));

    long lineCount = 0;

    while (true)
    {
        ReadResult result = await pipeReader.ReadAsync(ct);
        ReadOnlySequence<byte> buffer = result.Buffer;

        while (TryReadLine(ref buffer, out ReadOnlySequence<byte> line))
        {
            ProcessLine(line);
            lineCount++;
        }

        pipeReader.AdvanceTo(buffer.Start, buffer.End);

        if (result.IsCompleted)
            break;
    }

    await pipeReader.CompleteAsync();
    Console.WriteLine($"Processed {lineCount:N0} lines.");
}

private static bool TryReadLine(
    ref ReadOnlySequence<byte> buffer,
    out ReadOnlySequence<byte> line)
{
    var reader = new SequenceReader<byte>(buffer);

    if (reader.TryReadTo(out ReadOnlySequence<byte> slice, (byte)'\n'))
    {
        line = slice;
        buffer = buffer.Slice(reader.Position);
        return true;
    }

    line = default;
    return false;
}

private static void ProcessLine(ReadOnlySequence<byte> line)
{
    // Work with raw bytes — avoid string allocation for maximum performance
    Span<char> chars = stackalloc char[(int)line.Length];
    Encoding.UTF8.GetChars(line.FirstSpan, chars);
    // Parse chars...
}
```

### ReadOnlySequence Explained

`ReadOnlySequence<T>` represents a potentially discontiguous region of memory — data might span
multiple buffer segments. Use `SequenceReader<T>` to iterate through it efficiently:

```csharp
var seqReader = new SequenceReader<byte>(buffer);

// Read a known number of bytes
if (seqReader.TryReadExact(4, out ReadOnlySequence<byte> header))
{
    int length = BitConverter.ToInt32(header.FirstSpan);
}

// Advance past delimiters
seqReader.AdvancePast((byte)',');
```

> **Note:** The key advantage of Pipelines is that buffers are rented from `ArrayPool<byte>` and
> reused. For a 10 GB file, your peak memory usage might be only a few hundred KB.

---

## Processing Files Larger Than RAM

### Strategy 1: Streaming Line-by-Line

Never load the whole file. Use `StreamReader` or Pipelines to process one line (or chunk) at a
time:

```csharp
long errorCount = 0;
long totalLines = 0;

await foreach (var line in ReadLinesAsync("/data/massive.log"))
{
    totalLines++;
    if (line.Contains("ERROR"))
        errorCount++;
}

Console.WriteLine($"{errorCount} errors in {totalLines:N0} lines.");
```

### Strategy 2: Chunked Parallel Processing

Split the file into chunks and process them in parallel:

```csharp
public static async Task ProcessInChunksAsync(string path, int chunkCount, CancellationToken ct)
{
    var fileInfo = new FileInfo(path);
    long chunkSize = fileInfo.Length / chunkCount;

    var tasks = Enumerable.Range(0, chunkCount).Select(i =>
    {
        long start = i * chunkSize;
        long end = (i == chunkCount - 1) ? fileInfo.Length : (i + 1) * chunkSize;
        return ProcessChunkAsync(path, start, end, ct);
    });

    await Task.WhenAll(tasks);
}

private static async Task ProcessChunkAsync(
    string path, long start, long end, CancellationToken ct)
{
    await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read,
        FileShare.Read, 65_536, FileOptions.Asynchronous);

    stream.Seek(start, SeekOrigin.Begin);
    using var reader = new StreamReader(stream);

    // If we started mid-line, skip to the next full line
    if (start > 0)
        await reader.ReadLineAsync(ct);

    while (stream.Position < end)
    {
        var line = await reader.ReadLineAsync(ct);
        if (line is null) break;
        // Process line...
    }
}
```

> **Warning:** Chunked parallel processing assumes the file has line-delimited records. It does
> not work for formats like JSON or XML where records span multiple lines.

---

## Memory-Mapped Files

Memory-mapped files let the OS manage caching. The file is mapped into virtual memory and pages
are loaded on demand:

```csharp
using System.IO.MemoryMappedFiles;

public static void SearchWithMemoryMap(string path, string searchTerm)
{
    var fileInfo = new FileInfo(path);

    using var mmf = MemoryMappedFile.CreateFromFile(path, FileMode.Open);
    using var accessor = mmf.CreateViewAccessor(0, fileInfo.Length, MemoryMappedFileAccess.Read);

    byte[] searchBytes = Encoding.UTF8.GetBytes(searchTerm);
    long matchCount = 0;

    // Process in 1 MB windows
    const int windowSize = 1_048_576;
    byte[] window = new byte[windowSize + searchBytes.Length]; // overlap for boundary matches

    for (long offset = 0; offset < fileInfo.Length; offset += windowSize)
    {
        int bytesToRead = (int)Math.Min(windowSize + searchBytes.Length, fileInfo.Length - offset);
        accessor.ReadArray(offset, window, 0, bytesToRead);

        var span = window.AsSpan(0, bytesToRead);
        int pos = 0;
        while ((pos = span[pos..].IndexOf(searchBytes)) >= 0)
        {
            matchCount++;
            pos += searchBytes.Length;
        }
    }

    Console.WriteLine($"Found {matchCount:N0} matches.");
}
```

### When to Use Memory-Mapped Files

| Scenario | Use Memory-Mapped? |
|---|---|
| Sequential read of large file | No — `StreamReader` or Pipelines is simpler |
| Random access patterns | Yes |
| Shared memory between processes | Yes |
| File smaller than available RAM | Either approach works |
| File much larger than RAM | Yes — OS handles paging automatically |

---

## Benchmarking Results

Approximate times for reading a 10 GB log file (counting lines) on a modern NVMe SSD:

| Method | Time | Peak Memory | Allocations |
|---|---|---|---|
| `File.ReadAllText` | OOM crash | > 20 GB | 1 huge string |
| `File.ReadAllLines` | OOM crash | > 20 GB | Millions of strings |
| `File.ReadLines` | 38 sec | 12 MB | Millions of strings |
| `StreamReader` (64K buffer) | 35 sec | 8 MB | Millions of strings |
| `PipeReader` (bytes, no strings) | 12 sec | 0.4 MB | Near zero |
| Memory-mapped + Span | 14 sec | 2 MB (virtual: 10 GB) | Near zero |

> **Tip:** The biggest performance gain comes from avoiding `string` allocations entirely.
> Working with `Span<byte>` and `ReadOnlySequence<byte>` keeps the GC quiet.

---

## Complete Example: Parsing a 10 GB Log File

```csharp
using System.Buffers;
using System.IO.Pipelines;
using System.Text;

public class LogAnalyzer
{
    private long _totalLines;
    private long _errorLines;
    private long _warnLines;

    public async Task<LogReport> AnalyzeAsync(string logPath, CancellationToken ct)
    {
        await using var stream = new FileStream(
            logPath, FileMode.Open, FileAccess.Read, FileShare.Read,
            bufferSize: 0,
            FileOptions.SequentialScan | FileOptions.Asynchronous);

        var reader = PipeReader.Create(stream, new StreamPipeReaderOptions(
            bufferSize: 1_048_576)); // 1 MB read buffer

        var errorBytes = "ERROR"u8.ToArray();
        var warnBytes = "WARN"u8.ToArray();

        while (true)
        {
            ReadResult result = await reader.ReadAsync(ct);
            var buffer = result.Buffer;

            while (TryReadLine(ref buffer, out var line))
            {
                _totalLines++;
                CategorizeLine(line, errorBytes, warnBytes);
            }

            reader.AdvanceTo(buffer.Start, buffer.End);

            if (_totalLines % 10_000_000 == 0)
                Console.WriteLine($"Processed {_totalLines:N0} lines...");

            if (result.IsCompleted)
                break;
        }

        await reader.CompleteAsync();

        return new LogReport(_totalLines, _errorLines, _warnLines);
    }

    private void CategorizeLine(ReadOnlySequence<byte> line, byte[] error, byte[] warn)
    {
        var span = line.IsSingleSegment ? line.FirstSpan : line.ToArray().AsSpan();

        if (span.IndexOf(error) >= 0)
            _errorLines++;
        else if (span.IndexOf(warn) >= 0)
            _warnLines++;
    }

    private static bool TryReadLine(
        ref ReadOnlySequence<byte> buffer,
        out ReadOnlySequence<byte> line)
    {
        var position = buffer.PositionOf((byte)'\n');
        if (position is null) { line = default; return false; }

        line = buffer.Slice(0, position.Value);
        buffer = buffer.Slice(buffer.GetPosition(1, position.Value));
        return true;
    }
}

public record LogReport(long TotalLines, long ErrorLines, long WarnLines)
{
    public override string ToString() =>
        $"Total: {TotalLines:N0}, Errors: {ErrorLines:N0}, Warnings: {WarnLines:N0}";
}
```

---

## Summary

| Goal | Approach |
|---|---|
| Simple small file reads | `File.ReadAllText` or `File.ReadLines` |
| Async line-by-line | `StreamReader` with large buffer |
| Maximum throughput, minimal allocation | `System.IO.Pipelines` with `PipeReader` |
| Random access or shared memory | `MemoryMappedFile` |
| Files larger than RAM | Streaming (never load entirely) |
| Parallel processing | Chunk the file by byte offset |
