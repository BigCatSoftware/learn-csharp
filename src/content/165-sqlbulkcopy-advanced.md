# SqlBulkCopy — Advanced Patterns

*Chapter 11.6 — ADO.NET and Data Access*

## Overview

`SqlBulkCopy` is the .NET wrapper around SQL Server's bulk insert mechanism — the
fastest way to push large volumes of rows into a table without resorting to BCP or
SSIS. For a data engineer at a construction company moving hundreds of thousands of
cost-code records, daily timesheet imports, or project schedule snapshots, mastering
`SqlBulkCopy` is non-negotiable.

This lesson goes beyond the basics: we cover every `SqlBulkCopyOptions` flag, column
mapping strategies, streaming from different sources, progress notification, batch
tuning, transaction integration, error handling, and writing custom `IDataReader`
implementations that let you transform data mid-stream.

## Core Concepts

### SqlBulkCopyOptions Flags

`SqlBulkCopyOptions` is a `[Flags]` enum. You can combine values with bitwise OR.

| Flag | Value | What It Does |
|------|-------|-------------|
| `Default` | 0 | No options — fastest, least safe. |
| `KeepIdentity` | 1 | Preserves source identity values instead of letting the destination generate them. |
| `CheckConstraints` | 2 | CHECK constraints are evaluated during insert. Without this, they are **skipped**. |
| `TableLock` | 4 | Takes a bulk-update lock on the destination table for the duration of the copy. Dramatically faster for large loads, but blocks all other writers. |
| `KeepNulls` | 8 | Null values from the source remain null in the destination, even if the column has a DEFAULT constraint. Without this flag, defaults replace nulls. |
| `FireTriggers` | 16 | INSERT triggers on the destination table fire. Without this, triggers are **skipped**. |
| `UseInternalTransaction` | 32 | Each batch runs in its own internal transaction. Cannot be combined with an external transaction. |
| `AllowEncryptedValueModifications` | 64 | Allows bulk-copying Always Encrypted data without decrypting. |

### Column Mappings

By default, `SqlBulkCopy` maps columns **by ordinal** — source column 0 goes to
destination column 0. This is fragile. Always use explicit mappings.

### Data Sources

`SqlBulkCopy.WriteToServer` accepts three overloads:

1. **`DataTable`** — convenient for small-to-medium data already in memory.
2. **`IDataReader`** — streaming, forward-only. Best for large datasets.
3. **`DataRow[]`** — subset of a `DataTable`. Rarely used.

### Progress Notification

The `SqlRowsCopied` event fires every `NotifyAfter` rows, giving you a running count.
This is essential for long-running loads where you need to report progress or decide
whether to abort.

### Batch Tuning

`BatchSize` controls how many rows are sent in a single batch. The default (`0`) means
all rows go in one batch. This is risky for large loads — a single failure rolls back
everything.

## Code Examples

### Basic Bulk Copy with Options

```csharp
using Microsoft.Data.SqlClient;

public async Task BulkLoadTimesheetData(
    DataTable timesheets,
    string connectionString,
    CancellationToken ct = default)
{
    var options = SqlBulkCopyOptions.TableLock
               | SqlBulkCopyOptions.CheckConstraints
               | SqlBulkCopyOptions.KeepNulls;

    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(ct);

    await using var bulkCopy = new SqlBulkCopy(connection, options, externalTransaction: null)
    {
        DestinationTableName = "dbo.TimesheetEntries",
        BatchSize = 5000,
        BulkCopyTimeout = 600, // seconds
        NotifyAfter = 1000
    };

    bulkCopy.SqlRowsCopied += (sender, e) =>
    {
        Console.WriteLine($"  Copied {e.RowsCopied:N0} rows so far...");
    };

    // Explicit column mappings — source name to destination name
    bulkCopy.ColumnMappings.Add("EmployeeId", "EmployeeId");
    bulkCopy.ColumnMappings.Add("ProjectCode", "ProjectCode");
    bulkCopy.ColumnMappings.Add("CostCode", "CostCode");
    bulkCopy.ColumnMappings.Add("HoursWorked", "HoursWorked");
    bulkCopy.ColumnMappings.Add("EntryDate", "EntryDate");

    await bulkCopy.WriteToServerAsync(timesheets, ct);
}
```

### Streaming from IDataReader (Server-to-Server)

```csharp
public async Task CopyBetweenDatabases(
    string sourceConnStr,
    string destConnStr,
    CancellationToken ct = default)
{
    await using var sourceConn = new SqlConnection(sourceConnStr);
    await using var destConn = new SqlConnection(destConnStr);

    await sourceConn.OpenAsync(ct);
    await destConn.OpenAsync(ct);

    await using var reader = await new SqlCommand(
        "SELECT ProjectId, ProjectName, Status, Budget FROM dbo.Projects WHERE IsActive = 1",
        sourceConn
    ).ExecuteReaderAsync(ct);

    var options = SqlBulkCopyOptions.TableLock | SqlBulkCopyOptions.FireTriggers;

    await using var bulkCopy = new SqlBulkCopy(destConn, options, externalTransaction: null)
    {
        DestinationTableName = "staging.Projects",
        BatchSize = 10000,
        NotifyAfter = 5000
    };

    bulkCopy.ColumnMappings.Add("ProjectId", "ProjectId");
    bulkCopy.ColumnMappings.Add("ProjectName", "ProjectName");
    bulkCopy.ColumnMappings.Add("Status", "Status");
    bulkCopy.ColumnMappings.Add("Budget", "Budget");

    await bulkCopy.WriteToServerAsync(reader, ct);
}
```

### Transaction Integration

```csharp
public async Task BulkLoadWithTransaction(
    IDataReader reader,
    string connectionString,
    CancellationToken ct = default)
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(ct);

    // Begin an explicit transaction
    await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(ct);

    try
    {
        // Truncate staging table inside the same transaction
        await using (var truncCmd = new SqlCommand("TRUNCATE TABLE staging.CostCodes", connection, transaction))
        {
            await truncCmd.ExecuteNonQueryAsync(ct);
        }

        // Do NOT combine UseInternalTransaction with an external transaction — it throws
        await using var bulkCopy = new SqlBulkCopy(
            connection,
            SqlBulkCopyOptions.KeepNulls | SqlBulkCopyOptions.CheckConstraints,
            externalTransaction: transaction)
        {
            DestinationTableName = "staging.CostCodes",
            BatchSize = 5000,
            BulkCopyTimeout = 300
        };

        bulkCopy.ColumnMappings.Add("Code", "CostCode");
        bulkCopy.ColumnMappings.Add("Description", "Description");
        bulkCopy.ColumnMappings.Add("Category", "Category");

        await bulkCopy.WriteToServerAsync(reader, ct);

        await transaction.CommitAsync(ct);
    }
    catch
    {
        await transaction.RollbackAsync(ct);
        throw;
    }
}
```

### Custom IDataReader for Inline Transforms

```csharp
using System.Data;

/// <summary>
/// Wraps an existing IDataReader and applies transformations on the fly.
/// This avoids materializing the entire dataset in memory.
/// </summary>
public class TransformingDataReader : IDataReader
{
    private readonly IDataReader _inner;
    private readonly Func<IDataRecord, int, object> _transform;

    public TransformingDataReader(IDataReader inner, Func<IDataRecord, int, object> transform)
    {
        _inner = inner;
        _transform = transform;
    }

    public object GetValue(int i) => _transform(_inner, i);
    public int FieldCount => _inner.FieldCount;
    public bool Read() => _inner.Read();
    public string GetName(int i) => _inner.GetName(i);
    public int GetOrdinal(string name) => _inner.GetOrdinal(name);
    public Type GetFieldType(int i) => _inner.GetFieldType(i);
    public string GetDataTypeName(int i) => _inner.GetDataTypeName(i);

    // Forward remaining IDataReader members to _inner...
    public void Close() => _inner.Close();
    public void Dispose() => _inner.Dispose();
    public bool IsClosed => _inner.IsClosed;
    public int Depth => _inner.Depth;
    public DataTable GetSchemaTable() => _inner.GetSchemaTable()!;
    public bool NextResult() => _inner.NextResult();
    public int RecordsAffected => _inner.RecordsAffected;

    // Indexers
    public object this[int i] => GetValue(i);
    public object this[string name] => GetValue(GetOrdinal(name));

    // Type-specific getters — delegate to GetValue and cast
    public bool GetBoolean(int i) => (bool)GetValue(i);
    public byte GetByte(int i) => (byte)GetValue(i);
    public long GetBytes(int i, long o, byte[]? b, int bo, int l) => _inner.GetBytes(i, o, b, bo, l);
    public char GetChar(int i) => (char)GetValue(i);
    public long GetChars(int i, long o, char[]? b, int bo, int l) => _inner.GetChars(i, o, b, bo, l);
    public IDataReader GetData(int i) => _inner.GetData(i);
    public DateTime GetDateTime(int i) => (DateTime)GetValue(i);
    public decimal GetDecimal(int i) => (decimal)GetValue(i);
    public double GetDouble(int i) => (double)GetValue(i);
    public float GetFloat(int i) => (float)GetValue(i);
    public Guid GetGuid(int i) => (Guid)GetValue(i);
    public short GetInt16(int i) => (short)GetValue(i);
    public int GetInt32(int i) => (int)GetValue(i);
    public long GetInt64(int i) => (long)GetValue(i);
    public string GetString(int i) => (string)GetValue(i);
    public int GetValues(object[] values) => _inner.GetValues(values);
    public bool IsDBNull(int i) => _inner.IsDBNull(i);
}
```

Usage:

```csharp
// Trim all string columns and upper-case the ProjectCode column (ordinal 1)
var transformed = new TransformingDataReader(reader, (record, ordinal) =>
{
    var value = record.GetValue(ordinal);
    if (value is string s)
    {
        s = s.Trim();
        return ordinal == 1 ? s.ToUpperInvariant() : s;
    }
    return value;
});

await bulkCopy.WriteToServerAsync(transformed);
```

### KeepIdentity — Preserving Source IDs

```csharp
// When migrating from a legacy system, you often need to preserve original PKs
var options = SqlBulkCopyOptions.KeepIdentity | SqlBulkCopyOptions.CheckConstraints;

await using var bulkCopy = new SqlBulkCopy(connection, options, transaction)
{
    DestinationTableName = "dbo.LegacyProjects"
};
```

```sql
-- The destination table must have IDENTITY_INSERT capability.
-- SqlBulkCopy with KeepIdentity handles this automatically — no need
-- to run SET IDENTITY_INSERT ON manually.
```

## Common Patterns

### Staging Table Pattern (ETL Standard)

1. Bulk load into a staging table (no constraints, no indexes).
2. Validate/transform with SQL.
3. MERGE or INSERT into the production table.
4. Truncate the staging table.

```sql
-- Step 1: Staging table — intentionally constraint-free
CREATE TABLE staging.CostCodes (
    CostCode    VARCHAR(20),
    Description NVARCHAR(200),
    Category    VARCHAR(50),
    LoadedAt    DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- Step 3: Merge into production
MERGE dbo.CostCodes AS target
USING staging.CostCodes AS source
    ON target.CostCode = source.CostCode
WHEN MATCHED THEN
    UPDATE SET Description = source.Description,
               Category    = source.Category,
               ModifiedAt  = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (CostCode, Description, Category)
    VALUES (source.CostCode, source.Description, source.Category);
```

### Progress Reporting with IProgress<T>

```csharp
public async Task BulkLoadWithProgress(
    IDataReader reader,
    SqlConnection connection,
    IProgress<long> progress,
    CancellationToken ct)
{
    await using var bulkCopy = new SqlBulkCopy(connection)
    {
        DestinationTableName = "staging.Invoices",
        BatchSize = 5000,
        NotifyAfter = 1000
    };

    bulkCopy.SqlRowsCopied += (_, e) => progress.Report(e.RowsCopied);

    await bulkCopy.WriteToServerAsync(reader, ct);
}
```

## Gotchas and Pitfalls

1. **Ordinal mapping is the default.** If source and destination columns are in a
   different order and you forget to add column mappings, data will end up in the
   wrong columns — silently.

2. **`KeepNulls` is not the default.** Without it, SQL Server replaces source NULLs
   with the column's DEFAULT value. This can corrupt your data if you expect NULLs to
   remain NULLs.

3. **`CheckConstraints` is off by default.** You can bulk-load invalid data and only
   discover the problem later when a query hits it. Always enable this for production
   tables (disable it for staging tables where speed matters).

4. **`FireTriggers` is off by default.** If your audit trail depends on INSERT
   triggers, they will not fire during a bulk copy unless you set this flag.

5. **`UseInternalTransaction` + external transaction = exception.** Never combine
   them. Pick one.

6. **`BulkCopyTimeout` defaults to 30 seconds.** For large loads, this is far too
   short. Set it explicitly.

7. **No built-in way to identify which row failed.** If row 49,999 of 50,000 violates
   a constraint, the entire batch fails and you get a generic error. Use the staging
   table pattern to avoid this.

8. **DataTable column types must match.** A `decimal` column in the DataTable mapped
   to an `int` column in SQL Server will throw. Cast in advance.

9. **String truncation.** If your source has `VARCHAR(500)` data and the destination
   is `VARCHAR(100)`, the bulk copy will fail. Validate lengths before loading.

## Performance Considerations

### BatchSize Sweet Spot Analysis

| BatchSize | Memory Footprint | Transaction Risk | Throughput |
|-----------|-----------------|-----------------|------------|
| 0 (all)   | High — entire dataset buffered | Single failure = total rollback | Highest raw speed |
| 1000      | Low             | Low risk per batch | Moderate |
| 5000      | Moderate        | Moderate         | Good balance |
| 10000     | Moderate-High   | Moderate         | Near-peak |
| 50000+    | High            | High per-batch risk | Diminishing returns |

**Recommendation:** Start at 5,000. Profile with your actual data. For tables with
wide rows (many columns, large strings), use a smaller batch. For narrow tables with
simple types, you can go higher.

### TableLock vs Row Locks

- `TableLock` acquires a single bulk-update lock. Eliminates per-row lock escalation.
  Use it during off-hours loads or when exclusive access is acceptable.
- Without `TableLock`, SQL Server takes row-level locks, which can escalate to page or
  table locks anyway for large batches — with more overhead.

### Minimal Logging

To get **minimal logging** (huge performance gain), you need ALL of:
- Simple or bulk-logged recovery model (or target is a heap / has no clustered index).
- `TableLock` option enabled.
- No triggers firing.
- Target table is empty OR has no indexes.

### IDataReader vs DataTable

- `IDataReader`: Streams rows. Never holds the full dataset in memory. Use for large loads.
- `DataTable`: Entire dataset in memory. Convenient for small datasets (<100K rows).

## BNBuilders Context

As a Data Engineer at BNBuilders, `SqlBulkCopy` is your primary tool for:

- **Daily timesheet imports:** Procore or Sage export CSVs with 50K-200K rows. Parse
  with `CsvHelper`, wrap in a custom `IDataReader`, bulk load into staging.
- **Cost code syncs:** Sage 300 CRE pushes cost code updates. Bulk load into staging,
  MERGE into production, notify downstream Power BI datasets.
- **Project budget snapshots:** Nightly job captures a point-in-time snapshot of every
  project's budget. Bulk copy into a date-partitioned archive table.
- **Data migration between environments:** Moving data from the legacy on-prem SQL
  Server to Azure SQL. Use `SqlBulkCopy` with `KeepIdentity` to preserve foreign key
  relationships.
- **ETL pipelines in Azure Data Factory custom activities:** When ADF's built-in copy
  activity isn't flexible enough, a custom .NET activity with `SqlBulkCopy` gives you
  full control over transforms and error handling.

## Interview / Senior Dev Questions

1. **Q: Why would you use `KeepNulls` when loading into a table that has DEFAULT
   constraints?**
   A: Without `KeepNulls`, SQL Server substitutes the DEFAULT value for any source
   NULL. If the source system legitimately uses NULL to mean "no value," this silent
   replacement corrupts data. `KeepNulls` preserves the source's intent.

2. **Q: You need to bulk load 10 million rows and identify any that violate
   constraints. How?**
   A: Load into a staging table with no constraints. Then use a query to identify
   rows that would violate production constraints (e.g., duplicates, NULLs in NOT NULL
   columns, FK violations). Log failures, insert valid rows.

3. **Q: What conditions enable minimal logging with `SqlBulkCopy`?**
   A: Bulk-logged or simple recovery model, `TableLock` option, no triggers, and
   either an empty heap or an empty table with a clustered index. If the table already
   has data and a clustered index, new pages are minimally logged but existing pages
   are fully logged.

4. **Q: You are bulk-copying within an explicit transaction and the app crashes mid-
   load. What happens?**
   A: The transaction is never committed, so SQL Server rolls back all batches that
   were part of that transaction on recovery. No partial data is left behind.

## Quiz

**1. What is the default behavior when `KeepNulls` is NOT set and the source value is NULL?**

<details>
<summary>Show Answer</summary>

SQL Server replaces the NULL with the column's DEFAULT constraint value. If there is no DEFAULT, the NULL is preserved. This can lead to subtle data corruption when you expect NULLs to remain NULLs.
</details>

**2. You set `BatchSize = 5000` and `NotifyAfter = 1000`. If 12,000 rows are loaded, how many times does the `SqlRowsCopied` event fire?**

<details>
<summary>Show Answer</summary>

12 times (at rows 1000, 2000, 3000, ..., 12000). `NotifyAfter` is independent of `BatchSize`. The event fires every 1,000 rows regardless of batch boundaries.
</details>

**3. Can you combine `UseInternalTransaction` with an external `SqlTransaction` passed to the `SqlBulkCopy` constructor?**

<details>
<summary>Show Answer</summary>

No. This combination throws an `InvalidOperationException`. `UseInternalTransaction` creates its own transaction per batch, which conflicts with an external transaction. Choose one strategy or the other.
</details>

**4. Why is the staging table pattern preferred over loading directly into a production table with `CheckConstraints` enabled?**

<details>
<summary>Show Answer</summary>

Because `SqlBulkCopy` provides no way to identify *which* row caused a constraint violation. The entire batch fails with a generic error. By loading into a staging table first (no constraints), you can run validation queries to find and log problem rows, then insert only valid rows into production.
</details>

**5. You need to bulk load data while preserving the source's identity column values. Which flag do you use, and does it require `SET IDENTITY_INSERT ON`?**

<details>
<summary>Show Answer</summary>

Use `SqlBulkCopyOptions.KeepIdentity`. You do NOT need to manually run `SET IDENTITY_INSERT ON` — the `SqlBulkCopy` class handles this internally when the flag is set.
</details>
