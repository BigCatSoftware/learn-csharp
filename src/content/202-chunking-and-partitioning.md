# Chunking and Partitioning

*Chapter 13.3 — Data Engineering Patterns in C#*

## Overview

When you need to extract millions of rows from Oracle, you cannot simply `SELECT *` and
hope for the best. The query will hold a cursor open for minutes, consume enormous
memory, and a single network hiccup kills the entire read. Chunking breaks the work
into manageable pieces. Partitioning distributes those pieces across parallel workers.

This lesson covers ROWID-based chunking from Oracle, primary-key-based chunking for
SQL Server, how to choose chunk sizes, and how to process chunks in parallel with
bounded concurrency in C#.

## Core Concepts

### Chunking

Dividing a large dataset into smaller, bounded subsets that can be processed independently.
Each chunk is a self-contained unit of work with a defined start and end boundary.

### Partitioning

Distributing chunks across parallel workers. Chunking is about *what* to process;
partitioning is about *how many workers* process it simultaneously.

### ROWID Chunking (Oracle)

Oracle's `DBMS_PARALLEL_EXECUTE` package (or manual ROWID range queries) splits a table
into chunks based on physical row locations. This is the fastest way to parallelize
reads from Oracle because ROWID ranges map directly to data blocks — no index required.

### PK-Based Chunking

For tables with a numeric or sequential primary key, you can chunk by key range:
`WHERE id BETWEEN @start AND @end`. Works on both Oracle and SQL Server.

### Cursor-Based Chunking

For tables without a suitable PK or ROWID access, you can use `OFFSET/FETCH` or
keyset pagination: `WHERE id > @lastId ORDER BY id FETCH FIRST @size ROWS ONLY`.

## Code Examples

### ROWID Chunking from Oracle

```csharp
public class OracleRowIdChunker
{
    private readonly OracleConnection _connection;

    public OracleRowIdChunker(OracleConnection connection)
        => _connection = connection;

    /// <summary>
    /// Uses DBMS_PARALLEL_EXECUTE to generate ROWID ranges for a table.
    /// Each range can be queried independently and in parallel.
    /// </summary>
    public async Task<IReadOnlyList<RowIdRange>> GetChunksAsync(
        string owner, string tableName, int chunkSize, CancellationToken ct)
    {
        var taskName = $"CHUNK_{tableName}_{DateTime.UtcNow:yyyyMMddHHmmss}";

        // Create a chunking task
        await ExecuteAsync($@"
            BEGIN
                DBMS_PARALLEL_EXECUTE.CREATE_TASK('{taskName}');
                DBMS_PARALLEL_EXECUTE.CREATE_CHUNKS_BY_ROWID(
                    task_name   => '{taskName}',
                    table_owner => '{owner}',
                    table_name  => '{tableName}',
                    by_row      => TRUE,
                    chunk_size  => {chunkSize}
                );
            END;", ct);

        // Read the generated chunks
        var chunks = new List<RowIdRange>();
        const string query = @"
            SELECT start_rowid, end_rowid
            FROM user_parallel_execute_chunks
            WHERE task_name = :taskName
            ORDER BY chunk_id";

        await using var cmd = new OracleCommand(query, _connection);
        cmd.Parameters.Add(":taskName", OracleDbType.Varchar2).Value = taskName;

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            chunks.Add(new RowIdRange(
                reader.GetString(0),
                reader.GetString(1)));
        }

        // Clean up the task
        await ExecuteAsync($@"
            BEGIN
                DBMS_PARALLEL_EXECUTE.DROP_TASK('{taskName}');
            END;", ct);

        return chunks;
    }

    private async Task ExecuteAsync(string sql, CancellationToken ct)
    {
        await using var cmd = new OracleCommand(sql, _connection);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}

public record RowIdRange(string StartRowId, string EndRowId);
```

### Querying a ROWID Chunk

```csharp
public async Task<IReadOnlyList<RawJobCost>> ExtractChunkAsync(
    RowIdRange chunk, CancellationToken ct)
{
    const string sql = @"
        SELECT job_number, cost_code, amount, posting_date, cost_type
        FROM cmic.jcdetl
        WHERE ROWID BETWEEN :startRowId AND :endRowId";

    await using var conn = await CreateConnectionAsync(ct);
    await using var cmd = new OracleCommand(sql, conn);
    cmd.Parameters.Add(":startRowId", OracleDbType.Varchar2).Value = chunk.StartRowId;
    cmd.Parameters.Add(":endRowId", OracleDbType.Varchar2).Value = chunk.EndRowId;

    await using var reader = await cmd.ExecuteReaderAsync(ct);
    var results = new List<RawJobCost>();

    while (await reader.ReadAsync(ct))
    {
        results.Add(MapRow(reader));
    }

    return results;
}
```

### PK-Based Chunking

```csharp
public class PrimaryKeyChunker
{
    /// <summary>
    /// Generates chunk ranges based on a numeric primary key.
    /// Works for both Oracle and SQL Server tables.
    /// </summary>
    public async Task<IReadOnlyList<PkRange>> GetChunksAsync(
        DbConnection connection,
        string tableName,
        string pkColumn,
        int chunkSize,
        CancellationToken ct)
    {
        // Get the min and max PK values
        var sql = $"SELECT MIN({pkColumn}), MAX({pkColumn}) FROM {tableName}";
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);

        if (reader.IsDBNull(0) || reader.IsDBNull(1))
            return Array.Empty<PkRange>();

        var min = reader.GetInt64(0);
        var max = reader.GetInt64(1);

        var chunks = new List<PkRange>();
        for (long start = min; start <= max; start += chunkSize)
        {
            var end = Math.Min(start + chunkSize - 1, max);
            chunks.Add(new PkRange(start, end));
        }

        return chunks;
    }
}

public record PkRange(long Start, long End);
```

### Keyset Pagination (Cursor-Based)

```csharp
public async IAsyncEnumerable<IReadOnlyList<T>> ReadInChunksAsync<T>(
    DbConnection connection,
    string tableName,
    string pkColumn,
    int chunkSize,
    Func<DbDataReader, T> mapper,
    [EnumeratorCancellation] CancellationToken ct = default)
{
    long lastId = 0;
    bool hasMore = true;

    while (hasMore)
    {
        var sql = $@"
            SELECT TOP ({chunkSize}) *
            FROM {tableName}
            WHERE {pkColumn} > @lastId
            ORDER BY {pkColumn}";

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;

        var param = cmd.CreateParameter();
        param.ParameterName = "@lastId";
        param.Value = lastId;
        cmd.Parameters.Add(param);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var chunk = new List<T>();

        while (await reader.ReadAsync(ct))
        {
            chunk.Add(mapper(reader));
            lastId = reader.GetInt64(reader.GetOrdinal(pkColumn));
        }

        if (chunk.Count == 0)
        {
            hasMore = false;
        }
        else
        {
            yield return chunk;
        }
    }
}
```

### Parallel Chunk Processing

```csharp
public class ParallelChunkProcessor
{
    private readonly int _maxDegreeOfParallelism;
    private readonly ILogger _logger;

    public ParallelChunkProcessor(int maxDegreeOfParallelism, ILogger logger)
    {
        _maxDegreeOfParallelism = maxDegreeOfParallelism;
        _logger = logger;
    }

    public async Task<ChunkProcessingResult> ProcessChunksAsync<TChunk>(
        IReadOnlyList<TChunk> chunks,
        Func<TChunk, CancellationToken, Task<int>> processChunk,
        CancellationToken ct)
    {
        var totalRows = 0;
        var failedChunks = new ConcurrentBag<(TChunk Chunk, Exception Error)>();
        var sw = Stopwatch.StartNew();

        await Parallel.ForEachAsync(
            chunks,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = _maxDegreeOfParallelism,
                CancellationToken = ct
            },
            async (chunk, token) =>
            {
                try
                {
                    var rows = await processChunk(chunk, token);
                    Interlocked.Add(ref totalRows, rows);
                }
                catch (Exception ex)
                {
                    failedChunks.Add((chunk, ex));
                    _logger.LogError(ex,
                        "Chunk {Chunk} failed", chunk);
                }
            });

        sw.Stop();
        return new ChunkProcessingResult(
            TotalRows: totalRows,
            TotalChunks: chunks.Count,
            FailedChunks: failedChunks.Count,
            Elapsed: sw.Elapsed);
    }
}

public record ChunkProcessingResult(
    int TotalRows,
    int TotalChunks,
    int FailedChunks,
    TimeSpan Elapsed)
{
    public double RowsPerSecond =>
        Elapsed.TotalSeconds > 0 ? TotalRows / Elapsed.TotalSeconds : 0;
}
```

### Choosing Chunk Size Dynamically

```csharp
public class AdaptiveChunkSizer
{
    /// <summary>
    /// Calculates optimal chunk size based on table statistics.
    /// </summary>
    public async Task<int> CalculateChunkSizeAsync(
        DbConnection connection,
        string tableName,
        ChunkSizeConfig config,
        CancellationToken ct)
    {
        // Get total row count estimate
        var rowCount = await EstimateRowCountAsync(connection, tableName, ct);

        // Get average row size in bytes
        var avgRowSize = await EstimateAvgRowSizeAsync(connection, tableName, ct);

        // Target: each chunk should produce ~50 MB of data
        var targetBytesPerChunk = config.TargetChunkMegabytes * 1024L * 1024L;
        var rowsPerChunk = (int)(targetBytesPerChunk / Math.Max(avgRowSize, 1));

        // Clamp to configured bounds
        rowsPerChunk = Math.Clamp(
            rowsPerChunk,
            config.MinChunkSize,
            config.MaxChunkSize);

        // Ensure we don't create too many or too few chunks
        var chunkCount = (int)Math.Ceiling((double)rowCount / rowsPerChunk);

        if (chunkCount < config.MinChunks)
            rowsPerChunk = (int)Math.Ceiling((double)rowCount / config.MinChunks);

        if (chunkCount > config.MaxChunks)
            rowsPerChunk = (int)Math.Ceiling((double)rowCount / config.MaxChunks);

        return rowsPerChunk;
    }
}

public record ChunkSizeConfig(
    int TargetChunkMegabytes = 50,
    int MinChunkSize = 1_000,
    int MaxChunkSize = 500_000,
    int MinChunks = 4,
    int MaxChunks = 100);
```

## Common Patterns

### Pattern 1: Extract-Chunk-Load Pipeline

```csharp
public async Task RunChunkedPipelineAsync(TableConfig table, CancellationToken ct)
{
    // 1. Generate chunks
    var chunks = await _chunker.GetChunksAsync(
        table.Schema, table.Name, table.ChunkSize, ct);

    _logger.LogInformation(
        "Table {Table}: {Count} chunks generated", table.Name, chunks.Count);

    // 2. Process each chunk: extract → transform → load
    await _processor.ProcessChunksAsync(chunks, async (chunk, token) =>
    {
        var raw = await _extractor.ExtractChunkAsync(table, chunk, token);
        var clean = _transformer.Transform(raw);
        return await _loader.LoadAsync(clean, token);
    }, ct);
}
```

### Pattern 2: Progress Reporting Per Chunk

```csharp
public async Task ProcessWithProgressAsync(
    IReadOnlyList<PkRange> chunks,
    IProgress<ChunkProgress> progress,
    CancellationToken ct)
{
    var completed = 0;

    await Parallel.ForEachAsync(chunks, ct, async (chunk, token) =>
    {
        var rows = await ProcessChunkAsync(chunk, token);
        var current = Interlocked.Increment(ref completed);

        progress.Report(new ChunkProgress(
            CompletedChunks: current,
            TotalChunks: chunks.Count,
            RowsInChunk: rows,
            PercentComplete: (double)current / chunks.Count * 100));
    });
}

public record ChunkProgress(
    int CompletedChunks,
    int TotalChunks,
    int RowsInChunk,
    double PercentComplete);
```

### Pattern 3: Retry Failed Chunks

```csharp
public async Task ProcessWithRetryAsync(
    IReadOnlyList<PkRange> chunks, CancellationToken ct)
{
    var failedChunks = new ConcurrentQueue<PkRange>();

    // First pass
    await Parallel.ForEachAsync(chunks, ct, async (chunk, token) =>
    {
        try { await ProcessChunkAsync(chunk, token); }
        catch { failedChunks.Enqueue(chunk); }
    });

    // Retry failed chunks sequentially with backoff
    foreach (var chunk in failedChunks)
    {
        await RetryWithBackoffAsync(
            () => ProcessChunkAsync(chunk, ct),
            maxRetries: 3, ct);
    }
}
```

## Gotchas and Pitfalls

### 1. ROWID Is Not Stable Across Table Reorganizations
Oracle ROWIDs change when a table is rebuilt, moved, or when rows migrate between
blocks. ROWID chunking is for within-a-single-extraction-run, not for tracking rows
across runs. Never store ROWIDs as persistent identifiers.

### 2. Gaps in Primary Keys
PK-based chunking with fixed ranges (`WHERE id BETWEEN 1 AND 10000`) produces uneven
chunks if there are gaps. A range might cover 10K IDs but contain only 50 rows. Use
`NTILE()` or an actual row count to generate balanced ranges.

```sql
-- Generate balanced PK ranges using NTILE
SELECT
    MIN(id) AS range_start,
    MAX(id) AS range_end,
    COUNT(*) AS row_count
FROM (
    SELECT id, NTILE(20) OVER (ORDER BY id) AS chunk_num
    FROM cmic.jcdetl
) t
GROUP BY chunk_num
ORDER BY chunk_num;
```

### 3. Connection Pool Exhaustion
If you process 50 chunks with `MaxDegreeOfParallelism = 50`, you need 50 Oracle
connections simultaneously. Oracle connection limits are typically much lower. Set
parallelism to match your connection pool size, not your chunk count.

### 4. Chunk Size Too Small
Tiny chunks (100 rows) create overhead: connection setup, query parse, network round
trips. For Oracle, the sweet spot is typically 10K-100K rows per chunk, depending on
row width.

### 5. Chunk Size Too Large
Huge chunks (10M rows) defeat the purpose: if a chunk fails, you retry 10M rows.
Memory pressure returns. Balance between overhead and granularity.

### 6. Non-Deterministic Ordering
If your chunking query lacks an `ORDER BY`, rows may appear in different chunks on
different runs. For idempotent pipelines, ensure deterministic chunk boundaries.

## Performance Considerations

| Chunk Size | Overhead | Memory | Retry Cost | Parallelism |
|------------|----------|--------|------------|-------------|
| 1K rows    | Very High | Very Low | Very Low | Excellent |
| 10K rows   | Moderate | Low | Low | Excellent |
| 100K rows  | Low | Moderate | Moderate | Good |
| 1M rows    | Very Low | High | High | Limited |

**Measuring chunk effectiveness:**

```csharp
public void LogChunkStats(IReadOnlyList<ChunkResult> results)
{
    var durations = results.Select(r => r.Elapsed.TotalSeconds).ToList();

    _logger.LogInformation(
        "Chunk stats: Count={Count}, " +
        "Min={Min:F1}s, Max={Max:F1}s, Avg={Avg:F1}s, " +
        "StdDev={StdDev:F1}s, Skew={Skew:F2}",
        results.Count,
        durations.Min(),
        durations.Max(),
        durations.Average(),
        StandardDeviation(durations),
        durations.Max() / durations.Average());
}
```

If `Max / Average > 3`, your chunks are unbalanced. Consider using NTILE-based ranges.

## BNBuilders Context

### CMiC Table Sizes

Typical CMiC tables at a mid-size GC like BNBuilders:

| Table | Approx Rows | Chunking Strategy |
|-------|-------------|-------------------|
| JCDETL (Job Cost Detail) | 5-20M | ROWID or PK (transaction_id) |
| EQUIP (Equipment) | 10-50K | No chunking needed |
| EMPL (Employees) | 1-5K | No chunking needed |
| APINV (AP Invoices) | 500K-2M | PK chunking |
| PODETL (PO Detail) | 200K-1M | PK chunking |
| JCHEAD (Job Headers) | 500-2K | No chunking needed |

### Oracle Connection Limits

CMiC on Oracle typically allows 50-100 concurrent sessions. If you are the only ETL
process, you might claim 10-20. Set `MaxDegreeOfParallelism` to match.

### Chunk Size for CMiC

CMiC job cost detail rows are wide (~40 columns, ~500 bytes each). At 50K rows per
chunk, each chunk is ~25 MB — fits comfortably in memory with room for 10+ parallel
workers on a 4 GB worker process.

### Network Considerations

If Oracle and SQL Server are in the same data center, network latency is <1ms and
bandwidth is high. Larger chunks (100K+) are fine. If Oracle is on-prem and SQL Server
is in Azure, smaller chunks (10K-50K) reduce the blast radius of a network interruption.

## Interview / Senior Dev Questions

1. **"Why use ROWID chunking instead of PK chunking for Oracle?"**
   ROWID maps directly to physical data blocks, so Oracle reads contiguous disk pages.
   PK chunking may scatter reads if the index is fragmented. ROWID chunking also works
   on tables without a suitable numeric PK.

2. **"How do you handle a table with no usable PK and no ROWID access?"**
   Use `OFFSET/FETCH` pagination with a deterministic `ORDER BY`, or create a temporary
   column with `ROW_NUMBER()` and chunk on that. Both are slower than ROWID/PK chunking
   but work universally.

3. **"What happens if a chunk fails midway through processing?"**
   The chunk is retried from the beginning. Chunks should be small enough that retry is
   cheap. The load step must be idempotent (MERGE or delete-then-insert for the chunk's
   key range) so that partial loads do not create duplicates.

4. **"How do you ensure chunks are balanced?"**
   Use Oracle's `DBMS_PARALLEL_EXECUTE` which accounts for row density per block, or
   use SQL `NTILE()` to create equal-count ranges. Monitor chunk duration variance and
   rebalance if `Max / Average > 3`.

## Quiz

### Question 1
You are extracting 15M rows from Oracle CMiC's JCDETL table. The table has a numeric
primary key `transaction_id` with IDs ranging from 1 to 20M (some gaps). You create
chunks of 100K IDs each. What problem might you encounter?

<details>
<summary>Show Answer</summary>

**Uneven chunks.** Gaps in the PK mean some 100K-ID ranges may contain far fewer rows
than others. One chunk might have 95K rows while another has 500. This wastes connection
slots and creates uneven parallel workloads. Fix: use `NTILE()` to create equal-row
ranges, or use ROWID chunking which partitions by physical data blocks.
</details>

### Question 2
Your parallel chunk processor uses `MaxDegreeOfParallelism = 20`, but Oracle only
allows 15 concurrent sessions. What happens?

<details>
<summary>Show Answer</summary>

Connection pool exhaustion. The 16th through 20th workers will block waiting for a
connection from the pool (or throw a timeout exception if the pool wait timeout is
exceeded). Fix: set `MaxDegreeOfParallelism` to match or be less than the connection
pool size (e.g., 12-14 to leave headroom for other processes).
</details>

### Question 3
A chunk of 50K rows fails after loading 30K rows to SQL Server. The pipeline retries
the entire chunk. How do you prevent 30K duplicate rows?

<details>
<summary>Show Answer</summary>

Make the load step idempotent. Options:
1. **Delete-then-insert**: delete all rows in the chunk's key range before loading.
2. **MERGE/upsert**: use `MERGE` to insert or update based on the primary key.
3. **Staging + swap**: load into a staging table, then MERGE from staging to target.

The simplest for chunked loads is delete-then-insert within a transaction, scoped to
the chunk's key range.
</details>

### Question 4
Why is keyset pagination (`WHERE id > @lastId ORDER BY id FETCH FIRST N ROWS ONLY`)
preferred over OFFSET/FETCH for large tables?

<details>
<summary>Show Answer</summary>

OFFSET/FETCH must scan and discard all rows before the offset, making later pages
progressively slower (O(offset + page_size)). Keyset pagination uses an index seek
to jump directly to `@lastId`, making every page equally fast (O(page_size)). For a
table with 15M rows, the last OFFSET/FETCH page would scan all 15M rows, while keyset
pagination scans only the page size.
</details>
