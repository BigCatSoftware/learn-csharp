# Idempotent Pipelines

*Chapter 13.6 — Data Engineering Patterns in C#*

## Overview

An idempotent pipeline produces the same result whether you run it once or ten times
with the same input. This is the single most important property for production data
pipelines. Networks fail. Processes crash. Operators re-run jobs manually. If your
pipeline is not idempotent, each re-run creates duplicates, corrupts aggregations,
or loses data.

This lesson covers idempotent design principles, MERGE/upsert patterns in SQL Server,
deduplication strategies, hash-based change detection, and how to make every stage of
your Oracle-to-SQL Server pipeline safe to re-run.

## Core Concepts

### Idempotency Defined
`f(f(x)) = f(x)` — applying the operation multiple times produces the same result as
applying it once. For pipelines: re-running with the same source data produces the same
destination state.

### Why Pipelines Are Not Idempotent by Default
`INSERT INTO target SELECT * FROM staging` is NOT idempotent. Run it twice, you get
double the rows. Every append-only pattern breaks on re-run.

### Strategies for Idempotency

1. **MERGE/Upsert** — Insert if new, update if exists
2. **Delete-then-insert** — Clear the target window, then insert
3. **Staging + swap** — Load to shadow table, then rename
4. **Hash-based change detection** — Only update rows whose content actually changed
5. **Natural keys** — Use business keys (not surrogate IDs) to detect duplicates

### The Idempotency Contract
Every pipeline step must declare: "If I receive the same input twice, here is what
happens." Extraction is naturally idempotent (re-reading the same data). Loading is
where idempotency breaks without explicit design.

## Code Examples

### MERGE (Upsert) Pattern in SQL Server

```sql
-- The MERGE statement is the gold standard for idempotent loads
MERGE dw.FactJobCost AS tgt
USING staging.JobCost AS src
    ON tgt.JobKey = src.JobKey
   AND tgt.CostCode = src.CostCode
   AND tgt.PostingDate = src.PostingDate
WHEN MATCHED AND (
    tgt.Amount <> src.Amount
    OR tgt.CostType <> src.CostType
) THEN
    UPDATE SET
        tgt.Amount = src.Amount,
        tgt.CostType = src.CostType,
        tgt.ModifiedAtUtc = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (JobKey, CostCode, PostingDate, Amount, CostType, LoadedAtUtc)
    VALUES (src.JobKey, src.CostCode, src.PostingDate,
            src.Amount, src.CostType, SYSUTCDATETIME())
WHEN NOT MATCHED BY SOURCE
    AND tgt.PostingDate >= @windowStart
    AND tgt.PostingDate < @windowEnd
THEN
    DELETE;

-- Output for logging
-- OUTPUT $action, inserted.JobKey, deleted.JobKey;
```

### MERGE Execution from C#

```csharp
public class MergeLoader
{
    private readonly SqlConnection _connection;
    private readonly ILogger _logger;

    public async Task<MergeResult> MergeAsync(
        string targetTable,
        string stagingTable,
        IReadOnlyList<string> matchColumns,
        IReadOnlyList<string> updateColumns,
        CancellationToken ct)
    {
        var matchClause = string.Join(" AND ",
            matchColumns.Select(c => $"tgt.[{c}] = src.[{c}]"));

        var updateClause = string.Join(", ",
            updateColumns.Select(c => $"tgt.[{c}] = src.[{c}]"));

        var insertColumns = matchColumns.Concat(updateColumns).ToList();
        var columnList = string.Join(", ",
            insertColumns.Select(c => $"[{c}]"));
        var valueList = string.Join(", ",
            insertColumns.Select(c => $"src.[{c}]"));

        var sql = $@"
            DECLARE @changes TABLE (Action NVARCHAR(10));

            MERGE {targetTable} AS tgt
            USING {stagingTable} AS src
                ON {matchClause}
            WHEN MATCHED THEN
                UPDATE SET {updateClause},
                    tgt.ModifiedAtUtc = SYSUTCDATETIME()
            WHEN NOT MATCHED BY TARGET THEN
                INSERT ({columnList}, LoadedAtUtc)
                VALUES ({valueList}, SYSUTCDATETIME())
            OUTPUT $action INTO @changes;

            SELECT Action, COUNT(*) AS Cnt
            FROM @changes
            GROUP BY Action;";

        await using var cmd = new SqlCommand(sql, _connection);
        cmd.CommandTimeout = 600;

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var result = new MergeResult();

        while (await reader.ReadAsync(ct))
        {
            var action = reader.GetString(0);
            var count = reader.GetInt32(1);

            switch (action)
            {
                case "INSERT": result = result with { Inserted = count }; break;
                case "UPDATE": result = result with { Updated = count }; break;
                case "DELETE": result = result with { Deleted = count }; break;
            }
        }

        _logger.LogInformation(
            "MERGE {Target}: {Inserted} inserted, {Updated} updated, {Deleted} deleted",
            targetTable, result.Inserted, result.Updated, result.Deleted);

        return result;
    }
}

public record MergeResult(
    int Inserted = 0,
    int Updated = 0,
    int Deleted = 0);
```

### Delete-Then-Insert Pattern

```csharp
public class DeleteInsertLoader
{
    /// <summary>
    /// Idempotent load using delete-then-insert within a transaction.
    /// The delete scope matches the data window being loaded.
    /// </summary>
    public async Task<int> LoadAsync(
        SqlConnection connection,
        string tableName,
        DateOnly windowStart,
        DateOnly windowEnd,
        IReadOnlyList<CleanJobCost> rows,
        CancellationToken ct)
    {
        await using var txn = (SqlTransaction)
            await connection.BeginTransactionAsync(ct);

        try
        {
            // Delete existing rows in the date window
            var deleteSql = $@"
                DELETE FROM {tableName}
                WHERE PostingDate >= @start AND PostingDate < @end";

            await using var deleteCmd = new SqlCommand(
                deleteSql, connection, txn);
            deleteCmd.Parameters.AddWithValue("@start", windowStart);
            deleteCmd.Parameters.AddWithValue("@end", windowEnd);
            var deleted = await deleteCmd.ExecuteNonQueryAsync(ct);

            // Insert new rows
            using var bulk = new SqlBulkCopy(connection, SqlBulkCopyOptions.Default, txn)
            {
                DestinationTableName = tableName,
                BatchSize = 10_000
            };

            using var reader = new ObjectDataReader<CleanJobCost>(rows);
            await bulk.WriteToServerAsync(reader, ct);

            await txn.CommitAsync(ct);

            _logger.LogInformation(
                "Delete-Insert {Table}: deleted {Deleted}, inserted {Inserted}",
                tableName, deleted, rows.Count);

            return rows.Count;
        }
        catch
        {
            await txn.RollbackAsync(ct);
            throw;
        }
    }
}
```

### Hash-Based Change Detection

```csharp
public class HashChangeDetector
{
    /// <summary>
    /// Computes a hash of the row's business columns to detect changes.
    /// Only rows with a different hash are loaded (avoiding unnecessary updates).
    /// </summary>
    public static string ComputeRowHash(CleanJobCost row)
    {
        var input = $"{row.JobKey}|{row.CostCode}|{row.Amount}|" +
                    $"{row.PostingDate:yyyy-MM-dd}|{row.CostType}";

        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes);
    }

    public IReadOnlyList<CleanJobCost> DetectChanges(
        IReadOnlyList<CleanJobCost> sourceRows,
        IReadOnlyDictionary<string, string> existingHashes)
    {
        var changed = new List<CleanJobCost>();

        foreach (var row in sourceRows)
        {
            var newHash = ComputeRowHash(row);
            var key = $"{row.JobKey}|{row.CostCode}|{row.PostingDate:yyyy-MM-dd}";

            if (!existingHashes.TryGetValue(key, out var existingHash)
                || existingHash != newHash)
            {
                changed.Add(row with { RowHash = newHash });
            }
        }

        return changed;
    }
}
```

### Hash Column in SQL Server

```sql
-- Add a hash column to the target table
ALTER TABLE dw.FactJobCost
    ADD RowHash CHAR(64) NULL;

-- MERGE that skips unchanged rows using hash comparison
MERGE dw.FactJobCost AS tgt
USING staging.JobCost AS src
    ON tgt.JobKey = src.JobKey
   AND tgt.CostCode = src.CostCode
   AND tgt.PostingDate = src.PostingDate
WHEN MATCHED AND tgt.RowHash <> src.RowHash THEN
    UPDATE SET
        tgt.Amount = src.Amount,
        tgt.CostType = src.CostType,
        tgt.RowHash = src.RowHash,
        tgt.ModifiedAtUtc = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (JobKey, CostCode, PostingDate, Amount, CostType, RowHash, LoadedAtUtc)
    VALUES (src.JobKey, src.CostCode, src.PostingDate,
            src.Amount, src.CostType, src.RowHash, SYSUTCDATETIME());
```

### Deduplication at Staging

```csharp
public class StagingDeduplicator
{
    /// <summary>
    /// Removes duplicates from staging before MERGE.
    /// Takes the latest row when duplicates exist (by modified date).
    /// </summary>
    public async Task DeduplicateStagingAsync(
        SqlConnection connection,
        string stagingTable,
        IReadOnlyList<string> keyColumns,
        string orderByColumn,
        CancellationToken ct)
    {
        var keyList = string.Join(", ", keyColumns.Select(c => $"[{c}]"));

        var sql = $@"
            WITH Ranked AS (
                SELECT *,
                    ROW_NUMBER() OVER (
                        PARTITION BY {keyList}
                        ORDER BY [{orderByColumn}] DESC
                    ) AS rn
                FROM {stagingTable}
            )
            DELETE FROM Ranked WHERE rn > 1;";

        await using var cmd = new SqlCommand(sql, connection);
        var deleted = await cmd.ExecuteNonQueryAsync(ct);

        _logger.LogInformation(
            "Dedup {Table}: removed {Count} duplicate rows",
            stagingTable, deleted);
    }
}
```

### Idempotent Pipeline Orchestrator

```csharp
public class IdempotentPipeline
{
    public async Task<PipelineResult> RunAsync(
        TableConfig config, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();

        // Step 1: Extract (naturally idempotent — re-reading is safe)
        var rawRows = await ExtractAsync(config, ct);

        // Step 2: Transform (pure function — always idempotent)
        var cleanRows = Transform(rawRows);

        // Step 3: Load to staging (truncate-then-insert — idempotent)
        await TruncateStagingAsync(config.StagingTable, ct);
        await BulkLoadToStagingAsync(config.StagingTable, cleanRows, ct);

        // Step 4: Deduplicate staging (idempotent — removes extras)
        await DeduplicateStagingAsync(config, ct);

        // Step 5: MERGE to target (idempotent — insert or update by key)
        var mergeResult = await MergeToTargetAsync(config, ct);

        // Step 6: Update watermark (only after success)
        await UpdateWatermarkAsync(config, ct);

        return new PipelineResult(
            config.TableName,
            rawRows.Count,
            mergeResult.Inserted + mergeResult.Updated,
            sw.Elapsed);
    }
}
```

## Common Patterns

### Pattern 1: Natural Key Identification

Every idempotent pipeline needs a business key to determine "is this row new or
existing?" For CMiC tables:

| Table | Natural Key |
|-------|-------------|
| JCDETL | (job_number, cost_code, posting_date, transaction_id) |
| EQUIP | (equipment_id) |
| APINV | (invoice_number, vendor_id) |
| EMPL | (employee_id) |

### Pattern 2: Idempotent Staging

```
1. TRUNCATE staging table
2. Bulk load to staging
3. Deduplicate staging
4. MERGE from staging to target
```

Each step is individually idempotent. The sequence as a whole is idempotent.

### Pattern 3: Checkpoint Table

```csharp
public record PipelineCheckpoint(
    string PipelineName,
    string StepName,
    DateTime CompletedAtUtc,
    int RowsProcessed);

// On re-run, skip steps that already completed for this run
public async Task<bool> ShouldSkipStepAsync(
    string pipelineName, string stepName, DateTime runId, CancellationToken ct)
{
    var checkpoint = await GetCheckpointAsync(pipelineName, stepName, runId, ct);
    return checkpoint is not null;
}
```

## Gotchas and Pitfalls

### 1. MERGE Is Not Atomic by Default
Without `HOLDLOCK` or serializable isolation, concurrent MERGE operations can insert
duplicates. Always use:

```sql
MERGE dw.FactJobCost WITH (HOLDLOCK) AS tgt ...
```

### 2. IDENTITY Columns Break Idempotency
If your target table has an `IDENTITY` column as the PK, re-running an insert creates
a new row with a different ID. Use natural/business keys for the MERGE match, not
surrogate identities.

### 3. Hash Collisions
SHA-256 has a vanishingly small collision probability, but if you use a shorter hash
(CRC32, MD5 truncated), collisions become possible. Stick with SHA-256 (64 hex chars)
for production row hashes.

### 4. DELETE in MERGE Scope
`WHEN NOT MATCHED BY SOURCE THEN DELETE` deletes ALL target rows not in the staging
table. If your staging only contains a delta (not the full table), this deletes rows
that simply were not part of this delta. Scope the delete with a WHERE clause matching
the data window.

### 5. Staging Table Schema Drift
If the source table adds a column and your staging table does not have it, the
`SqlBulkCopy` fails. Keep staging table schemas in sync with source schemas, or use
a schema-discovery step at pipeline start.

### 6. Non-Deterministic Transforms
If your transform includes `DateTime.UtcNow` or `Guid.NewGuid()`, the same input
produces different output on each run. Hash-based change detection sees every row as
"changed." Use deterministic values: derive timestamps from source data, not wall clock.

## Performance Considerations

| Strategy | Speed | Safety | Complexity |
|----------|-------|--------|------------|
| INSERT (append) | Fastest | Not idempotent | Lowest |
| DELETE + INSERT | Fast | Idempotent within window | Low |
| MERGE | Moderate | Fully idempotent | Medium |
| MERGE + Hash | Slower (hash compute) | Minimal unnecessary writes | Highest |

**MERGE performance tips:**

- Index the target table's match columns (the ON clause)
- Keep the staging table small (delta only, not full table)
- Use `OPTION (RECOMPILE)` if staging table size varies wildly
- Avoid triggers on the target table during MERGE operations
- Use `OUTPUT` clause for audit logging instead of separate queries

**Hash computation cost:**

```
SHA-256 of a 200-byte row: ~0.5 microseconds
For 1M rows: ~0.5 seconds
```

This is negligible compared to I/O. The savings from avoiding unnecessary UPDATE
statements (which generate transaction log) far outweigh the hash computation cost.

## BNBuilders Context

### Job Cost Idempotency

CMiC job cost records can be adjusted during month-end close. The same
(job, cost_code, posting_date) combination might be modified multiple times. The MERGE
pattern ensures adjustments overwrite previous values without creating duplicates.

### Equipment Deduplication

Equipment transfers between jobs can generate duplicate entries in CMiC extract views.
The staging deduplication step (ROW_NUMBER partition by equipment_id, job_number)
ensures each equipment-job assignment appears exactly once in the warehouse.

### Re-Run Safety for BI

Power BI reports read from the warehouse. If a pipeline re-run creates duplicates,
every report that sums amounts shows inflated numbers. Idempotent pipelines ensure
that re-runs do not change BI outputs unless source data actually changed.

### Change Order Tracking

Change orders in CMiC go through approval workflows. A change order might be extracted
multiple times as its status changes (Pending -> Approved -> Executed). The MERGE
pattern updates the status column without creating new rows, and the hash-based
detection avoids unnecessary updates when only the extract timestamp changes but the
actual data is identical.

### Audit Trail

BNBuilders may need to show auditors when data was loaded and modified. The MERGE
pattern with `LoadedAtUtc` (on INSERT) and `ModifiedAtUtc` (on UPDATE) provides
a built-in audit trail. Hash columns add verifiability — you can re-hash source data
and compare to stored hashes to prove data integrity.

## Interview / Senior Dev Questions

1. **"What makes a pipeline idempotent?"**
   Running it multiple times with the same input produces the same destination state.
   This requires: (a) deterministic transforms, (b) upsert/merge load strategy,
   (c) business keys for row identity, (d) scoped deletes if using delete-then-insert.

2. **"MERGE vs delete-then-insert: when would you choose each?"**
   MERGE: when you need to track inserts vs updates separately, when deletes must be
   selective, when you want minimal transaction log. Delete-then-insert: when the data
   window is well-defined, when MERGE complexity is not justified, when you want
   simpler debugging.

3. **"How does hash-based change detection help?"**
   It prevents unnecessary UPDATEs. Without it, MERGE updates every matched row even
   if values are identical, generating transaction log and triggering any UPDATE
   triggers. Hash comparison adds a WHERE clause that skips unchanged rows.

4. **"What is the danger of WHEN NOT MATCHED BY SOURCE THEN DELETE?"**
   If staging contains only a delta (not the full table), this deletes all target rows
   not in the delta — effectively deleting most of your data. Scope the delete to the
   data window or omit it entirely for delta loads.

## Quiz

### Question 1
You run an INSERT-based pipeline twice with the same 1000-row delta. How many rows
are in the target table?

<details>
<summary>Show Answer</summary>

**2000 rows.** INSERT is not idempotent — each run appends 1000 rows. Fix: use MERGE
to match on business keys (upsert), or use delete-then-insert scoped to the data window.
</details>

### Question 2
Your MERGE statement uses `WHEN NOT MATCHED BY SOURCE THEN DELETE`. Staging contains
a 1-day delta (500 rows). The target table has 5M rows. What happens?

<details>
<summary>Show Answer</summary>

**4,999,500 rows are deleted.** `NOT MATCHED BY SOURCE` deletes all target rows not
present in the staging table. Since staging only has 500 rows (one day's delta), the
other 4,999,500 rows are considered "not matched" and deleted. Fix: add a WHERE clause
to scope the delete to the date window: `AND tgt.PostingDate >= @start AND tgt.PostingDate < @end`.
</details>

### Question 3
Your transform step includes `LoadedAtUtc = DateTime.UtcNow`. You re-run the pipeline
with the same source data. Hash-based change detection marks every row as "changed."
Why?

<details>
<summary>Show Answer</summary>

`DateTime.UtcNow` is non-deterministic — it produces a different value on each run.
If `LoadedAtUtc` is included in the hash computation, the hash changes even though
business data is identical. Fix: exclude audit/metadata columns from the hash. Only
hash business-meaningful columns (JobKey, CostCode, Amount, etc.).
</details>

### Question 4
Why should you use `WITH (HOLDLOCK)` on a MERGE statement?

<details>
<summary>Show Answer</summary>

Without `HOLDLOCK`, a race condition exists: two concurrent MERGE operations both check
"row does not exist," then both INSERT, creating a duplicate. `HOLDLOCK` acquires a
serializable lock on the match range, preventing concurrent inserts of the same key.
This is critical in pipelines that may run overlapping instances.
</details>

### Question 5
A table has an `IDENTITY` primary key and a natural key of `(JobNumber, CostCode, PostingDate)`.
Your MERGE matches on the IDENTITY column. Is this idempotent?

<details>
<summary>Show Answer</summary>

**No.** IDENTITY values are generated on insert and differ between runs. If you delete
and re-insert, the new row gets a different IDENTITY value. The MERGE match on IDENTITY
never finds the previously inserted row (different ID), so it inserts a duplicate. Fix:
match on the natural key `(JobNumber, CostCode, PostingDate)` instead of the IDENTITY column.
</details>
