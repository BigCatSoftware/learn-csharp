# Project 6: High Performance File Ingestion Engine

*Difficulty: Medium-Hard | Estimated: 5-7 days | Category: Data Engineering*

---

## Project Overview

Build a production-grade file ingestion engine that reads large delimited or fixed-width files, validates and transforms each row against a configurable schema, and bulk-loads the results into SQL Server at high throughput. The engine must never load an entire file into memory: it streams line by line, processes rows in parallel, and writes batches via `SqlBulkCopy` using a staging table pattern.

This project mirrors the kind of data engineering work you do at BNBuilders: taking vendor exports, flat files from construction management systems, or accounting dumps and loading them into SQL Server reliably and fast. The engine is driven by a JSON schema definition that describes columns, types, widths, and validation rules, so adding a new file format requires zero code changes.

Key engineering constraints: target 500K+ rows per minute on a standard developer machine, support resumable ingestion with checkpoint files, produce a dead letter file for rejected rows, and report real-time progress (rows/sec, ETA, MB processed). The CLI uses `System.CommandLine` and the benchmarks use `BenchmarkDotNet`.

---

## Learning Objectives

- Stream large files without loading them entirely into memory using `StreamReader` and `ReadOnlySpan<char>`
- Define configurable schemas in JSON and deserialize them with `System.Text.Json`
- Implement type conversion and validation pipelines per column
- Use `System.Threading.Channels` for producer-consumer parallelism
- Bulk-load data into SQL Server with `SqlBulkCopy` and staging tables
- Implement checkpoint-based resumable ingestion
- Build a CLI application with `System.CommandLine`
- Benchmark with `BenchmarkDotNet` and optimize hot paths
- Handle errors gracefully with dead letter files and structured logging
- Write fast, allocation-conscious C# using `Span<T>` and `ArrayPool<T>`

---

## Prerequisites

| Lesson | Topic |
|--------|-------|
| 60 | SqlBulkCopy Deep Dive |
| 165 | SqlBulkCopy Advanced |
| 203 | Parallel Data Processing |
| 64 | High Throughput File IO |
| 68 | Benchmarking |
| 34 | Channels |

---

## Architecture

```
Ingestion.sln
|
+-- src/
|   +-- Ingestion.Core/                    # Core engine, no SQL dependency
|   |   +-- Schema/
|   |   |   +-- FileSchema.cs              # JSON-deserializable schema definition
|   |   |   +-- ColumnDefinition.cs        # Column name, type, width, rules
|   |   |   +-- SchemaLoader.cs            # Loads and validates schema JSON
|   |   +-- Readers/
|   |   |   +-- IFileReader.cs             # Streaming reader interface
|   |   |   +-- DelimitedFileReader.cs     # CSV/TSV/pipe-delimited
|   |   |   +-- FixedWidthFileReader.cs    # Fixed-width positional
|   |   +-- Mapping/
|   |   |   +-- ColumnMapper.cs            # Type conversion per column
|   |   |   +-- ValidationResult.cs        # Row-level validation outcome
|   |   |   +-- TypeConverters.cs          # Built-in converters (string, int, decimal, date, etc.)
|   |   +-- Pipeline/
|   |   |   +-- IngestionPipeline.cs       # Orchestrates read -> validate -> write
|   |   |   +-- IngestionOptions.cs        # Batch size, parallelism, etc.
|   |   |   +-- ProgressReporter.cs        # Rows/sec, ETA, MB
|   |   |   +-- Checkpoint.cs             # Resumable state
|   |   +-- DeadLetter/
|   |   |   +-- DeadLetterWriter.cs        # Writes rejected rows + reason
|   |   +-- Ingestion.Core.csproj
|   |
|   +-- Ingestion.SqlServer/               # SQL Server writer
|   |   +-- SqlBulkCopyWriter.cs           # IDataReader adapter, staging pattern
|   |   +-- StagingTableManager.cs         # Create/merge/drop staging tables
|   |   +-- Ingestion.SqlServer.csproj
|   |
|   +-- Ingestion.Cli/                     # CLI entry point
|       +-- Commands/
|       |   +-- IngestCommand.cs           # Main ingest command
|       |   +-- ValidateCommand.cs         # Validate schema without ingesting
|       |   +-- BenchmarkCommand.cs        # Run benchmarks
|       +-- Program.cs
|       +-- Ingestion.Cli.csproj
|
+-- tests/
|   +-- Ingestion.Tests/
|       +-- Readers/
|       |   +-- DelimitedFileReaderTests.cs
|       |   +-- FixedWidthFileReaderTests.cs
|       +-- Mapping/
|       |   +-- ColumnMapperTests.cs
|       |   +-- TypeConverterTests.cs
|       +-- Pipeline/
|       |   +-- IngestionPipelineTests.cs
|       +-- Ingestion.Tests.csproj
|
+-- benchmarks/
    +-- Ingestion.Benchmarks/
        +-- ReaderBenchmarks.cs
        +-- PipelineBenchmarks.cs
        +-- Ingestion.Benchmarks.csproj
```

---

## Requirements

### Core Requirements

1. **Streaming File Reader**: Read files line by line using `StreamReader`. Never allocate a `string[]` for the entire file. Support CSV (with quoted fields) and pipe-delimited formats.
2. **JSON Schema Definition**: Define file schemas in JSON: file format, delimiter, whether there is a header row, and an array of column definitions (name, target SQL type, position/index, nullable, default value, validation regex).
3. **Column Mapping and Validation**: For each row, convert raw string values to typed objects (int, decimal, DateTime, string, bool, Guid) using the schema. Reject rows that fail conversion or validation and write them to a dead letter file with the reason.
4. **SqlBulkCopy Writer**: Write validated batches to SQL Server using `SqlBulkCopy`. Use a staging table pattern: bulk load into a `#staging` temp table, then merge into the target table.
5. **CLI Interface**: Expose an `ingest` command with options: `--file`, `--schema`, `--connection-string`, `--batch-size`, `--workers`, `--dead-letter-path`.

### Extended Requirements

6. **Fixed-Width Reader**: Support fixed-width files where column positions and widths are defined in the schema.
7. **Parallel Processing**: Use `System.Threading.Channels` to pipeline reading and writing. The reader produces parsed rows into a channel; multiple worker tasks consume from the channel, validate, and batch rows for `SqlBulkCopy`.
8. **Progress Reporting**: Display real-time progress: rows processed, rows/sec, MB read, estimated time remaining. Update the console without scrolling (use `\r` or Spectre.Console).
9. **Resumable Ingestion**: After each batch, write a checkpoint file (JSON with byte offset and row count). On restart with `--resume`, seek to the checkpoint position and continue.

### Stretch Requirements

10. **BenchmarkDotNet Suite**: Benchmark the reader, mapper, and full pipeline with varying file sizes and batch sizes.
11. **Dead Letter Analysis**: A `validate` CLI command that dry-runs the schema against a file and reports error distribution by column and error type.
12. **Schema Auto-Detection**: Given a CSV with headers, attempt to infer column types from the first N rows and generate a draft schema JSON.

---

## Technical Guidance

### Streaming Reader Design

The reader interface should yield rows one at a time using `IAsyncEnumerable<RawRow>` where `RawRow` is a lightweight struct or class containing the line number and an array of string field values. For delimited files, handle quoted fields properly (a field may contain the delimiter inside quotes). For fixed-width, use `ReadOnlySpan<char>` to slice without allocating substrings.

Consider using `ArrayPool<string>.Shared` for the field arrays if you want to minimize allocations, but profile first — premature optimization here can hurt readability.

### Schema Definition Example

```json
{
  "format": "Delimited",
  "delimiter": "|",
  "hasHeader": true,
  "columns": [
    { "name": "ProjectId", "type": "int", "index": 0, "nullable": false },
    { "name": "ProjectName", "type": "string", "index": 1, "maxLength": 200 },
    { "name": "Budget", "type": "decimal", "index": 2, "nullable": true },
    { "name": "StartDate", "type": "date", "index": 3, "format": "yyyy-MM-dd" },
    { "name": "IsActive", "type": "bool", "index": 4, "default": "true" }
  ]
}
```

### Channel-Based Pipeline

The pipeline has three stages connected by bounded channels:

1. **Reader** writes `RawRow` items into `Channel<RawRow>` (bounded, e.g., 10,000 capacity for backpressure)
2. **Validators/Mappers** (configurable count) read from the raw channel, convert types, validate, write good rows to `Channel<object[]>` and bad rows to the dead letter writer
3. **Writer** reads from the mapped channel in batches and calls `SqlBulkCopy`

Use `Channel.CreateBounded<T>(new BoundedChannelOptions(capacity) { FullMode = BoundedChannelFullMode.Wait })` so the reader blocks when the validators are behind.

### SqlBulkCopy with Staging Tables

The staging table pattern:
1. Create a temp table `#staging_<guid>` matching the target schema
2. Bulk load into it
3. Execute a MERGE or INSERT from staging into the target
4. Drop the staging table

This gives you atomicity per batch and lets you handle upsert semantics. Implement `IDataReader` over your batch of `object[]` rows so `SqlBulkCopy.WriteToServerAsync` can consume it directly.

### Checkpoint File Format

```json
{
  "file": "projects_export.csv",
  "byteOffset": 104857600,
  "rowsProcessed": 450000,
  "lastBatchTimestamp": "2025-06-15T10:30:00Z",
  "deadLetterCount": 127
}
```

On resume, open the file, seek to `byteOffset`, and skip to the next newline to avoid a partial row.

---

## Step-by-Step Milestones

### Milestone 1: Schema Definition and Loader (Day 1)

Define the `FileSchema` and `ColumnDefinition` classes. Write `SchemaLoader` that reads and validates a JSON schema file. Write unit tests that load a sample schema and verify all properties. Create a few sample schema JSON files for testing.

### Milestone 2: Delimited File Reader (Day 1-2)

Implement `DelimitedFileReader` that takes a `StreamReader` and a schema, and yields `RawRow` via `IAsyncEnumerable`. Handle quoted fields, empty fields, and lines with too few or too many columns. Write tests with embedded test data covering edge cases (quoted delimiters, newlines in quotes, empty lines).

### Milestone 3: Column Mapper and Validation (Day 2-3)

Implement `ColumnMapper` that converts a `RawRow` into an `object[]` of typed values using the schema. Build `TypeConverters` for each supported type with proper error messages. Implement `DeadLetterWriter` that appends rejected rows (with line number and error details) to a CSV file. Write tests for each type converter and for mapper error handling.

### Milestone 4: SqlBulkCopy Writer with Staging (Day 3-4)

Implement `SqlBulkCopyWriter` including a custom `IDataReader` adapter for `object[]` batches. Implement `StagingTableManager` that generates DDL for the staging table from the schema, executes the MERGE, and cleans up. Write integration tests against a local SQL Server or use an in-memory test double.

### Milestone 5: Pipeline Orchestration with Channels (Day 4-5)

Wire the reader, mapper, and writer together using `Channel<T>`. Implement `IngestionPipeline` that starts all stages as tasks, propagates cancellation, and awaits completion. Add progress reporting that writes rows/sec and ETA to the console. Test the full pipeline end-to-end with a generated test file.

### Milestone 6: CLI with System.CommandLine (Day 5)

Build the CLI using `System.CommandLine`. Implement `ingest`, `validate`, and `benchmark` commands. Wire up all options with validation (file must exist, connection string must be provided, batch size must be positive). Test the CLI by running it against sample files.

### Milestone 7: Resumable Ingestion and Fixed-Width Reader (Day 5-6)

Add checkpoint writing after each batch. Implement resume logic that seeks to the saved byte offset. Implement `FixedWidthFileReader` using `Span<char>` slicing. Write tests for checkpoint save/load and for fixed-width parsing.

### Milestone 8: Benchmarks and Optimization (Day 6-7)

Create BenchmarkDotNet benchmarks for the reader (varying file sizes), mapper (varying column counts), and full pipeline (varying batch sizes and worker counts). Profile with `dotnet trace` or a profiler. Optimize the hot path: consider `Span<char>` for field splitting, reduce allocations in the mapper, tune channel capacity and batch size. Document the results in a table showing rows/sec at various configurations.

---

## Testing Requirements

### Unit Tests

- **DelimitedFileReader**: Test normal rows, quoted fields containing delimiters, quoted fields containing newlines, empty fields, rows with wrong column count, empty files, files with only a header.
- **FixedWidthFileReader**: Test exact-width fields, fields with trailing spaces, truncated rows.
- **ColumnMapper**: Test each type conversion (int, decimal, DateTime with format, bool, Guid, string with maxLength). Test nullable vs non-nullable columns. Test default values.
- **TypeConverters**: Edge cases for each type (negative numbers, max values, empty strings, whitespace).
- **DeadLetterWriter**: Verify rejected rows are written with correct line numbers and error messages.
- **Checkpoint**: Test save and load round-trip. Test resume from a checkpoint.

### Integration Tests

- **SqlBulkCopyWriter**: Write 1,000 rows to a test database and verify the data matches. Test the staging/merge pattern with upsert.
- **Full Pipeline**: Ingest a known CSV into SQL Server and verify row counts and data integrity.
- **Resume**: Start an ingestion, cancel it after N rows, resume, and verify all rows are ingested exactly once.

### Performance Tests

- Verify that a 1M row CSV ingests at 500K+ rows/min.
- Verify memory stays below 200 MB for a 2 GB file.
- Benchmark channel capacity tuning (1K, 5K, 10K, 50K).

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### Ingestion.Core/Schema/FileSchema.cs

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Ingestion.Core.Schema;

public class FileSchema
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public FileFormat Format { get; set; }

    public string Delimiter { get; set; } = ",";
    public bool HasHeader { get; set; } = true;
    public string? Encoding { get; set; }
    public List<ColumnDefinition> Columns { get; set; } = new();
}

public enum FileFormat
{
    Delimited,
    FixedWidth
}

public class ColumnDefinition
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = "string";
    public int Index { get; set; }
    public int? Width { get; set; }           // For fixed-width
    public int? StartPosition { get; set; }   // For fixed-width
    public bool Nullable { get; set; } = true;
    public string? Default { get; set; }
    public string? Format { get; set; }       // Date format, etc.
    public int? MaxLength { get; set; }
    public string? ValidationRegex { get; set; }
}

public static class SchemaLoader
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    public static FileSchema Load(string path)
    {
        var json = File.ReadAllText(path);
        var schema = JsonSerializer.Deserialize<FileSchema>(json, JsonOptions)
            ?? throw new InvalidOperationException("Failed to deserialize schema.");

        Validate(schema);
        return schema;
    }

    public static FileSchema LoadFromString(string json)
    {
        var schema = JsonSerializer.Deserialize<FileSchema>(json, JsonOptions)
            ?? throw new InvalidOperationException("Failed to deserialize schema.");

        Validate(schema);
        return schema;
    }

    private static void Validate(FileSchema schema)
    {
        if (schema.Columns.Count == 0)
            throw new InvalidOperationException("Schema must define at least one column.");

        if (schema.Format == FileFormat.FixedWidth)
        {
            foreach (var col in schema.Columns)
            {
                if (col.Width is null || col.StartPosition is null)
                    throw new InvalidOperationException(
                        $"Fixed-width column '{col.Name}' must specify Width and StartPosition.");
            }
        }

        var duplicateNames = schema.Columns
            .GroupBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        if (duplicateNames.Count > 0)
            throw new InvalidOperationException(
                $"Duplicate column names: {string.Join(", ", duplicateNames)}");
    }
}
```

### Ingestion.Core/Readers/IFileReader.cs and DelimitedFileReader.cs

```csharp
namespace Ingestion.Core.Readers;

public readonly record struct RawRow(long LineNumber, long ByteOffset, string[] Fields);

public interface IFileReader : IAsyncDisposable
{
    IAsyncEnumerable<RawRow> ReadRowsAsync(
        CancellationToken cancellationToken = default);

    Task SeekToByteOffsetAsync(long byteOffset);
    long CurrentByteOffset { get; }
}
```

```csharp
using Ingestion.Core.Schema;
using System.Runtime.CompilerServices;
using System.Text;

namespace Ingestion.Core.Readers;

public class DelimitedFileReader : IFileReader
{
    private readonly StreamReader _reader;
    private readonly FileSchema _schema;
    private readonly char _delimiter;
    private long _lineNumber;
    private long _byteOffset;
    private readonly Encoding _encoding;

    public long CurrentByteOffset => _byteOffset;

    public DelimitedFileReader(Stream stream, FileSchema schema)
    {
        _encoding = schema.Encoding is not null
            ? Encoding.GetEncoding(schema.Encoding)
            : Encoding.UTF8;

        _reader = new StreamReader(stream, _encoding, detectEncodingFromByteOrderMarks: true,
            bufferSize: 65536, leaveOpen: false);
        _schema = schema;
        _delimiter = schema.Delimiter.Length > 0 ? schema.Delimiter[0] : ',';
    }

    public async Task SeekToByteOffsetAsync(long byteOffset)
    {
        _reader.BaseStream.Seek(byteOffset, SeekOrigin.Begin);
        _reader.DiscardBufferedData();
        _byteOffset = byteOffset;

        // Skip to the next newline to avoid partial row
        if (byteOffset > 0)
        {
            var partial = await _reader.ReadLineAsync();
            if (partial is not null)
            {
                _byteOffset += _encoding.GetByteCount(partial) + _encoding.GetByteCount("\n");
            }
        }
    }

    public async IAsyncEnumerable<RawRow> ReadRowsAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        // Skip header if present
        if (_schema.HasHeader && _lineNumber == 0)
        {
            var header = await _reader.ReadLineAsync(cancellationToken);
            if (header is not null)
            {
                _byteOffset += _encoding.GetByteCount(header) + _encoding.GetByteCount("\n");
                _lineNumber++;
            }
        }

        while (!_reader.EndOfStream)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var line = await _reader.ReadLineAsync(cancellationToken);
            if (line is null) break;

            _lineNumber++;
            var lineBytes = _encoding.GetByteCount(line) + _encoding.GetByteCount("\n");
            var rowOffset = _byteOffset;
            _byteOffset += lineBytes;

            if (string.IsNullOrWhiteSpace(line)) continue;

            var fields = ParseDelimitedLine(line, _delimiter);
            yield return new RawRow(_lineNumber, rowOffset, fields);
        }
    }

    internal static string[] ParseDelimitedLine(string line, char delimiter)
    {
        var fields = new List<string>();
        var sb = new StringBuilder();
        bool inQuotes = false;
        int i = 0;

        while (i < line.Length)
        {
            char c = line[i];

            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < line.Length && line[i + 1] == '"')
                    {
                        sb.Append('"');
                        i += 2;
                        continue;
                    }
                    inQuotes = false;
                    i++;
                    continue;
                }
                sb.Append(c);
                i++;
            }
            else
            {
                if (c == '"')
                {
                    inQuotes = true;
                    i++;
                }
                else if (c == delimiter)
                {
                    fields.Add(sb.ToString());
                    sb.Clear();
                    i++;
                }
                else
                {
                    sb.Append(c);
                    i++;
                }
            }
        }

        fields.Add(sb.ToString());
        return fields.ToArray();
    }

    public ValueTask DisposeAsync()
    {
        _reader.Dispose();
        return ValueTask.CompletedTask;
    }
}
```

### Ingestion.Core/Readers/FixedWidthFileReader.cs

```csharp
using Ingestion.Core.Schema;
using System.Runtime.CompilerServices;
using System.Text;

namespace Ingestion.Core.Readers;

public class FixedWidthFileReader : IFileReader
{
    private readonly StreamReader _reader;
    private readonly FileSchema _schema;
    private long _lineNumber;
    private long _byteOffset;
    private readonly Encoding _encoding;

    public long CurrentByteOffset => _byteOffset;

    public FixedWidthFileReader(Stream stream, FileSchema schema)
    {
        _encoding = Encoding.UTF8;
        _reader = new StreamReader(stream, _encoding, bufferSize: 65536, leaveOpen: false);
        _schema = schema;
    }

    public async Task SeekToByteOffsetAsync(long byteOffset)
    {
        _reader.BaseStream.Seek(byteOffset, SeekOrigin.Begin);
        _reader.DiscardBufferedData();
        _byteOffset = byteOffset;

        if (byteOffset > 0)
        {
            var partial = await _reader.ReadLineAsync();
            if (partial is not null)
                _byteOffset += _encoding.GetByteCount(partial) + _encoding.GetByteCount("\n");
        }
    }

    public async IAsyncEnumerable<RawRow> ReadRowsAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (_schema.HasHeader && _lineNumber == 0)
        {
            var header = await _reader.ReadLineAsync(cancellationToken);
            if (header is not null)
            {
                _byteOffset += _encoding.GetByteCount(header) + _encoding.GetByteCount("\n");
                _lineNumber++;
            }
        }

        while (!_reader.EndOfStream)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var line = await _reader.ReadLineAsync(cancellationToken);
            if (line is null) break;

            _lineNumber++;
            var rowOffset = _byteOffset;
            _byteOffset += _encoding.GetByteCount(line) + _encoding.GetByteCount("\n");

            if (string.IsNullOrWhiteSpace(line)) continue;

            var fields = ParseFixedWidthLine(line.AsSpan());
            yield return new RawRow(_lineNumber, rowOffset, fields);
        }
    }

    private string[] ParseFixedWidthLine(ReadOnlySpan<char> line)
    {
        var fields = new string[_schema.Columns.Count];

        for (int i = 0; i < _schema.Columns.Count; i++)
        {
            var col = _schema.Columns[i];
            int start = col.StartPosition!.Value;
            int width = col.Width!.Value;

            if (start >= line.Length)
            {
                fields[i] = string.Empty;
                continue;
            }

            int actualWidth = Math.Min(width, line.Length - start);
            fields[i] = line.Slice(start, actualWidth).Trim().ToString();
        }

        return fields;
    }

    public ValueTask DisposeAsync()
    {
        _reader.Dispose();
        return ValueTask.CompletedTask;
    }
}
```

### Ingestion.Core/Mapping/ColumnMapper.cs

```csharp
using Ingestion.Core.Schema;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Ingestion.Core.Mapping;

public record ValidationResult(bool IsValid, string? ErrorMessage = null, int? ColumnIndex = null);

public record MappedRow(object?[] Values);

public record RejectedRow(long LineNumber, string[] OriginalFields, string Reason);

public class ColumnMapper
{
    private readonly FileSchema _schema;
    private readonly Func<string, ColumnDefinition, (bool success, object? value, string? error)>[] _converters;

    public ColumnMapper(FileSchema schema)
    {
        _schema = schema;
        _converters = schema.Columns.Select(BuildConverter).ToArray();
    }

    public (MappedRow? mapped, RejectedRow? rejected) Map(long lineNumber, string[] fields)
    {
        if (fields.Length < _schema.Columns.Count)
        {
            return (null, new RejectedRow(lineNumber, fields,
                $"Expected {_schema.Columns.Count} fields but got {fields.Length}."));
        }

        var values = new object?[_schema.Columns.Count];

        for (int i = 0; i < _schema.Columns.Count; i++)
        {
            var col = _schema.Columns[i];
            var rawValue = col.Index < fields.Length ? fields[col.Index].Trim() : string.Empty;

            // Apply default
            if (string.IsNullOrEmpty(rawValue) && col.Default is not null)
            {
                rawValue = col.Default;
            }

            // Null check
            if (string.IsNullOrEmpty(rawValue))
            {
                if (!col.Nullable)
                {
                    return (null, new RejectedRow(lineNumber, fields,
                        $"Column '{col.Name}' at index {col.Index} is null but not nullable."));
                }
                values[i] = DBNull.Value;
                continue;
            }

            // Regex validation
            if (col.ValidationRegex is not null &&
                !Regex.IsMatch(rawValue, col.ValidationRegex))
            {
                return (null, new RejectedRow(lineNumber, fields,
                    $"Column '{col.Name}' value '{rawValue}' does not match pattern '{col.ValidationRegex}'."));
            }

            // MaxLength check
            if (col.MaxLength.HasValue && rawValue.Length > col.MaxLength.Value)
            {
                return (null, new RejectedRow(lineNumber, fields,
                    $"Column '{col.Name}' value length {rawValue.Length} exceeds max {col.MaxLength.Value}."));
            }

            // Type conversion
            var (success, value, error) = _converters[i](rawValue, col);
            if (!success)
            {
                return (null, new RejectedRow(lineNumber, fields,
                    $"Column '{col.Name}': {error}"));
            }

            values[i] = value;
        }

        return (new MappedRow(values), null);
    }

    private static Func<string, ColumnDefinition, (bool, object?, string?)> BuildConverter(
        ColumnDefinition col)
    {
        return col.Type.ToLowerInvariant() switch
        {
            "string" or "varchar" or "nvarchar" => (raw, _) => (true, raw, null),

            "int" or "int32" => (raw, _) =>
                int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v)
                    ? (true, v, null)
                    : (false, null, $"Cannot convert '{raw}' to int."),

            "long" or "int64" or "bigint" => (raw, _) =>
                long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v)
                    ? (true, v, null)
                    : (false, null, $"Cannot convert '{raw}' to long."),

            "decimal" or "money" => (raw, _) =>
                decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var v)
                    ? (true, v, null)
                    : (false, null, $"Cannot convert '{raw}' to decimal."),

            "double" or "float" => (raw, _) =>
                double.TryParse(raw, NumberStyles.Float | NumberStyles.AllowThousands,
                    CultureInfo.InvariantCulture, out var v)
                    ? (true, v, null)
                    : (false, null, $"Cannot convert '{raw}' to double."),

            "bool" or "bit" => (raw, _) =>
                raw.ToLowerInvariant() switch
                {
                    "true" or "1" or "yes" or "y" => (true, true, null),
                    "false" or "0" or "no" or "n" => (true, false, null),
                    _ => (false, null, $"Cannot convert '{raw}' to bool.")
                },

            "date" or "datetime" => (raw, def) =>
            {
                if (def.Format is not null)
                {
                    return DateTime.TryParseExact(raw, def.Format, CultureInfo.InvariantCulture,
                        DateTimeStyles.None, out var v)
                        ? (true, v, null)
                        : (false, null, $"Cannot parse '{raw}' as date with format '{def.Format}'.");
                }
                return DateTime.TryParse(raw, CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var v2)
                    ? (true, v2, null)
                    : (false, null, $"Cannot parse '{raw}' as date.");
            },

            "guid" or "uniqueidentifier" => (raw, _) =>
                Guid.TryParse(raw, out var v)
                    ? (true, v, null)
                    : (false, null, $"Cannot convert '{raw}' to Guid."),

            _ => (raw, def) => (false, null, $"Unsupported type '{def.Type}'.")
        };
    }
}
```

### Ingestion.Core/DeadLetter/DeadLetterWriter.cs

```csharp
using Ingestion.Core.Mapping;
using System.Text;

namespace Ingestion.Core.DeadLetter;

public sealed class DeadLetterWriter : IAsyncDisposable
{
    private readonly StreamWriter _writer;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private long _count;

    public long Count => Interlocked.Read(ref _count);

    public DeadLetterWriter(string path)
    {
        var stream = new FileStream(path, FileMode.Create, FileAccess.Write,
            FileShare.Read, bufferSize: 65536, useAsync: true);
        _writer = new StreamWriter(stream, Encoding.UTF8, bufferSize: 65536);
        _writer.WriteLine("LineNumber|Reason|OriginalData");
    }

    public async Task WriteAsync(RejectedRow row)
    {
        var originalData = string.Join("|", row.OriginalFields.Select(f => f.Replace("|", "\\|")));
        var line = $"{row.LineNumber}|{row.Reason.Replace("|", "\\|")}|{originalData}";

        await _lock.WaitAsync();
        try
        {
            await _writer.WriteLineAsync(line);
            Interlocked.Increment(ref _count);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _writer.FlushAsync();
        await _writer.DisposeAsync();
        _lock.Dispose();
    }
}
```

### Ingestion.Core/Pipeline/IngestionPipeline.cs

```csharp
using Ingestion.Core.DeadLetter;
using Ingestion.Core.Mapping;
using Ingestion.Core.Readers;
using Ingestion.Core.Schema;
using System.Diagnostics;
using System.Threading.Channels;

namespace Ingestion.Core.Pipeline;

public class IngestionOptions
{
    public int BatchSize { get; set; } = 10_000;
    public int WorkerCount { get; set; } = 4;
    public int ChannelCapacity { get; set; } = 50_000;
    public string? CheckpointPath { get; set; }
    public string? DeadLetterPath { get; set; }
    public long ResumeFromByteOffset { get; set; }
}

public class IngestionMetrics
{
    public long RowsRead;
    public long RowsMapped;
    public long RowsRejected;
    public long RowsWritten;
    public long BytesRead;
    public Stopwatch Elapsed = Stopwatch.StartNew();
}

public record Checkpoint(
    string FileName,
    long ByteOffset,
    long RowsProcessed,
    DateTime Timestamp,
    long DeadLetterCount);

public interface IBulkWriter : IAsyncDisposable
{
    Task WriteBatchAsync(IReadOnlyList<MappedRow> batch, FileSchema schema,
        CancellationToken ct = default);
}

public class IngestionPipeline
{
    private readonly IFileReader _reader;
    private readonly FileSchema _schema;
    private readonly IBulkWriter _writer;
    private readonly IngestionOptions _options;
    private readonly IngestionMetrics _metrics = new();
    private readonly Action<IngestionMetrics>? _progressCallback;

    public IngestionPipeline(
        IFileReader reader,
        FileSchema schema,
        IBulkWriter writer,
        IngestionOptions options,
        Action<IngestionMetrics>? progressCallback = null)
    {
        _reader = reader;
        _schema = schema;
        _writer = writer;
        _options = options;
        _progressCallback = progressCallback;
    }

    public async Task<IngestionMetrics> RunAsync(CancellationToken ct = default)
    {
        var rawChannel = Channel.CreateBounded<RawRow>(
            new BoundedChannelOptions(_options.ChannelCapacity)
            {
                FullMode = BoundedChannelFullMode.Wait,
                SingleWriter = true,
                SingleReader = false
            });

        var mappedChannel = Channel.CreateBounded<MappedRow>(
            new BoundedChannelOptions(_options.ChannelCapacity)
            {
                FullMode = BoundedChannelFullMode.Wait,
                SingleWriter = false,
                SingleReader = true
            });

        await using var deadLetter = _options.DeadLetterPath is not null
            ? new DeadLetterWriter(_options.DeadLetterPath)
            : null;

        // Resume if needed
        if (_options.ResumeFromByteOffset > 0)
        {
            await _reader.SeekToByteOffsetAsync(_options.ResumeFromByteOffset);
        }

        // Start reader task
        var readerTask = Task.Run(async () =>
        {
            try
            {
                await foreach (var row in _reader.ReadRowsAsync(ct))
                {
                    await rawChannel.Writer.WriteAsync(row, ct);
                    Interlocked.Increment(ref _metrics.RowsRead);
                    Interlocked.Exchange(ref _metrics.BytesRead, _reader.CurrentByteOffset);
                }
            }
            finally
            {
                rawChannel.Writer.Complete();
            }
        }, ct);

        // Start mapper worker tasks
        var mapper = new ColumnMapper(_schema);
        var mapperTasks = Enumerable.Range(0, _options.WorkerCount).Select(_ =>
            Task.Run(async () =>
            {
                await foreach (var rawRow in rawChannel.Reader.ReadAllAsync(ct))
                {
                    var (mapped, rejected) = mapper.Map(rawRow.LineNumber, rawRow.Fields);

                    if (mapped is not null)
                    {
                        await mappedChannel.Writer.WriteAsync(mapped, ct);
                        Interlocked.Increment(ref _metrics.RowsMapped);
                    }
                    else if (rejected is not null && deadLetter is not null)
                    {
                        await deadLetter.WriteAsync(rejected);
                        Interlocked.Increment(ref _metrics.RowsRejected);
                    }
                }
            }, ct)).ToArray();

        // When all mappers finish, complete the mapped channel
        _ = Task.WhenAll(mapperTasks).ContinueWith(_ =>
            mappedChannel.Writer.Complete(), TaskScheduler.Default);

        // Start writer task (batching)
        var writerTask = Task.Run(async () =>
        {
            var batch = new List<MappedRow>(_options.BatchSize);

            await foreach (var row in mappedChannel.Reader.ReadAllAsync(ct))
            {
                batch.Add(row);

                if (batch.Count >= _options.BatchSize)
                {
                    await _writer.WriteBatchAsync(batch, _schema, ct);
                    Interlocked.Add(ref _metrics.RowsWritten, batch.Count);

                    // Checkpoint
                    if (_options.CheckpointPath is not null)
                    {
                        await SaveCheckpointAsync();
                    }

                    _progressCallback?.Invoke(_metrics);
                    batch.Clear();
                }
            }

            // Final partial batch
            if (batch.Count > 0)
            {
                await _writer.WriteBatchAsync(batch, _schema, ct);
                Interlocked.Add(ref _metrics.RowsWritten, batch.Count);
                _progressCallback?.Invoke(_metrics);
            }
        }, ct);

        // Progress reporting on a timer
        using var progressTimer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        var progressTask = Task.Run(async () =>
        {
            while (await progressTimer.WaitForNextTickAsync(ct))
            {
                _progressCallback?.Invoke(_metrics);
            }
        }, ct);

        await readerTask;
        await Task.WhenAll(mapperTasks);
        await writerTask;

        _metrics.Elapsed.Stop();
        return _metrics;
    }

    private async Task SaveCheckpointAsync()
    {
        var checkpoint = new Checkpoint(
            FileName: _options.CheckpointPath!,
            ByteOffset: _reader.CurrentByteOffset,
            RowsProcessed: Interlocked.Read(ref _metrics.RowsWritten),
            Timestamp: DateTime.UtcNow,
            DeadLetterCount: Interlocked.Read(ref _metrics.RowsRejected));

        var json = System.Text.Json.JsonSerializer.Serialize(checkpoint,
            new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(_options.CheckpointPath!, json);
    }
}
```

### Ingestion.SqlServer/SqlBulkCopyWriter.cs

```csharp
using Ingestion.Core.Mapping;
using Ingestion.Core.Pipeline;
using Ingestion.Core.Schema;
using Microsoft.Data.SqlClient;
using System.Data;

namespace Ingestion.SqlServer;

public class SqlBulkCopyWriter : IBulkWriter
{
    private readonly string _connectionString;
    private readonly string _targetTable;
    private readonly bool _useStagingTable;

    public SqlBulkCopyWriter(string connectionString, string targetTable,
        bool useStagingTable = true)
    {
        _connectionString = connectionString;
        _targetTable = targetTable;
        _useStagingTable = useStagingTable;
    }

    public async Task WriteBatchAsync(IReadOnlyList<MappedRow> batch, FileSchema schema,
        CancellationToken ct = default)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        if (_useStagingTable)
        {
            await WriteBatchWithStagingAsync(connection, batch, schema, ct);
        }
        else
        {
            await WriteBatchDirectAsync(connection, batch, schema, ct);
        }
    }

    private async Task WriteBatchWithStagingAsync(SqlConnection connection,
        IReadOnlyList<MappedRow> batch, FileSchema schema, CancellationToken ct)
    {
        var stagingTable = $"#staging_{Guid.NewGuid():N}";

        // Create staging table
        var createDdl = StagingTableManager.GenerateCreateDdl(stagingTable, schema);
        await using (var cmd = new SqlCommand(createDdl, connection))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // Bulk copy into staging
        using var bulkCopy = new SqlBulkCopy(connection)
        {
            DestinationTableName = stagingTable,
            BatchSize = batch.Count,
            BulkCopyTimeout = 120
        };

        for (int i = 0; i < schema.Columns.Count; i++)
        {
            bulkCopy.ColumnMappings.Add(i, schema.Columns[i].Name);
        }

        using var reader = new MappedRowDataReader(batch, schema);
        await bulkCopy.WriteToServerAsync(reader, ct);

        // Merge into target
        var mergeSql = StagingTableManager.GenerateMergeSql(
            stagingTable, _targetTable, schema);
        await using (var cmd = new SqlCommand(mergeSql, connection))
        {
            cmd.CommandTimeout = 120;
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // Drop staging
        await using (var cmd = new SqlCommand($"DROP TABLE {stagingTable}", connection))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task WriteBatchDirectAsync(SqlConnection connection,
        IReadOnlyList<MappedRow> batch, FileSchema schema, CancellationToken ct)
    {
        using var bulkCopy = new SqlBulkCopy(connection)
        {
            DestinationTableName = _targetTable,
            BatchSize = batch.Count,
            BulkCopyTimeout = 120
        };

        for (int i = 0; i < schema.Columns.Count; i++)
        {
            bulkCopy.ColumnMappings.Add(i, schema.Columns[i].Name);
        }

        using var reader = new MappedRowDataReader(batch, schema);
        await bulkCopy.WriteToServerAsync(reader, ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

/// <summary>
/// Custom IDataReader implementation that wraps a list of MappedRow objects
/// for consumption by SqlBulkCopy.
/// </summary>
public class MappedRowDataReader : IDataReader
{
    private readonly IReadOnlyList<MappedRow> _rows;
    private readonly FileSchema _schema;
    private int _currentIndex = -1;

    public MappedRowDataReader(IReadOnlyList<MappedRow> rows, FileSchema schema)
    {
        _rows = rows;
        _schema = schema;
    }

    public int FieldCount => _schema.Columns.Count;
    public bool Read() => ++_currentIndex < _rows.Count;
    public object GetValue(int i) => _rows[_currentIndex].Values[i] ?? DBNull.Value;
    public string GetName(int i) => _schema.Columns[i].Name;

    public int GetOrdinal(string name) =>
        _schema.Columns.FindIndex(c =>
            c.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

    public bool IsDBNull(int i) =>
        _rows[_currentIndex].Values[i] is null ||
        _rows[_currentIndex].Values[i] is DBNull;

    public int GetValues(object[] values)
    {
        var row = _rows[_currentIndex].Values;
        var count = Math.Min(values.Length, row.Length);
        for (int i = 0; i < count; i++)
            values[i] = row[i] ?? DBNull.Value;
        return count;
    }

    // Required interface members with default implementations
    public string GetDataTypeName(int i) => _schema.Columns[i].Type;
    public Type GetFieldType(int i) => GetValue(i)?.GetType() ?? typeof(object);
    public object this[int i] => GetValue(i);
    public object this[string name] => GetValue(GetOrdinal(name));
    public int Depth => 0;
    public bool IsClosed => false;
    public int RecordsAffected => -1;

    public void Close() { }
    public void Dispose() { }
    public bool NextResult() => false;
    public DataTable GetSchemaTable() => new();
    public bool GetBoolean(int i) => (bool)GetValue(i);
    public byte GetByte(int i) => (byte)GetValue(i);
    public long GetBytes(int i, long o, byte[]? b, int bo, int l) => 0;
    public char GetChar(int i) => (char)GetValue(i);
    public long GetChars(int i, long o, char[]? b, int bo, int l) => 0;
    public IDataReader GetData(int i) => throw new NotSupportedException();
    public DateTime GetDateTime(int i) => (DateTime)GetValue(i);
    public decimal GetDecimal(int i) => (decimal)GetValue(i);
    public double GetDouble(int i) => (double)GetValue(i);
    public float GetFloat(int i) => (float)GetValue(i);
    public Guid GetGuid(int i) => (Guid)GetValue(i);
    public short GetInt16(int i) => (short)GetValue(i);
    public int GetInt32(int i) => (int)GetValue(i);
    public long GetInt64(int i) => (long)GetValue(i);
    public string GetString(int i) => (string)GetValue(i);
}

public static class StagingTableManager
{
    public static string GenerateCreateDdl(string tableName, FileSchema schema)
    {
        var columns = schema.Columns.Select(c =>
        {
            var sqlType = MapToSqlType(c);
            var nullable = c.Nullable ? "NULL" : "NOT NULL";
            return $"    [{c.Name}] {sqlType} {nullable}";
        });

        return $"CREATE TABLE {tableName} (\n{string.Join(",\n", columns)}\n)";
    }

    public static string GenerateMergeSql(string staging, string target, FileSchema schema)
    {
        var firstCol = schema.Columns[0].Name;
        var columnList = string.Join(", ", schema.Columns.Select(c => $"[{c.Name}]"));
        var sourceColumns = string.Join(", ", schema.Columns.Select(c => $"s.[{c.Name}]"));

        return $@"
            INSERT INTO {target} ({columnList})
            SELECT {sourceColumns}
            FROM {staging} s";
    }

    private static string MapToSqlType(ColumnDefinition col) => col.Type.ToLowerInvariant() switch
    {
        "string" or "varchar" => $"VARCHAR({col.MaxLength ?? 255})",
        "nvarchar" => $"NVARCHAR({col.MaxLength ?? 255})",
        "int" or "int32" => "INT",
        "long" or "int64" or "bigint" => "BIGINT",
        "decimal" or "money" => "DECIMAL(18,4)",
        "double" or "float" => "FLOAT",
        "bool" or "bit" => "BIT",
        "date" => "DATE",
        "datetime" => "DATETIME2",
        "guid" or "uniqueidentifier" => "UNIQUEIDENTIFIER",
        _ => "NVARCHAR(MAX)"
    };
}
```

### Ingestion.Cli/Program.cs

```csharp
using Ingestion.Core.Pipeline;
using Ingestion.Core.Readers;
using Ingestion.Core.Schema;
using Ingestion.SqlServer;
using System.CommandLine;
using System.Text.Json;

var rootCommand = new RootCommand("High Performance File Ingestion Engine");

var ingestCommand = new Command("ingest", "Ingest a file into SQL Server");
var fileOption = new Option<FileInfo>("--file", "Path to the data file") { IsRequired = true };
var schemaOption = new Option<FileInfo>("--schema", "Path to the schema JSON") { IsRequired = true };
var connOption = new Option<string>("--connection-string", "SQL Server connection string")
    { IsRequired = true };
var batchOption = new Option<int>("--batch-size", () => 10_000, "Batch size for SqlBulkCopy");
var workersOption = new Option<int>("--workers", () => 4, "Number of parallel mapping workers");
var deadLetterOption = new Option<string?>("--dead-letter-path", "Path for rejected rows file");
var targetOption = new Option<string>("--target-table", "Target SQL table name")
    { IsRequired = true };
var resumeOption = new Option<bool>("--resume", () => false, "Resume from last checkpoint");
var checkpointOption = new Option<string?>("--checkpoint-path", "Path for checkpoint file");

ingestCommand.AddOption(fileOption);
ingestCommand.AddOption(schemaOption);
ingestCommand.AddOption(connOption);
ingestCommand.AddOption(batchOption);
ingestCommand.AddOption(workersOption);
ingestCommand.AddOption(deadLetterOption);
ingestCommand.AddOption(targetOption);
ingestCommand.AddOption(resumeOption);
ingestCommand.AddOption(checkpointOption);

ingestCommand.SetHandler(async (context) =>
{
    var file = context.ParseResult.GetValueForOption(fileOption)!;
    var schemaFile = context.ParseResult.GetValueForOption(schemaOption)!;
    var connStr = context.ParseResult.GetValueForOption(connOption)!;
    var batchSize = context.ParseResult.GetValueForOption(batchOption);
    var workers = context.ParseResult.GetValueForOption(workersOption);
    var deadLetterPath = context.ParseResult.GetValueForOption(deadLetterOption);
    var targetTable = context.ParseResult.GetValueForOption(targetOption)!;
    var resume = context.ParseResult.GetValueForOption(resumeOption);
    var checkpointPath = context.ParseResult.GetValueForOption(checkpointOption);
    var ct = context.GetCancellationToken();

    Console.WriteLine($"Loading schema from {schemaFile.FullName}...");
    var schema = SchemaLoader.Load(schemaFile.FullName);

    Console.WriteLine($"Ingesting {file.FullName} -> {targetTable}");
    Console.WriteLine($"  Batch size: {batchSize:N0}, Workers: {workers}");

    var options = new IngestionOptions
    {
        BatchSize = batchSize,
        WorkerCount = workers,
        DeadLetterPath = deadLetterPath,
        CheckpointPath = checkpointPath
    };

    // Resume from checkpoint
    if (resume && checkpointPath is not null && File.Exists(checkpointPath))
    {
        var json = await File.ReadAllTextAsync(checkpointPath, ct);
        var checkpoint = JsonSerializer.Deserialize<Checkpoint>(json);
        if (checkpoint is not null)
        {
            options.ResumeFromByteOffset = checkpoint.ByteOffset;
            Console.WriteLine($"  Resuming from byte offset {checkpoint.ByteOffset:N0} " +
                $"({checkpoint.RowsProcessed:N0} rows already processed)");
        }
    }

    // Create reader
    var stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read,
        FileShare.Read, bufferSize: 65536, useAsync: true);

    IFileReader reader = schema.Format switch
    {
        FileFormat.Delimited => new DelimitedFileReader(stream, schema),
        FileFormat.FixedWidth => new FixedWidthFileReader(stream, schema),
        _ => throw new NotSupportedException($"Format {schema.Format} not supported.")
    };

    await using var writer = new SqlBulkCopyWriter(connStr, targetTable);

    var pipeline = new IngestionPipeline(reader, schema, writer, options, metrics =>
    {
        var rowsPerSec = metrics.Elapsed.Elapsed.TotalSeconds > 0
            ? metrics.RowsRead / metrics.Elapsed.Elapsed.TotalSeconds
            : 0;
        var mbRead = metrics.BytesRead / (1024.0 * 1024.0);

        Console.Write($"\r  Rows: {metrics.RowsRead:N0} read, " +
            $"{metrics.RowsWritten:N0} written, {metrics.RowsRejected:N0} rejected | " +
            $"{rowsPerSec:N0} rows/sec | {mbRead:N1} MB   ");
    });

    var result = await pipeline.RunAsync(ct);

    Console.WriteLine();
    Console.WriteLine();
    Console.WriteLine("=== Ingestion Complete ===");
    Console.WriteLine($"  Total rows read:     {result.RowsRead:N0}");
    Console.WriteLine($"  Total rows written:  {result.RowsWritten:N0}");
    Console.WriteLine($"  Total rows rejected: {result.RowsRejected:N0}");
    Console.WriteLine($"  Elapsed time:        {result.Elapsed.Elapsed:hh\\:mm\\:ss\\.fff}");

    var totalRowsPerSec = result.Elapsed.Elapsed.TotalSeconds > 0
        ? result.RowsWritten / result.Elapsed.Elapsed.TotalSeconds
        : 0;
    Console.WriteLine($"  Throughput:          {totalRowsPerSec:N0} rows/sec");

    await reader.DisposeAsync();
});

var validateCommand = new Command("validate", "Validate a schema file");
validateCommand.AddOption(schemaOption);

validateCommand.SetHandler(schemaFile =>
{
    try
    {
        var schema = SchemaLoader.Load(schemaFile!.FullName);
        Console.WriteLine($"Schema is valid. {schema.Columns.Count} columns defined.");
        Console.WriteLine($"Format: {schema.Format}, Delimiter: '{schema.Delimiter}', " +
            $"HasHeader: {schema.HasHeader}");

        foreach (var col in schema.Columns)
        {
            Console.WriteLine($"  [{col.Index}] {col.Name} ({col.Type})" +
                $"{(col.Nullable ? " NULLABLE" : " NOT NULL")}" +
                $"{(col.Default is not null ? $" DEFAULT='{col.Default}'" : "")}");
        }
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Schema validation failed: {ex.Message}");
    }
}, schemaOption);

rootCommand.AddCommand(ingestCommand);
rootCommand.AddCommand(validateCommand);

return await rootCommand.InvokeAsync(args);
```

</details>

---

## What to Show Off

### Portfolio Presentation

- Run the tool against a million-row CSV and show the real-time progress output: rows/sec counter climbing, MB processed, dead letter count.
- Show the schema JSON and explain how adding a new file format requires zero code changes.
- Display the architecture diagram: streaming reader feeding a bounded channel, parallel mappers, batched SqlBulkCopy writer.
- Open the dead letter file and walk through how rejected rows are captured with full context for debugging.

### Interview Talking Points

- **Memory efficiency**: Explain how streaming + bounded channels ensure the application processes a 10 GB file in constant memory. Draw the backpressure diagram.
- **Throughput optimization**: Discuss batch size tuning, SqlBulkCopy internal batching, and why staging tables help with large loads.
- **Fault tolerance**: Explain the checkpoint/resume pattern and how it provides exactly-once semantics when combined with the staging merge.
- **Real-world applicability**: Connect this to construction data workflows — vendor file drops, accounting exports, material tracking CSVs.

---

## Stretch Goals

1. **Schema Auto-Detection**: Add a `detect` command that reads the first 1,000 rows of a CSV, infers column types by attempting conversions from most specific to least, and generates a draft schema JSON.
2. **Parquet Output**: Add an `Ingestion.Parquet` project that writes to Parquet files using Apache.Arrow instead of SQL Server, sharing the same reader and mapper pipeline.
3. **Spectre.Console Progress**: Replace the `\r` progress line with a Spectre.Console `ProgressTask` showing a full progress bar, spinner, and multi-line stats table.
4. **Parallel File Ingestion**: Support passing a glob pattern (e.g., `--file "data/*.csv"`) and ingest multiple files concurrently with a configurable max concurrency.
5. **Webhook Notifications**: On completion or failure, POST a summary JSON to a configurable webhook URL (useful for integration with Teams or Slack).
