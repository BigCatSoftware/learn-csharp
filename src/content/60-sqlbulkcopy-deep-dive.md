# SqlBulkCopy Deep Dive

When you need to load millions of rows into SQL Server, `INSERT` statements — even batched — simply
cannot keep up. **SqlBulkCopy** uses the same TDS (Tabular Data Stream) protocol path as `bcp.exe`
and `BULK INSERT`, giving you native-speed writes from managed C# code.

---

## Basic Usage

```csharp
using Microsoft.Data.SqlClient;

await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();

await using var bulkCopy = new SqlBulkCopy(connection)
{
    DestinationTableName = "dbo.SensorReadings",
    BatchSize = 10_000,
    BulkCopyTimeout = 600 // seconds
};

await bulkCopy.WriteToServerAsync(dataTable);
```

> **Note:** Always prefer `Microsoft.Data.SqlClient` over the legacy `System.Data.SqlClient`.
> The former receives active updates and performance improvements.

---

## Key Properties

| Property | Default | Description |
|---|---|---|
| `BatchSize` | `0` (all rows in one batch) | Number of rows per batch sent to the server |
| `BulkCopyTimeout` | `30` seconds | Time before the operation times out |
| `NotifyAfter` | `0` (disabled) | Raise `SqlRowsCopied` event every N rows |
| `DestinationTableName` | — | Target table (schema-qualify: `dbo.TableName`) |
| `EnableStreaming` | `false` | Stream from `IDataReader` without buffering |

```csharp
bulkCopy.NotifyAfter = 100_000;
bulkCopy.SqlRowsCopied += (sender, e) =>
{
    Console.WriteLine($"Copied {e.RowsCopied:N0} rows so far...");
};
```

---

## SqlBulkCopyOptions Flags

Options are specified as a bitmask in the constructor:

```csharp
var options = SqlBulkCopyOptions.TableLock
            | SqlBulkCopyOptions.CheckConstraints
            | SqlBulkCopyOptions.FireTriggers;

await using var bulkCopy = new SqlBulkCopy(connection, options, transaction: null);
```

| Flag | Effect | When to Use |
|---|---|---|
| `TableLock` | Acquires a bulk-update lock on the target table | Large loads — avoids row-level lock escalation |
| `KeepIdentity` | Preserves source identity values | Migrating data that must keep original IDs |
| `CheckConstraints` | Enforces CHECK constraints during load | When data quality must be validated |
| `FireTriggers` | Fires INSERT triggers on the target table | When triggers maintain audit columns |
| `KeepNulls` | Preserves null values instead of using column defaults | When explicit NULLs are meaningful |
| `UseInternalTransaction` | Each batch commits in its own transaction | When you do not manage an outer transaction |

> **Warning:** `TableLock` prevents concurrent reads on the target table for the duration of the
> bulk copy. Only use it during maintenance windows or on staging tables.

---

## Column Mappings

When source and destination columns differ in name or position, explicit mappings are required:

```csharp
bulkCopy.ColumnMappings.Add("src_id", "SensorId");
bulkCopy.ColumnMappings.Add("reading_ts", "ReadingTimestamp");
bulkCopy.ColumnMappings.Add("value", "MeasuredValue");
bulkCopy.ColumnMappings.Add("unit", "UnitOfMeasure");
```

You can also map by ordinal:

```csharp
bulkCopy.ColumnMappings.Add(0, 2); // source column 0 -> destination column 2
```

> **Important:** If you add *any* column mapping, you must map *every* column you want to copy.
> Unmapped columns receive their default values or NULL.

---

## Streaming with IDataReader

For truly large datasets, avoid loading everything into a `DataTable`. Instead, implement
`IDataReader` or use one directly from another database:

```csharp
await using var sourceConn = new SqlConnection(sourceConnectionString);
await sourceConn.OpenAsync();

await using var cmd = new SqlCommand(
    "SELECT SensorId, ReadingTimestamp, MeasuredValue FROM dbo.Readings WHERE Year = 2025",
    sourceConn);

await using var reader = await cmd.ExecuteReaderAsync();

await using var destConn = new SqlConnection(destConnectionString);
await destConn.OpenAsync();

await using var bulkCopy = new SqlBulkCopy(destConn)
{
    DestinationTableName = "dbo.Readings_Archive",
    BatchSize = 50_000,
    EnableStreaming = true
};

await bulkCopy.WriteToServerAsync(reader);
```

> **Tip:** Set `EnableStreaming = true` when using `IDataReader` to avoid internal buffering.
> This keeps memory usage constant regardless of dataset size.

---

## Custom IDataReader for CSV Files

```csharp
public class CsvDataReader : IDataReader
{
    private readonly StreamReader _reader;
    private string[]? _currentRow;
    private readonly string[] _columns;

    public CsvDataReader(string filePath)
    {
        _reader = new StreamReader(filePath);
        _columns = _reader.ReadLine()!.Split(',');
    }

    public int FieldCount => _columns.Length;

    public bool Read()
    {
        var line = _reader.ReadLine();
        if (line is null) return false;
        _currentRow = line.Split(',');
        return true;
    }

    public object GetValue(int i) => _currentRow![i];
    public string GetName(int i) => _columns[i];
    public int GetOrdinal(string name) => Array.IndexOf(_columns, name);

    // Required interface members (simplified — see full implementation in production)
    public string GetDataTypeName(int i) => "String";
    public Type GetFieldType(int i) => typeof(string);
    public void Close() => _reader.Close();
    public void Dispose() => _reader.Dispose();

    // Remaining IDataReader members omitted for brevity...
    public bool IsClosed => false;
    public int Depth => 0;
    public int RecordsAffected => -1;
    public bool NextResult() => false;
    public DataTable GetSchemaTable() => throw new NotImplementedException();
    public bool GetBoolean(int i) => bool.Parse(_currentRow![i]);
    public int GetInt32(int i) => int.Parse(_currentRow![i]);
    public string GetString(int i) => _currentRow![i];
    // ... other typed getters
}
```

---

## Performance Tuning

### Batch Size Tradeoffs

| Batch Size | Memory Usage | Lock Duration | Logging | Recovery |
|---|---|---|---|---|
| 0 (single batch) | Highest | Longest | Minimal logging possible | All or nothing |
| 1,000 | Low | Short | More log records | Granular rollback |
| 10,000 – 50,000 | Moderate | Moderate | Balanced | Good sweet spot |
| 100,000+ | High | Longer | Balanced | Larger rollback segments |

> **Tip:** Start with `BatchSize = 10_000` and benchmark. Increase if throughput is low and
> memory is available. Decrease if you see lock timeouts or memory pressure.

### Table Lock Benefits

With `SqlBulkCopyOptions.TableLock` on a heap or empty table, SQL Server can use
**minimal logging** (in simple or bulk-logged recovery model), reducing I/O dramatically:

```csharp
// Staging table pattern for maximum throughput
await using var cmd = new SqlCommand("TRUNCATE TABLE dbo.Staging_Readings", destConn);
await cmd.ExecuteNonQueryAsync();

var options = SqlBulkCopyOptions.TableLock;
await using var bulkCopy = new SqlBulkCopy(destConn, options, transaction: null)
{
    DestinationTableName = "dbo.Staging_Readings",
    BatchSize = 50_000
};

await bulkCopy.WriteToServerAsync(reader);
```

---

## Error Handling

```csharp
try
{
    await bulkCopy.WriteToServerAsync(reader);
}
catch (SqlException ex) when (ex.Number == 4815)
{
    Console.WriteLine("Bulk copy failed: column mismatch or data truncation.");
    Console.WriteLine(ex.Message);
}
catch (SqlException ex) when (ex.Number == -2)
{
    Console.WriteLine("Bulk copy timed out. Increase BulkCopyTimeout.");
}
catch (OperationCanceledException)
{
    Console.WriteLine("Bulk copy was cancelled.");
}
```

> **Caution:** When a batch fails without an explicit transaction, previously committed batches
> remain in the table. Always use a transaction or a staging table to ensure atomicity.

---

## Transactions with Bulk Copy

```csharp
await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();
await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

try
{
    await using var bulkCopy = new SqlBulkCopy(connection, SqlBulkCopyOptions.Default, transaction)
    {
        DestinationTableName = "dbo.SensorReadings",
        BatchSize = 25_000,
        BulkCopyTimeout = 300
    };

    bulkCopy.ColumnMappings.Add("SensorId", "SensorId");
    bulkCopy.ColumnMappings.Add("Timestamp", "ReadingTimestamp");
    bulkCopy.ColumnMappings.Add("Value", "MeasuredValue");

    await bulkCopy.WriteToServerAsync(reader);
    await transaction.CommitAsync();
    Console.WriteLine("Bulk load committed successfully.");
}
catch (Exception)
{
    await transaction.RollbackAsync();
    Console.WriteLine("Bulk load rolled back.");
    throw;
}
```

---

## Complete Example: Loading 10M Rows from CSV

```csharp
using Microsoft.Data.SqlClient;

public class BulkLoadService
{
    private readonly string _connectionString;

    public BulkLoadService(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<long> LoadCsvAsync(string csvPath, CancellationToken ct = default)
    {
        long totalRows = 0;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        // Truncate staging table
        await using (var truncate = new SqlCommand("TRUNCATE TABLE dbo.Staging_Readings", connection))
        {
            await truncate.ExecuteNonQueryAsync(ct);
        }

        var options = SqlBulkCopyOptions.TableLock | SqlBulkCopyOptions.CheckConstraints;

        await using var bulkCopy = new SqlBulkCopy(connection, options, transaction: null)
        {
            DestinationTableName = "dbo.Staging_Readings",
            BatchSize = 50_000,
            BulkCopyTimeout = 0, // no timeout
            EnableStreaming = true
        };

        bulkCopy.ColumnMappings.Add("sensor_id", "SensorId");
        bulkCopy.ColumnMappings.Add("timestamp", "ReadingTimestamp");
        bulkCopy.ColumnMappings.Add("value", "MeasuredValue");
        bulkCopy.ColumnMappings.Add("unit", "UnitOfMeasure");

        bulkCopy.NotifyAfter = 500_000;
        bulkCopy.SqlRowsCopied += (_, e) =>
        {
            totalRows = e.RowsCopied;
            Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {e.RowsCopied:N0} rows loaded...");
        };

        await using var reader = new CsvDataReader(csvPath);
        await bulkCopy.WriteToServerAsync(reader, ct);

        // Merge staging into production
        await using var merge = new SqlCommand(@"
            MERGE dbo.SensorReadings AS target
            USING dbo.Staging_Readings AS source
            ON target.SensorId = source.SensorId
               AND target.ReadingTimestamp = source.ReadingTimestamp
            WHEN NOT MATCHED THEN
                INSERT (SensorId, ReadingTimestamp, MeasuredValue, UnitOfMeasure)
                VALUES (source.SensorId, source.ReadingTimestamp,
                        source.MeasuredValue, source.UnitOfMeasure);", connection);

        merge.CommandTimeout = 600;
        int merged = await merge.ExecuteNonQueryAsync(ct);

        Console.WriteLine($"Load complete. {totalRows:N0} staged, {merged:N0} merged.");
        return totalRows;
    }
}
```

---

## Summary

| Concern | Recommendation |
|---|---|
| Small loads (< 10K rows) | Table-valued parameters or batch INSERT |
| Medium loads (10K – 1M) | SqlBulkCopy with `BatchSize = 10_000` |
| Large loads (1M+) | SqlBulkCopy + `TableLock` + staging table + MERGE |
| Memory management | Use `IDataReader` with `EnableStreaming = true` |
| Atomicity | Wrap in explicit transaction or use staging + MERGE |
| Monitoring | Use `NotifyAfter` and `SqlRowsCopied` event |
