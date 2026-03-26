# Watermark and Delta Loading

*Chapter 13.5 — Data Engineering Patterns in C#*

## Overview

Full extractions are safe but slow. Extracting 15M rows nightly when only 5K changed
wastes Oracle resources, network bandwidth, and SQL Server load capacity. Delta loading
extracts only what changed since the last run. The high watermark pattern is the
simplest and most reliable approach: track the maximum `ModifiedDate` (or `RowVersion`,
or sequence number) from the last successful load, and on the next run, extract only
rows above that watermark.

This lesson covers watermark table design, different watermark column types, CDC-lite
with `ModifiedDate` and `RowVersion`, handling late-arriving data, and building
robust delta pipelines in C#.

## Core Concepts

### High Watermark
A stored value representing the "high water mark" of what has been successfully loaded.
On the next run, you extract rows where the tracking column exceeds this value.

### Watermark Column Types

| Type | Pros | Cons |
|------|------|------|
| `ModifiedDate` (DATETIME) | Human-readable, widely available | Clock skew, granularity issues |
| `RowVersion` / `ORA_ROWSCN` | Database-managed, always increases | Opaque, not human-readable |
| Sequence / Identity | Monotonically increasing | Only tracks inserts, not updates |
| Transaction ID | Precise ordering | Oracle-specific, complex to use |

### CDC-Lite
Change Data Capture without the full CDC infrastructure. Instead of tailing transaction
logs, you query rows where `ModifiedDate > @watermark`. This is "CDC-lite" because it
catches most changes but can miss edge cases (see Gotchas).

### Late-Arriving Data
Rows that are modified with a timestamp earlier than the current watermark. Example:
a batch job backfills historical job costs with yesterday's date, but the watermark
already advanced past yesterday. The delta query misses these rows.

## Code Examples

### Watermark Table Design

```sql
-- SQL Server watermark tracking table
CREATE TABLE etl.Watermark (
    TableName       NVARCHAR(128)   NOT NULL,
    WatermarkColumn NVARCHAR(128)   NOT NULL,
    WatermarkType   NVARCHAR(20)    NOT NULL,  -- 'DateTime', 'BigInt', 'RowVersion'
    WatermarkValue  NVARCHAR(100)   NOT NULL,  -- Stored as string, parsed by type
    LastRunStartUtc DATETIME2       NOT NULL,
    LastRunEndUtc   DATETIME2       NULL,
    RowsExtracted   INT             NULL,
    RowsLoaded      INT             NULL,
    Status          NVARCHAR(20)    NOT NULL DEFAULT 'Pending',
    CONSTRAINT PK_Watermark PRIMARY KEY (TableName)
);

-- Example rows:
-- TableName: 'cmic.JCDETL', WatermarkColumn: 'MODIFIED_DATE',
--   WatermarkType: 'DateTime', WatermarkValue: '2026-03-23T14:30:00Z'
-- TableName: 'cmic.EQUIP',  WatermarkColumn: 'EQUIP_SEQ',
--   WatermarkType: 'BigInt',   WatermarkValue: '485203'
```

### Watermark Store in C#

```csharp
public interface IWatermarkStore
{
    Task<Watermark?> GetAsync(string tableName, CancellationToken ct);
    Task SaveAsync(Watermark watermark, CancellationToken ct);
    Task MarkCompletedAsync(string tableName, int rowsLoaded, CancellationToken ct);
    Task MarkFailedAsync(string tableName, string error, CancellationToken ct);
}

public record Watermark(
    string TableName,
    string WatermarkColumn,
    WatermarkType Type,
    string Value,
    DateTime LastRunStartUtc);

public enum WatermarkType
{
    DateTime,
    BigInt,
    RowVersion
}

public class SqlWatermarkStore : IWatermarkStore
{
    private readonly SqlConnection _connection;

    public SqlWatermarkStore(SqlConnection connection)
        => _connection = connection;

    public async Task<Watermark?> GetAsync(
        string tableName, CancellationToken ct)
    {
        const string sql = @"
            SELECT TableName, WatermarkColumn, WatermarkType,
                   WatermarkValue, LastRunStartUtc
            FROM etl.Watermark
            WHERE TableName = @tableName
              AND Status = 'Completed'";

        await using var cmd = new SqlCommand(sql, _connection);
        cmd.Parameters.AddWithValue("@tableName", tableName);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
            return null;

        return new Watermark(
            reader.GetString(0),
            reader.GetString(1),
            Enum.Parse<WatermarkType>(reader.GetString(2)),
            reader.GetString(3),
            reader.GetDateTime(4));
    }

    public async Task SaveAsync(Watermark watermark, CancellationToken ct)
    {
        const string sql = @"
            MERGE etl.Watermark AS tgt
            USING (SELECT @tableName AS TableName) AS src
                ON tgt.TableName = src.TableName
            WHEN MATCHED THEN UPDATE SET
                WatermarkValue  = @value,
                LastRunStartUtc = @runStart,
                LastRunEndUtc   = NULL,
                Status          = 'Running'
            WHEN NOT MATCHED THEN INSERT
                (TableName, WatermarkColumn, WatermarkType,
                 WatermarkValue, LastRunStartUtc, Status)
            VALUES
                (@tableName, @column, @type, @value, @runStart, 'Running');";

        await using var cmd = new SqlCommand(sql, _connection);
        cmd.Parameters.AddWithValue("@tableName", watermark.TableName);
        cmd.Parameters.AddWithValue("@column", watermark.WatermarkColumn);
        cmd.Parameters.AddWithValue("@type", watermark.Type.ToString());
        cmd.Parameters.AddWithValue("@value", watermark.Value);
        cmd.Parameters.AddWithValue("@runStart", watermark.LastRunStartUtc);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task MarkCompletedAsync(
        string tableName, int rowsLoaded, CancellationToken ct)
    {
        const string sql = @"
            UPDATE etl.Watermark
            SET Status = 'Completed',
                LastRunEndUtc = SYSUTCDATETIME(),
                RowsLoaded = @rowsLoaded
            WHERE TableName = @tableName";

        await using var cmd = new SqlCommand(sql, _connection);
        cmd.Parameters.AddWithValue("@tableName", tableName);
        cmd.Parameters.AddWithValue("@rowsLoaded", rowsLoaded);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task MarkFailedAsync(
        string tableName, string error, CancellationToken ct)
    {
        const string sql = @"
            UPDATE etl.Watermark
            SET Status = 'Failed',
                LastRunEndUtc = SYSUTCDATETIME()
            WHERE TableName = @tableName";

        await using var cmd = new SqlCommand(sql, _connection);
        cmd.Parameters.AddWithValue("@tableName", tableName);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
```

### Delta Extract with DateTime Watermark

```csharp
public class DeltaExtractor
{
    private readonly IWatermarkStore _watermarks;

    public async Task<DeltaResult> ExtractDeltaAsync(
        OracleConnection source,
        TableConfig config,
        CancellationToken ct)
    {
        // Get the last successful watermark
        var watermark = await _watermarks.GetAsync(config.TableName, ct);
        var since = watermark?.Value ?? "1900-01-01T00:00:00Z";

        // Record the current max BEFORE extracting (for the new watermark)
        var newWatermarkValue = await GetCurrentMaxAsync(
            source, config, ct);

        // Extract rows modified since the watermark
        var sql = $@"
            SELECT *
            FROM {config.FullTableName}
            WHERE {config.WatermarkColumn} > :since
            ORDER BY {config.WatermarkColumn}";

        await using var cmd = new OracleCommand(sql, source);
        cmd.Parameters.Add(":since",
            OracleDbType.TimeStamp).Value = DateTime.Parse(since);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var rows = new List<Dictionary<string, object>>();

        while (await reader.ReadAsync(ct))
        {
            rows.Add(ReadRow(reader));
        }

        return new DeltaResult(
            Rows: rows,
            PreviousWatermark: since,
            NewWatermark: newWatermarkValue,
            IsFullLoad: watermark is null);
    }

    private async Task<string> GetCurrentMaxAsync(
        OracleConnection source,
        TableConfig config,
        CancellationToken ct)
    {
        var sql = $@"
            SELECT MAX({config.WatermarkColumn})
            FROM {config.FullTableName}";

        await using var cmd = new OracleCommand(sql, source);
        var result = await cmd.ExecuteScalarAsync(ct);

        return result is DateTime dt
            ? dt.ToString("O")
            : result?.ToString() ?? DateTime.UtcNow.ToString("O");
    }
}

public record DeltaResult(
    IReadOnlyList<Dictionary<string, object>> Rows,
    string PreviousWatermark,
    string NewWatermark,
    bool IsFullLoad);
```

### Safe Watermark Update (Only After Successful Load)

```csharp
public class DeltaPipeline
{
    private readonly DeltaExtractor _extractor;
    private readonly IWatermarkStore _watermarks;
    private readonly ILogger _logger;

    public async Task RunAsync(TableConfig config, CancellationToken ct)
    {
        // Mark watermark as "Running" before extraction
        var currentWatermark = await _watermarks.GetAsync(config.TableName, ct);

        try
        {
            // Extract delta
            var delta = await _extractor.ExtractDeltaAsync(
                await GetOracleConnectionAsync(ct), config, ct);

            _logger.LogInformation(
                "Table {Table}: extracted {Count} delta rows " +
                "(watermark {Old} → {New})",
                config.TableName, delta.Rows.Count,
                delta.PreviousWatermark, delta.NewWatermark);

            if (delta.Rows.Count == 0)
            {
                _logger.LogInformation("No changes detected, skipping load");
                return;
            }

            // Transform and load
            var loaded = await TransformAndLoadAsync(delta.Rows, config, ct);

            // ONLY advance watermark after successful load
            await _watermarks.SaveAsync(new Watermark(
                config.TableName,
                config.WatermarkColumn,
                config.WatermarkType,
                delta.NewWatermark,
                DateTime.UtcNow), ct);

            await _watermarks.MarkCompletedAsync(
                config.TableName, loaded, ct);
        }
        catch (Exception ex)
        {
            await _watermarks.MarkFailedAsync(
                config.TableName, ex.Message, ct);
            throw;
        }
    }
}
```

### Handling Late-Arriving Data with Overlap Window

```csharp
public class OverlapDeltaExtractor
{
    /// <summary>
    /// Extracts delta with an overlap window to catch late-arriving data.
    /// The overlap window re-extracts rows from the last N hours even if
    /// they were captured in a previous run.
    /// </summary>
    public async Task<IReadOnlyList<RawRow>> ExtractWithOverlapAsync(
        OracleConnection source,
        TableConfig config,
        TimeSpan overlapWindow,
        CancellationToken ct)
    {
        var watermark = await _watermarks.GetAsync(config.TableName, ct);

        // Subtract the overlap window from the watermark
        var effectiveSince = watermark is not null
            ? DateTime.Parse(watermark.Value) - overlapWindow
            : DateTime.MinValue;

        var sql = $@"
            SELECT *
            FROM {config.FullTableName}
            WHERE {config.WatermarkColumn} > :since
            ORDER BY {config.WatermarkColumn}";

        await using var cmd = new OracleCommand(sql, source);
        cmd.Parameters.Add(":since",
            OracleDbType.TimeStamp).Value = effectiveSince;

        // The load step must handle duplicates (MERGE/upsert)
        // because the overlap window re-extracts some rows
        return await ReadAllAsync(cmd, ct);
    }
}
```

### RowVersion-Based Delta (SQL Server Source)

```csharp
public class RowVersionDeltaExtractor
{
    /// <summary>
    /// Uses SQL Server's ROWVERSION (timestamp) column for delta detection.
    /// ROWVERSION is a monotonically increasing binary(8) value that changes
    /// on every UPDATE.
    /// </summary>
    public async Task<IReadOnlyList<RawRow>> ExtractDeltaAsync(
        SqlConnection source,
        string tableName,
        byte[]? lastRowVersion,
        CancellationToken ct)
    {
        var sql = lastRowVersion is not null
            ? $@"SELECT *, CAST(RowVer AS BIGINT) AS RowVerInt
                 FROM {tableName}
                 WHERE RowVer > @lastVersion
                 ORDER BY RowVer"
            : $@"SELECT *, CAST(RowVer AS BIGINT) AS RowVerInt
                 FROM {tableName}
                 ORDER BY RowVer";

        await using var cmd = new SqlCommand(sql, source);

        if (lastRowVersion is not null)
        {
            cmd.Parameters.AddWithValue("@lastVersion", lastRowVersion);
        }

        return await ReadAllAsync(cmd, ct);
    }
}
```

## Common Patterns

### Pattern 1: Watermark Per Table

Each table has its own watermark row. This allows tables to run on different schedules
and recover independently from failures.

### Pattern 2: Capture-Before-Extract

Query `MAX(watermark_column)` BEFORE extracting rows. This ensures the new watermark
is based on source data at extraction time, not after. Rows inserted between extraction
and watermark query are caught on the next run.

### Pattern 3: Two-Phase Watermark Update

1. Before extraction: mark watermark status = 'Running'
2. After successful load: update watermark value and status = 'Completed'
3. On failure: mark status = 'Failed', do NOT advance the watermark

This ensures a failed run re-extracts the same delta on the next attempt.

### Pattern 4: Periodic Full Refresh

Even with delta loading, schedule a full refresh weekly or monthly to catch any rows
that slipped through (late arrivals, clock skew, application bugs that do not update
the tracking column).

```csharp
public LoadType DetermineLoadType(TableConfig config, Watermark? watermark)
{
    // No watermark = first run = full load
    if (watermark is null)
        return LoadType.Full;

    // Weekly full refresh on Sundays
    if (DateTime.UtcNow.DayOfWeek == DayOfWeek.Sunday)
        return LoadType.Full;

    // If last run failed, do full to be safe
    if (watermark.Status == "Failed")
        return LoadType.Full;

    return LoadType.Delta;
}
```

## Gotchas and Pitfalls

### 1. Clock Skew Between Application and Database
If your C# app generates `DateTime.UtcNow` and the Oracle server clock is 2 seconds
behind, rows inserted in that 2-second window are missed. Always use the DATABASE
clock for watermark values: `SELECT SYSDATE FROM DUAL` (Oracle) or `SYSUTCDATETIME()`
(SQL Server).

### 2. Millisecond Truncation
Oracle DATE has second granularity. If two rows are inserted in the same second, the
watermark captures one but the `>` comparison misses the other. Use TIMESTAMP (with
fractional seconds) in Oracle, or DATETIME2 in SQL Server, for sub-second precision.

### 3. Updates Without ModifiedDate Change
If the application does `UPDATE ... SET amount = 100` without also setting
`modified_date = SYSDATE`, the row is invisible to delta loading. This is the #1
cause of "missing data" in watermark pipelines. Validate with the source team that
ALL update paths touch the tracking column (or use database triggers).

### 4. Deletes Are Invisible
Watermark queries only find rows that exist. If a row is deleted from the source, the
delta pipeline never sees the deletion. Solutions: soft deletes with a `deleted_date`
column, a separate "deleted records" table, or periodic full refresh with comparison.

### 5. Advancing Watermark Before Confirming Load
If you update the watermark value immediately after extraction (before the load
completes), and the load fails, those rows are lost — the next run starts from the
advanced watermark. Always advance the watermark AFTER successful load confirmation.

### 6. Transaction Isolation During Extract
If your Oracle query runs in READ COMMITTED and a long-running transaction commits
after your extraction but with a timestamp before your watermark, you miss those rows.
Use `AS OF SCN` or snapshot isolation for consistent reads.

## Performance Considerations

**Delta vs Full Load Performance:**

| Metric | Full Load (15M rows) | Delta Load (5K rows) |
|--------|---------------------|---------------------|
| Oracle read time | 3-5 min | <1 sec |
| Network transfer | 5-10 GB | 2-5 MB |
| SQL Server load | 2-3 min | <1 sec |
| Transform time | 1-2 min | <1 sec |
| Total wall clock | 8-12 min | 2-5 sec |

**Indexing the watermark column:**
The delta query `WHERE modified_date > @watermark` must be efficient. Ensure the
watermark column is indexed on the source table. Without an index, every delta query
is a full table scan — negating the benefit of delta loading.

```sql
-- Oracle: index on the watermark column
CREATE INDEX idx_jcdetl_modified ON cmic.jcdetl(modified_date);

-- SQL Server: index on the watermark column
CREATE NONCLUSTERED INDEX IX_JobCost_ModifiedDate
ON dw.FactJobCost(ModifiedDate);
```

## BNBuilders Context

### CMiC Watermark Columns

CMiC tables vary in their tracking column availability:

| CMiC Table | Watermark Column | Type | Notes |
|------------|-----------------|------|-------|
| JCDETL | MODIFIED_DATE | DATE | Updated on every change |
| EQUIP | EQUIP_SEQ | NUMBER | Sequence, inserts only |
| APINV | LAST_UPD_DATE | DATE | Nullable — requires fallback |
| PODETL | MODIFIED_DATE | DATE | Reliable |
| EMPL | MODIFIED_DATE | DATE | Reliable |
| JCHEAD | MODIFIED_DATE | DATE | May not update on child changes |

### Job Cost Delta Strategy

Job cost detail (JCDETL) is the highest-volume table. Delta loading reduces nightly
extract from ~10 minutes to ~5 seconds on typical days. But during month-end close,
accountants may post adjustments with backdated posting dates. Use a 48-hour overlap
window during the first week of each month to catch backdated entries.

```csharp
var overlapWindow = DateTime.UtcNow.Day <= 7
    ? TimeSpan.FromHours(48)   // First week: catch month-end adjustments
    : TimeSpan.FromHours(4);   // Normal: 4-hour safety margin
```

### Equipment Tracking

Equipment table uses a sequence (EQUIP_SEQ) as the watermark. This only catches new
inserts, not updates to existing equipment records. Pair with a weekly full refresh
to catch equipment status changes.

### Handling CMiC Custom Fields

CMiC allows custom fields that may not trigger `MODIFIED_DATE` updates. If BNBuilders
uses custom fields on job cost records, those changes are invisible to delta loading.
The fix is a database trigger on the CMiC side (if the DBA allows it) or a periodic
full refresh with hash-based change detection on the SQL Server side.

## Interview / Senior Dev Questions

1. **"Why not just use full loads every time?"**
   Cost. A full load of 15M rows takes 10+ minutes, consumes Oracle CPU, saturates
   the network, and puts load on SQL Server. Delta loads process only changes (~5K
   rows typically) in seconds. Multiply by 30+ tables running multiple times daily.

2. **"How do you handle deletes in a watermark-based pipeline?"**
   Watermark queries only find existing rows. Options: (a) soft deletes with a tracking
   column, (b) a separate audit/tombstone table, (c) periodic full refresh with
   EXCEPT comparison to detect missing rows, (d) full CDC if available.

3. **"What happens if the watermark column is not indexed?"**
   Every delta query becomes a full table scan. On a 15M-row table, this takes as long
   as a full extract but returns only 5K rows — worst of both worlds.

4. **"How would you recover from a corrupted watermark?"**
   Reset the watermark to a known-good point (e.g., 7 days ago) and let the pipeline
   re-extract that window. The load step must be idempotent (MERGE/upsert) so that
   re-extracted rows do not create duplicates.

## Quiz

### Question 1
Your watermark for `cmic.JCDETL` is `2026-03-23T14:30:00Z`. A batch job inserts 200
rows with `MODIFIED_DATE = 2026-03-22T00:00:00Z`. Will the next delta load capture them?

<details>
<summary>Show Answer</summary>

**No.** The delta query uses `WHERE modified_date > '2026-03-23T14:30:00Z'`, so rows
dated March 22 are below the watermark and invisible. This is the late-arriving data
problem. Fix: use an overlap window (subtract 48 hours from the watermark), or detect
these with a periodic full refresh.
</details>

### Question 2
You advance the watermark immediately after extraction but before loading to SQL Server.
The load fails. What happens on the next run?

<details>
<summary>Show Answer</summary>

**Data loss.** The watermark has advanced past the extracted rows, so the next delta
query skips them. Those rows are never loaded. Fix: only advance the watermark AFTER
the load is confirmed successful (two-phase watermark update).
</details>

### Question 3
A CMiC table has a `MODIFIED_DATE` column but it is not indexed. The table has 15M rows.
Your delta query returns 500 rows. How long does the query take?

<details>
<summary>Show Answer</summary>

**As long as a full table scan** — possibly 2-5 minutes for 15M rows. Without an index,
Oracle must scan every row to evaluate `WHERE modified_date > :since`, even though only
500 rows match. Adding an index on `MODIFIED_DATE` reduces this to milliseconds.
</details>

### Question 4
Why should you query `MAX(watermark_column)` BEFORE extracting rows, not after?

<details>
<summary>Show Answer</summary>

If you query MAX after extraction, rows inserted between the extraction query start and
the MAX query may have a timestamp higher than your extraction captured but lower than
the MAX value. Those rows would be skipped on the next run. By capturing MAX before
extraction, the new watermark is conservative — any rows inserted during extraction
will have a timestamp above it and will be caught on the next run.
</details>
