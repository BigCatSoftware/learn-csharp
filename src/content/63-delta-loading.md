# Watermark-Based Delta Loading

Loading an entire table every time your ETL runs is wasteful and slow. **Delta loading** (also
called incremental loading) extracts only the rows that changed since the last run. The most common
approach uses a **watermark** — a value that marks "where we left off."

---

## Why Full Loads Do Not Scale

| Approach | 1M Rows | 10M Rows | 100M Rows |
|---|---|---|---|
| Full load | 2 min | 20 min | 3+ hours |
| Delta load (1% change) | 1 sec | 12 sec | 2 min |

As tables grow, full loads consume more network bandwidth, CPU, I/O, and lock the source system
for longer. Delta loading keeps extract time proportional to the *change volume*, not the total
volume.

---

## Watermark Columns

A watermark column must satisfy two rules:

1. It **increases monotonically** as rows are inserted or updated.
2. It is **indexed** on the source table.

### Common Watermark Choices

| Column Type | Pros | Cons |
|---|---|---|
| `ModifiedDate` (datetime) | Human-readable, widely available | Clock skew, duplicate timestamps |
| `ROWVERSION` / `timestamp` | Guaranteed unique and increasing | Binary, SQL Server-specific |
| Auto-increment `Id` | Simple for insert-only tables | Does not capture updates |
| Change sequence number | Precise, used by CDC | Requires CDC setup |

> **Note:** `ROWVERSION` in SQL Server is *not* a date/time — it is an 8-byte binary counter
> that increments on every row modification. It is the most reliable watermark for SQL Server
> tables.

---

## The High-Water Mark Pattern

```
Run 1: Extract WHERE ModifiedDate > '1900-01-01'  →  max(ModifiedDate) = '2025-03-15 14:30:00'
       Store watermark = '2025-03-15 14:30:00'

Run 2: Extract WHERE ModifiedDate > '2025-03-15 14:30:00'  →  max = '2025-03-16 09:00:00'
       Store watermark = '2025-03-16 09:00:00'

Run 3: Extract WHERE ModifiedDate > '2025-03-16 09:00:00'  →  ...
```

---

## Implementing a Watermark Tracker

```csharp
public class WatermarkTracker
{
    private readonly string _connectionString;

    public WatermarkTracker(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<DateTime> GetWatermarkAsync(string tableName, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new SqlCommand(@"
            SELECT WatermarkValue
            FROM etl.Watermarks
            WHERE TableName = @TableName", conn);

        cmd.Parameters.AddWithValue("@TableName", tableName);

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is DBNull or null
            ? DateTime.MinValue
            : DateTime.Parse((string)result);
    }

    public async Task SetWatermarkAsync(
        string tableName, DateTime watermark, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new SqlCommand(@"
            MERGE etl.Watermarks AS target
            USING (SELECT @TableName AS TableName) AS source
            ON target.TableName = source.TableName
            WHEN MATCHED THEN
                UPDATE SET WatermarkValue = @Watermark, LastUpdated = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT (TableName, WatermarkValue, LastUpdated)
                VALUES (@TableName, @Watermark, GETUTCDATE());", conn);

        cmd.Parameters.AddWithValue("@TableName", tableName);
        cmd.Parameters.AddWithValue("@Watermark", watermark.ToString("o"));
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
```

The watermark table schema:

```sql
CREATE SCHEMA etl;
GO

CREATE TABLE etl.Watermarks (
    TableName     NVARCHAR(256) PRIMARY KEY,
    WatermarkValue NVARCHAR(256) NOT NULL,
    LastUpdated    DATETIME2     NOT NULL DEFAULT GETUTCDATE()
);
```

---

## Using ROWVERSION as Watermark

`ROWVERSION` is stored as `byte[8]`. Compare it as a binary value:

```csharp
public async Task<byte[]> GetRowVersionWatermarkAsync(string tableName, CancellationToken ct)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new SqlCommand(@"
        SELECT WatermarkBinary FROM etl.Watermarks WHERE TableName = @Table", conn);
    cmd.Parameters.AddWithValue("@Table", tableName);

    var result = await cmd.ExecuteScalarAsync(ct);
    return result is DBNull or null ? new byte[8] : (byte[])result;
}

public async Task ExtractDeltaByRowVersionAsync(
    string sourceTable, byte[] lastWatermark, CancellationToken ct)
{
    await using var conn = new SqlConnection(_sourceConnectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new SqlCommand($@"
        SELECT *, @@DBTS AS CurrentDbts
        FROM {sourceTable}
        WHERE RowVer > @LastWatermark
        ORDER BY RowVer", conn);

    cmd.Parameters.Add("@LastWatermark", SqlDbType.Binary, 8).Value = lastWatermark;

    await using var reader = await cmd.ExecuteReaderAsync(ct);
    // Stream rows to destination...
}
```

> **Tip:** `@@DBTS` returns the current database timestamp value. Capture it at the start of
> your extract query and use it as the next watermark — this avoids missing rows that were
> modified during extraction.

---

## Handling Deletes

Delta loading naturally captures inserts and updates, but deletes are invisible unless you plan
for them.

### Strategy 1: Soft Deletes

The source table has an `IsDeleted` or `DeletedDate` column:

```csharp
await using var cmd = new SqlCommand(@"
    SELECT *
    FROM dbo.Customers
    WHERE ModifiedDate > @Watermark
       OR DeletedDate > @Watermark", conn);
```

### Strategy 2: Tombstone Table

Triggers or application code writes deleted keys to a tombstone table:

```sql
CREATE TABLE dbo.Customers_Tombstone (
    CustomerId  INT           NOT NULL,
    DeletedDate DATETIME2     NOT NULL DEFAULT GETUTCDATE()
);

-- Trigger
CREATE TRIGGER trg_Customers_Delete ON dbo.Customers AFTER DELETE AS
BEGIN
    INSERT INTO dbo.Customers_Tombstone (CustomerId)
    SELECT CustomerId FROM deleted;
END;
```

```csharp
// In your delta load, also process tombstones
await using var cmd = new SqlCommand(@"
    SELECT CustomerId FROM dbo.Customers_Tombstone WHERE DeletedDate > @Watermark", conn);

// Delete from destination
await using var deleteCmd = new SqlCommand(@"
    DELETE FROM dest.Customers WHERE CustomerId = @Id", destConn);
```

### Strategy 3: Full Reconciliation (Periodic)

Run a full comparison periodically (e.g., weekly) to catch any rows that slipped through:

```csharp
await using var cmd = new SqlCommand(@"
    SELECT d.CustomerId
    FROM dest.Customers d
    LEFT JOIN source.Customers s ON d.CustomerId = s.CustomerId
    WHERE s.CustomerId IS NULL", destConn);
```

> **Important:** Choose your delete strategy based on source system capabilities. If you control
> the source, soft deletes are simplest. If you do not, periodic reconciliation is your safety net.

---

## Idempotent Loads

Delta loads must be **idempotent** — running the same load twice produces the same result. Use
MERGE (upsert) at the destination:

```csharp
private async Task UpsertBatchAsync(
    List<CustomerRecord> batch, SqlConnection conn, CancellationToken ct)
{
    // Load batch into a temp table, then MERGE
    await using var createTemp = new SqlCommand(@"
        CREATE TABLE #StagingCustomers (
            CustomerId   INT PRIMARY KEY,
            Name         NVARCHAR(200),
            Email        NVARCHAR(200),
            ModifiedDate DATETIME2
        )", conn);
    await createTemp.ExecuteNonQueryAsync(ct);

    // Bulk copy into temp table
    await using var bulk = new SqlBulkCopy(conn)
    {
        DestinationTableName = "#StagingCustomers"
    };
    await bulk.WriteToServerAsync(ToDataTable(batch), ct);

    // MERGE into production table
    await using var merge = new SqlCommand(@"
        MERGE dbo.Customers AS target
        USING #StagingCustomers AS source ON target.CustomerId = source.CustomerId
        WHEN MATCHED AND source.ModifiedDate > target.ModifiedDate THEN
            UPDATE SET
                Name = source.Name,
                Email = source.Email,
                ModifiedDate = source.ModifiedDate
        WHEN NOT MATCHED THEN
            INSERT (CustomerId, Name, Email, ModifiedDate)
            VALUES (source.CustomerId, source.Name, source.Email, source.ModifiedDate);",
        conn);
    await merge.ExecuteNonQueryAsync(ct);

    await using var dropTemp = new SqlCommand("DROP TABLE #StagingCustomers", conn);
    await dropTemp.ExecuteNonQueryAsync(ct);
}
```

---

## Complete Example: Oracle to SQL Server Incremental Sync

```csharp
using Microsoft.Data.SqlClient;
using Oracle.ManagedDataAccess.Client;

public class IncrementalSyncService
{
    private readonly string _oracleConnStr;
    private readonly string _sqlConnStr;
    private readonly WatermarkTracker _watermarks;

    public IncrementalSyncService(string oracleConn, string sqlConn)
    {
        _oracleConnStr = oracleConn;
        _sqlConnStr = sqlConn;
        _watermarks = new WatermarkTracker(sqlConn);
    }

    public async Task SyncOrdersAsync(CancellationToken ct)
    {
        string tableName = "ORDERS";
        var lastWatermark = await _watermarks.GetWatermarkAsync(tableName, ct);
        Console.WriteLine($"Last watermark: {lastWatermark:o}");

        // Extract from Oracle
        await using var oraConn = new OracleConnection(_oracleConnStr);
        await oraConn.OpenAsync(ct);

        await using var oraCmd = new OracleCommand(@"
            SELECT ORDER_ID, CUSTOMER_ID, ORDER_DATE, TOTAL_AMOUNT, MODIFIED_DATE
            FROM ORDERS
            WHERE MODIFIED_DATE > :watermark
            ORDER BY MODIFIED_DATE",
            oraConn);

        oraCmd.Parameters.Add(":watermark", OracleDbType.Date).Value = lastWatermark;

        await using var reader = await oraCmd.ExecuteReaderAsync(ct);

        // Load into SQL Server staging
        await using var sqlConn = new SqlConnection(_sqlConnStr);
        await sqlConn.OpenAsync(ct);

        await using var truncate = new SqlCommand(
            "TRUNCATE TABLE staging.Orders", sqlConn);
        await truncate.ExecuteNonQueryAsync(ct);

        await using var bulkCopy = new SqlBulkCopy(sqlConn)
        {
            DestinationTableName = "staging.Orders",
            BatchSize = 25_000,
            EnableStreaming = true
        };

        bulkCopy.ColumnMappings.Add("ORDER_ID", "OrderId");
        bulkCopy.ColumnMappings.Add("CUSTOMER_ID", "CustomerId");
        bulkCopy.ColumnMappings.Add("ORDER_DATE", "OrderDate");
        bulkCopy.ColumnMappings.Add("TOTAL_AMOUNT", "TotalAmount");
        bulkCopy.ColumnMappings.Add("MODIFIED_DATE", "ModifiedDate");

        long rowCount = 0;
        bulkCopy.NotifyAfter = 10_000;
        bulkCopy.SqlRowsCopied += (_, e) => rowCount = e.RowsCopied;

        await bulkCopy.WriteToServerAsync(reader, ct);
        Console.WriteLine($"Extracted {rowCount:N0} changed rows from Oracle.");

        // Merge staging into production
        await using var merge = new SqlCommand(@"
            MERGE dbo.Orders AS t
            USING staging.Orders AS s ON t.OrderId = s.OrderId
            WHEN MATCHED AND s.ModifiedDate > t.ModifiedDate THEN
                UPDATE SET t.CustomerId = s.CustomerId,
                           t.OrderDate = s.OrderDate,
                           t.TotalAmount = s.TotalAmount,
                           t.ModifiedDate = s.ModifiedDate
            WHEN NOT MATCHED THEN
                INSERT (OrderId, CustomerId, OrderDate, TotalAmount, ModifiedDate)
                VALUES (s.OrderId, s.CustomerId, s.OrderDate, s.TotalAmount, s.ModifiedDate);",
            sqlConn);
        merge.CommandTimeout = 300;
        int merged = await merge.ExecuteNonQueryAsync(ct);
        Console.WriteLine($"Merged {merged:N0} rows into production.");

        // Update watermark
        await using var maxCmd = new SqlCommand(
            "SELECT MAX(ModifiedDate) FROM staging.Orders", sqlConn);
        var maxDate = await maxCmd.ExecuteScalarAsync(ct);

        if (maxDate is DateTime newWatermark)
        {
            await _watermarks.SetWatermarkAsync(tableName, newWatermark, ct);
            Console.WriteLine($"New watermark: {newWatermark:o}");
        }
    }
}
```

---

## Storing Watermarks Between Runs

| Storage | Pros | Cons |
|---|---|---|
| Database table | Transactional, queryable, team-visible | Requires DB access |
| JSON file | Simple, no dependencies | Not transactional, can be lost |
| Environment variable | Ephemeral, good for containers | Lost on restart |
| Key-value store (Redis) | Fast, shared across instances | Extra infrastructure |

> **Caution:** Always update the watermark *after* the destination load succeeds. If you update
> it first and the load fails, you will skip those rows on the next run.

---

## Summary

| Concept | Implementation |
|---|---|
| Watermark column | `ModifiedDate`, `ROWVERSION`, or auto-increment ID |
| Watermark storage | Database table with MERGE upsert |
| Delta extraction | `WHERE ModifiedDate > @Watermark` |
| Delete handling | Soft deletes, tombstone tables, or periodic reconciliation |
| Idempotency | MERGE (upsert) at the destination |
| Safety | Update watermark only after successful load |
