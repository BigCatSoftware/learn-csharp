# Working with Parquet and Arrow

CSV files are universal but inefficient. **Apache Parquet** is a columnar storage format that
offers dramatic compression, fast analytical queries, and schema enforcement. **Apache Arrow**
provides an in-memory columnar format for zero-copy data exchange. Both have mature C# libraries.

---

## Why Parquet?

| Property | CSV | Parquet |
|---|---|---|
| Storage format | Row-oriented text | Column-oriented binary |
| Compression | None (or gzip the whole file) | Per-column (Snappy, Gzip, Zstd) |
| Schema | None — everything is text | Embedded schema with types |
| Read performance | Must parse entire file | Can read individual columns |
| File size (1M rows, 20 columns) | ~500 MB | ~50 MB |
| Ecosystem | Universal | Spark, BigQuery, Athena, DuckDB, Pandas |

> **Note:** Parquet is the de facto standard for data lakes. If you produce data that will be
> consumed by analytics tools, Parquet is almost always the right format.

---

## Parquet.Net Library

Install the NuGet package:

```
dotnet add package Parquet.Net
```

### Writing a Parquet File

```csharp
using Parquet;
using Parquet.Data;
using Parquet.Schema;

// Define schema
var schema = new ParquetSchema(
    new DataField<int>("Id"),
    new DataField<string>("Name"),
    new DataField<DateTime>("OrderDate"),
    new DataField<decimal>("Amount"),
    new DataField<bool>("IsComplete")
);

// Prepare column data
int[] ids = { 1, 2, 3, 4, 5 };
string[] names = { "Alice", "Bob", "Charlie", "Diana", "Eve" };
DateTime[] dates = Enumerable.Range(0, 5)
    .Select(i => new DateTime(2025, 1, 1).AddDays(i))
    .ToArray();
decimal[] amounts = { 100.50m, 200.75m, 50.00m, 999.99m, 75.25m };
bool[] complete = { true, false, true, true, false };

// Write
using var fileStream = File.Create("orders.parquet");
using var writer = await ParquetWriter.CreateAsync(schema, fileStream);

using var groupWriter = writer.CreateRowGroup();
await groupWriter.WriteColumnAsync(new DataColumn(schema.DataFields[0], ids));
await groupWriter.WriteColumnAsync(new DataColumn(schema.DataFields[1], names));
await groupWriter.WriteColumnAsync(new DataColumn(schema.DataFields[2], dates));
await groupWriter.WriteColumnAsync(new DataColumn(schema.DataFields[3], amounts));
await groupWriter.WriteColumnAsync(new DataColumn(schema.DataFields[4], complete));
```

### Reading a Parquet File

```csharp
using var fileStream = File.OpenRead("orders.parquet");
using var reader = await ParquetReader.CreateAsync(fileStream);

Console.WriteLine($"Schema: {reader.Schema}");
Console.WriteLine($"Row groups: {reader.RowGroupCount}");

for (int g = 0; g < reader.RowGroupCount; g++)
{
    using var groupReader = reader.OpenRowGroupReader(g);

    // Read only the columns you need — this is the power of columnar storage
    var nameColumn = (await groupReader.ReadColumnAsync(reader.Schema.DataFields[1]));
    var amountColumn = (await groupReader.ReadColumnAsync(reader.Schema.DataFields[3]));

    var names = (string[])nameColumn.Data;
    var amounts = (decimal[])amountColumn.Data;

    for (int i = 0; i < names.Length; i++)
    {
        Console.WriteLine($"{names[i]}: ${amounts[i]}");
    }
}
```

> **Tip:** Parquet's columnar layout means that reading 2 columns from a 20-column file only
> reads ~10% of the data from disk. This is a massive advantage for analytical queries.

---

## Column-Oriented vs Row-Oriented Storage

```
Row-oriented (CSV):
  Alice, 2025-01-01, 100.50
  Bob,   2025-01-02, 200.75
  Charlie, 2025-01-03, 50.00

Column-oriented (Parquet):
  Names:   [Alice, Bob, Charlie]
  Dates:   [2025-01-01, 2025-01-02, 2025-01-03]
  Amounts: [100.50, 200.75, 50.00]
```

Benefits of columnar storage:
- **Better compression**: similar values are adjacent (e.g., all dates together)
- **Column pruning**: skip columns you do not need
- **Vectorized operations**: process an entire column array at once

---

## Compression Options

```csharp
using var writer = await ParquetWriter.CreateAsync(schema, fileStream);
writer.CompressionMethod = CompressionMethod.Snappy; // default, fast
// writer.CompressionMethod = CompressionMethod.Gzip;   // smaller, slower
// writer.CompressionMethod = CompressionMethod.Zstd;   // best balance
```

| Algorithm | Compression Ratio | Speed | Best For |
|---|---|---|---|
| None | 1x | Fastest | Already compressed data |
| Snappy | 2-4x | Very fast | Default for most use cases |
| Gzip | 4-8x | Moderate | Archival, bandwidth-limited |
| Zstd | 4-8x | Fast (faster than Gzip) | Best general purpose |

> **Important:** Snappy is the industry default for Parquet. Switch to Zstd if you need better
> compression without sacrificing too much speed. Use Gzip only when maximum compression is
> required and speed is not critical.

---

## Row Groups

Parquet files are divided into **row groups** — independent chunks of rows. Each row group
contains column chunks that can be read independently.

```csharp
using var writer = await ParquetWriter.CreateAsync(schema, fileStream);

// Write multiple row groups (e.g., one per 1M rows)
for (int batch = 0; batch < totalBatches; batch++)
{
    using var group = writer.CreateRowGroup();
    await group.WriteColumnAsync(new DataColumn(schema.DataFields[0], GetIdBatch(batch)));
    await group.WriteColumnAsync(new DataColumn(schema.DataFields[1], GetNameBatch(batch)));
    // ... other columns
}
```

> **Tip:** Aim for row groups of 50 MB to 1 GB of uncompressed data. Too small and you lose
> compression efficiency; too large and readers cannot skip irrelevant data.

---

## Apache Arrow In-Memory Format

Apache Arrow defines a language-independent columnar memory format. The C# library:

```
dotnet add package Apache.Arrow
```

### Creating Arrow Arrays and RecordBatches

```csharp
using Apache.Arrow;
using Apache.Arrow.Types;

// Build arrays
var idBuilder = new Int32Array.Builder();
var nameBuilder = new StringArray.Builder();
var amountBuilder = new DoubleArray.Builder();

for (int i = 0; i < 1_000_000; i++)
{
    idBuilder.Append(i);
    nameBuilder.Append($"Item_{i}");
    amountBuilder.Append(i * 1.5);
}

// Create a schema
var schema = new Apache.Arrow.Schema.Builder()
    .Field(new Field("Id", Int32Type.Default, nullable: false))
    .Field(new Field("Name", StringType.Default, nullable: true))
    .Field(new Field("Amount", DoubleType.Default, nullable: false))
    .Build();

// Create a RecordBatch
var batch = new RecordBatch(schema, new IArrowArray[]
{
    idBuilder.Build(),
    nameBuilder.Build(),
    amountBuilder.Build()
}, length: 1_000_000);

Console.WriteLine($"Batch: {batch.Length} rows, {batch.ColumnCount} columns");
```

### Iterating Over Arrow Data

```csharp
// Access typed column data
var ids = (Int32Array)batch.Column(0);
var names = (StringArray)batch.Column(1);
var amounts = (DoubleArray)batch.Column(2);

for (int i = 0; i < batch.Length; i++)
{
    int id = ids.GetValue(i)!.Value;
    string name = names.GetString(i);
    double amount = amounts.GetValue(i)!.Value;
}
```

---

## Arrow IPC: Reading and Writing

Arrow files use IPC (Inter-Process Communication) format for serialization:

```csharp
using Apache.Arrow.Ipc;

// Write Arrow IPC file
await using var fileStream = File.Create("data.arrow");
using var writer = new ArrowFileWriter(fileStream, schema);
await writer.WriteRecordBatchAsync(batch);
await writer.WriteEndAsync();

// Read Arrow IPC file
await using var readStream = File.OpenRead("data.arrow");
using var reader = new ArrowFileReader(readStream);

var readBatch = await reader.ReadNextRecordBatchAsync();
Console.WriteLine($"Read {readBatch.Length} rows.");
```

---

## Converting CSV to Parquet

A complete, real-world example:

```csharp
using Parquet;
using Parquet.Data;
using Parquet.Schema;

public class CsvToParquetConverter
{
    public async Task ConvertAsync(
        string csvPath,
        string parquetPath,
        int rowGroupSize = 1_000_000)
    {
        using var csvReader = new StreamReader(csvPath);
        var header = (await csvReader.ReadLineAsync())!.Split(',');

        // Infer schema (simplified — all strings)
        var fields = header.Select(h => new DataField<string>(h.Trim())).ToArray();
        var schema = new ParquetSchema(fields);

        await using var outStream = File.Create(parquetPath);
        using var writer = await ParquetWriter.CreateAsync(schema, outStream);
        writer.CompressionMethod = CompressionMethod.Snappy;

        var columns = new List<string>[header.Length];
        for (int c = 0; c < header.Length; c++)
            columns[c] = new List<string>(rowGroupSize);

        int rowCount = 0;
        int totalRows = 0;

        while (await csvReader.ReadLineAsync() is { } line)
        {
            var values = line.Split(',');
            for (int c = 0; c < Math.Min(values.Length, header.Length); c++)
                columns[c].Add(values[c].Trim());

            rowCount++;

            if (rowCount >= rowGroupSize)
            {
                await WriteRowGroupAsync(writer, schema, columns);
                totalRows += rowCount;
                rowCount = 0;
                for (int c = 0; c < header.Length; c++)
                    columns[c].Clear();

                Console.WriteLine($"Written {totalRows:N0} rows...");
            }
        }

        // Write remaining rows
        if (rowCount > 0)
        {
            await WriteRowGroupAsync(writer, schema, columns);
            totalRows += rowCount;
        }

        Console.WriteLine($"Conversion complete: {totalRows:N0} rows written to {parquetPath}");
    }

    private static async Task WriteRowGroupAsync(
        ParquetWriter writer,
        ParquetSchema schema,
        List<string>[] columns)
    {
        using var group = writer.CreateRowGroup();
        for (int c = 0; c < columns.Length; c++)
        {
            await group.WriteColumnAsync(
                new DataColumn(schema.DataFields[c], columns[c].ToArray()));
        }
    }
}
```

Usage:

```csharp
var converter = new CsvToParquetConverter();
await converter.ConvertAsync(
    "/data/sales_2025.csv",       // 2 GB CSV
    "/data/sales_2025.parquet");  // ~200 MB Parquet
```

---

## Querying Parquet Files

Read only the columns and row groups you need:

```csharp
public async Task<decimal> SumColumnAsync(string parquetPath, string columnName)
{
    await using var stream = File.OpenRead(parquetPath);
    using var reader = await ParquetReader.CreateAsync(stream);

    var field = reader.Schema.DataFields
        .First(f => f.Name == columnName);

    decimal sum = 0m;

    for (int g = 0; g < reader.RowGroupCount; g++)
    {
        using var group = reader.OpenRowGroupReader(g);
        var column = await group.ReadColumnAsync(field);
        var values = (decimal[])column.Data;

        foreach (var val in values)
            sum += val;
    }

    return sum;
}
```

> **Caution:** This is a simplified approach. For complex analytical queries on Parquet files,
> consider using DuckDB (which has a .NET client) — it can query Parquet files directly with
> SQL and handles predicate pushdown, parallelism, and vectorized execution.

---

## Summary

| Format | Purpose | Library |
|---|---|---|
| Parquet | Columnar storage on disk | `Parquet.Net` |
| Arrow | Columnar format in memory | `Apache.Arrow` |
| Arrow IPC | Serialized Arrow for file/network | `Apache.Arrow.Ipc` |
| CSV | Legacy interchange | `StreamReader` / CsvHelper |

| Task | Approach |
|---|---|
| Store data for analytics | Write Parquet with Snappy compression |
| Exchange data between processes | Arrow IPC |
| Read specific columns efficiently | Parquet column pruning |
| Convert legacy CSV to modern format | Stream CSV, write Parquet in row groups |
