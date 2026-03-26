# ROWID Chunking from Oracle

When extracting millions of rows from Oracle, the classic `OFFSET/FETCH` approach degrades badly
because Oracle must sort and skip rows for every page. **ROWID-based chunking** splits the table
into physical address ranges, allowing truly parallel extraction with no sorting overhead.

---

## Why OFFSET/FETCH Is Slow

```sql
-- Page 1: fast
SELECT * FROM ORDERS ORDER BY ORDER_ID OFFSET 0 ROWS FETCH NEXT 100000 ROWS ONLY;

-- Page 100: slow — Oracle must sort and skip 10 million rows
SELECT * FROM ORDERS ORDER BY ORDER_ID OFFSET 10000000 ROWS FETCH NEXT 100000 ROWS ONLY;
```

| Page Number | Rows Skipped | Typical Time |
|---|---|---|
| 1 | 0 | 0.5 sec |
| 10 | 1,000,000 | 3 sec |
| 100 | 10,000,000 | 45 sec |
| 1,000 | 100,000,000 | 8+ min |

The total extraction time grows quadratically with table size.

> **Note:** ROWID is Oracle's physical row address. It encodes the data file, block, and row
> slot. Scanning by ROWID range requires no sorting — it is a direct physical read.

---

## Oracle DBMS_PARALLEL_EXECUTE

Oracle provides `DBMS_PARALLEL_EXECUTE` to split a table into ROWID chunks:

```sql
-- Create a task
BEGIN
    DBMS_PARALLEL_EXECUTE.CREATE_TASK('EXTRACT_ORDERS');
END;
/

-- Split by ROWID into chunks of ~100,000 rows
BEGIN
    DBMS_PARALLEL_EXECUTE.CREATE_CHUNKS_BY_ROWID(
        task_name   => 'EXTRACT_ORDERS',
        table_owner => 'SCHEMA_OWNER',
        table_name  => 'ORDERS',
        by_row      => TRUE,
        chunk_size  => 100000
    );
END;
/

-- View the chunks
SELECT chunk_id, start_rowid, end_rowid, status
FROM DBA_PARALLEL_EXECUTE_CHUNKS
WHERE task_name = 'EXTRACT_ORDERS'
ORDER BY chunk_id;
```

Each chunk is defined by a `START_ROWID` and `END_ROWID`. You query your table with:

```sql
SELECT * FROM ORDERS
WHERE ROWID BETWEEN :start_rowid AND :end_rowid;
```

This is an index-free physical scan — extremely fast.

---

## Implementing ROWID Chunking in C#

### Step 1: Create Chunks

```csharp
using Oracle.ManagedDataAccess.Client;

public class OracleChunkManager
{
    private readonly string _connectionString;

    public OracleChunkManager(string connectionString) => _connectionString = connectionString;

    public async Task<string> CreateChunksAsync(
        string schemaOwner,
        string tableName,
        int chunkSize = 100_000,
        CancellationToken ct = default)
    {
        string taskName = $"EXTRACT_{tableName}_{DateTime.UtcNow:yyyyMMddHHmmss}";

        await using var conn = new OracleConnection(_connectionString);
        await conn.OpenAsync(ct);

        // Drop task if it exists from a previous run
        try
        {
            await using var drop = new OracleCommand(
                $"BEGIN DBMS_PARALLEL_EXECUTE.DROP_TASK('{taskName}'); END;", conn);
            await drop.ExecuteNonQueryAsync(ct);
        }
        catch (OracleException ex) when (ex.Number == 29498) { /* task does not exist */ }

        // Create task
        await using var create = new OracleCommand(
            $"BEGIN DBMS_PARALLEL_EXECUTE.CREATE_TASK('{taskName}'); END;", conn);
        await create.ExecuteNonQueryAsync(ct);

        // Create ROWID chunks
        await using var chunk = new OracleCommand($@"
            BEGIN
                DBMS_PARALLEL_EXECUTE.CREATE_CHUNKS_BY_ROWID(
                    task_name   => '{taskName}',
                    table_owner => '{schemaOwner}',
                    table_name  => '{tableName}',
                    by_row      => TRUE,
                    chunk_size  => {chunkSize}
                );
            END;", conn);
        await chunk.ExecuteNonQueryAsync(ct);

        Console.WriteLine($"Created ROWID chunks for {schemaOwner}.{tableName} (task: {taskName})");
        return taskName;
    }
```

### Step 2: Retrieve Chunk Ranges

```csharp
    public async Task<List<RowIdChunk>> GetChunksAsync(
        string taskName, CancellationToken ct = default)
    {
        var chunks = new List<RowIdChunk>();

        await using var conn = new OracleConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new OracleCommand($@"
            SELECT CHUNK_ID, START_ROWID, END_ROWID
            FROM USER_PARALLEL_EXECUTE_CHUNKS
            WHERE TASK_NAME = :task
            ORDER BY CHUNK_ID", conn);

        cmd.Parameters.Add(":task", OracleDbType.Varchar2).Value = taskName;

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            chunks.Add(new RowIdChunk(
                ChunkId: reader.GetInt32(0),
                StartRowId: reader.GetString(1),
                EndRowId: reader.GetString(2)));
        }

        Console.WriteLine($"Retrieved {chunks.Count} chunks for task {taskName}");
        return chunks;
    }

    public async Task DropTaskAsync(string taskName, CancellationToken ct = default)
    {
        await using var conn = new OracleConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new OracleCommand(
            $"BEGIN DBMS_PARALLEL_EXECUTE.DROP_TASK('{taskName}'); END;", conn);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}

public record RowIdChunk(int ChunkId, string StartRowId, string EndRowId);
```

---

## Parallel Extraction with Multiple Connections

Each chunk is extracted by a separate task with its own Oracle connection:

```csharp
using System.Threading.Channels;

public class ParallelExtractor
{
    private readonly string _oracleConnStr;
    private readonly int _parallelism;

    public ParallelExtractor(string oracleConnStr, int parallelism = 4)
    {
        _oracleConnStr = oracleConnStr;
        _parallelism = parallelism;
    }

    public ChannelReader<DataRow[]> ExtractAsync(
        string tableName,
        List<RowIdChunk> chunks,
        CancellationToken ct)
    {
        var output = Channel.CreateBounded<DataRow[]>(new BoundedChannelOptions(_parallelism * 2)
        {
            FullMode = BoundedChannelFullMode.Wait
        });

        var chunkQueue = Channel.CreateUnbounded<RowIdChunk>();
        foreach (var chunk in chunks)
            chunkQueue.Writer.TryWrite(chunk);
        chunkQueue.Writer.Complete();

        var workers = Enumerable.Range(0, _parallelism).Select(workerId =>
            Task.Run(async () =>
            {
                await foreach (var chunk in chunkQueue.Reader.ReadAllAsync(ct))
                {
                    try
                    {
                        var rows = await ExtractChunkAsync(tableName, chunk, ct);
                        await output.Writer.WriteAsync(rows, ct);
                        Console.WriteLine(
                            $"Worker {workerId}: chunk {chunk.ChunkId} extracted ({rows.Length} rows)");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(
                            $"Worker {workerId}: chunk {chunk.ChunkId} FAILED: {ex.Message}");
                        throw;
                    }
                }
            }, ct)).ToArray();

        _ = Task.Run(async () =>
        {
            try { await Task.WhenAll(workers); output.Writer.Complete(); }
            catch (Exception ex) { output.Writer.Complete(ex); }
        }, ct);

        return output.Reader;
    }

    private async Task<DataRow[]> ExtractChunkAsync(
        string tableName, RowIdChunk chunk, CancellationToken ct)
    {
        await using var conn = new OracleConnection(_oracleConnStr);
        await conn.OpenAsync(ct);

        await using var cmd = new OracleCommand($@"
            SELECT *
            FROM {tableName}
            WHERE ROWID BETWEEN :startRowId AND :endRowId",
            conn);

        cmd.Parameters.Add(":startRowId", OracleDbType.Varchar2).Value = chunk.StartRowId;
        cmd.Parameters.Add(":endRowId", OracleDbType.Varchar2).Value = chunk.EndRowId;

        var dt = new System.Data.DataTable();
        using var adapter = new OracleDataAdapter(cmd);
        adapter.Fill(dt);

        return dt.Select();
    }
}
```

> **Warning:** Each parallel worker opens its own Oracle connection. Set `_parallelism` based
> on your Oracle server's capacity. Too many connections can overwhelm the database.

---

## Chunk Status Tracking

Track which chunks succeeded, failed, or are in progress:

```csharp
public class ChunkTracker
{
    private readonly ConcurrentDictionary<int, ChunkStatus> _statuses = new();

    public void SetStatus(int chunkId, ChunkStatus status)
    {
        _statuses[chunkId] = status;
    }

    public void PrintSummary()
    {
        var grouped = _statuses.Values.GroupBy(s => s.State).ToDictionary(g => g.Key, g => g.Count());
        Console.WriteLine($"Pending:    {grouped.GetValueOrDefault(ChunkState.Pending)}");
        Console.WriteLine($"InProgress: {grouped.GetValueOrDefault(ChunkState.InProgress)}");
        Console.WriteLine($"Completed:  {grouped.GetValueOrDefault(ChunkState.Completed)}");
        Console.WriteLine($"Failed:     {grouped.GetValueOrDefault(ChunkState.Failed)}");
    }

    public IEnumerable<int> GetFailedChunkIds() =>
        _statuses.Where(kv => kv.Value.State == ChunkState.Failed).Select(kv => kv.Key);
}

public record ChunkStatus(ChunkState State, string? ErrorMessage = null, long RowCount = 0);
public enum ChunkState { Pending, InProgress, Completed, Failed }
```

---

## Error Handling Per Chunk

Failed chunks can be retried independently without re-extracting the entire table:

```csharp
public async Task ExtractWithRetryAsync(
    string tableName,
    List<RowIdChunk> chunks,
    ChannelWriter<DataRow[]> output,
    ChunkTracker tracker,
    int maxRetries,
    CancellationToken ct)
{
    foreach (var chunk in chunks)
    {
        bool success = false;
        for (int attempt = 0; attempt <= maxRetries && !success; attempt++)
        {
            try
            {
                tracker.SetStatus(chunk.ChunkId,
                    new ChunkStatus(ChunkState.InProgress));

                var rows = await ExtractChunkAsync(tableName, chunk, ct);
                await output.WriteAsync(rows, ct);

                tracker.SetStatus(chunk.ChunkId,
                    new ChunkStatus(ChunkState.Completed, RowCount: rows.Length));
                success = true;
            }
            catch (OracleException ex) when (attempt < maxRetries)
            {
                Console.WriteLine(
                    $"Chunk {chunk.ChunkId} attempt {attempt + 1} failed: {ex.Message}");
                await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt)), ct);
            }
            catch (Exception ex)
            {
                tracker.SetStatus(chunk.ChunkId,
                    new ChunkStatus(ChunkState.Failed, ex.Message));
            }
        }
    }
}
```

> **Tip:** After the initial run, query the tracker for failed chunks and retry only those.
> This avoids re-extracting millions of rows that already succeeded.

---

## Combining with SqlBulkCopy: Oracle-to-SQL-Server Migration

The complete end-to-end pipeline:

```csharp
using Microsoft.Data.SqlClient;
using Oracle.ManagedDataAccess.Client;

public class OracleToSqlServerMigrator
{
    private readonly string _oracleConnStr;
    private readonly string _sqlConnStr;
    private readonly int _parallelism;

    public OracleToSqlServerMigrator(string oracleConn, string sqlConn, int parallelism = 4)
    {
        _oracleConnStr = oracleConn;
        _sqlConnStr = sqlConn;
        _parallelism = parallelism;
    }

    public async Task MigrateTableAsync(
        string oracleSchema, string oracleTable,
        string sqlTable, Dictionary<string, string> columnMappings,
        CancellationToken ct)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var tracker = new ChunkTracker();
        long totalRows = 0;

        // Step 1: Create ROWID chunks on Oracle
        var chunkManager = new OracleChunkManager(_oracleConnStr);
        var taskName = await chunkManager.CreateChunksAsync(oracleSchema, oracleTable, 100_000, ct);
        var chunks = await chunkManager.GetChunksAsync(taskName, ct);
        Console.WriteLine($"Created {chunks.Count} chunks.");

        // Step 2: Process chunks in parallel
        var semaphore = new SemaphoreSlim(_parallelism);
        var tasks = chunks.Select(async chunk =>
        {
            await semaphore.WaitAsync(ct);
            try
            {
                tracker.SetStatus(chunk.ChunkId, new ChunkStatus(ChunkState.InProgress));

                // Extract from Oracle
                await using var oraConn = new OracleConnection(_oracleConnStr);
                await oraConn.OpenAsync(ct);

                await using var oraCmd = new OracleCommand($@"
                    SELECT * FROM {oracleSchema}.{oracleTable}
                    WHERE ROWID BETWEEN :startRowId AND :endRowId", oraConn);

                oraCmd.Parameters.Add(":startRowId", OracleDbType.Varchar2).Value = chunk.StartRowId;
                oraCmd.Parameters.Add(":endRowId", OracleDbType.Varchar2).Value = chunk.EndRowId;

                await using var reader = await oraCmd.ExecuteReaderAsync(ct);

                // Load into SQL Server via SqlBulkCopy
                await using var sqlConn = new SqlConnection(_sqlConnStr);
                await sqlConn.OpenAsync(ct);

                await using var bulkCopy = new SqlBulkCopy(sqlConn,
                    SqlBulkCopyOptions.TableLock, transaction: null)
                {
                    DestinationTableName = sqlTable,
                    BatchSize = 25_000,
                    BulkCopyTimeout = 300,
                    EnableStreaming = true
                };

                foreach (var (oracleCol, sqlCol) in columnMappings)
                    bulkCopy.ColumnMappings.Add(oracleCol, sqlCol);

                long chunkRows = 0;
                bulkCopy.NotifyAfter = 50_000;
                bulkCopy.SqlRowsCopied += (_, e) => chunkRows = e.RowsCopied;

                await bulkCopy.WriteToServerAsync(reader, ct);
                Interlocked.Add(ref totalRows, chunkRows);

                tracker.SetStatus(chunk.ChunkId,
                    new ChunkStatus(ChunkState.Completed, RowCount: chunkRows));
            }
            catch (Exception ex)
            {
                tracker.SetStatus(chunk.ChunkId,
                    new ChunkStatus(ChunkState.Failed, ex.Message));
                Console.WriteLine($"Chunk {chunk.ChunkId} failed: {ex.Message}");
            }
            finally
            {
                semaphore.Release();
            }
        }).ToArray();

        await Task.WhenAll(tasks);

        // Step 3: Cleanup
        await chunkManager.DropTaskAsync(taskName, ct);

        sw.Stop();
        Console.WriteLine($"\nMigration complete in {sw.Elapsed}");
        Console.WriteLine($"Total rows: {totalRows:N0}");
        tracker.PrintSummary();

        // Retry failed chunks
        var failedIds = tracker.GetFailedChunkIds().ToList();
        if (failedIds.Any())
        {
            Console.WriteLine($"\n{failedIds.Count} chunks failed. Retry them separately.");
        }
    }
}
```

### Usage

```csharp
var migrator = new OracleToSqlServerMigrator(
    oracleConn: "User Id=reader;Password=secret;Data Source=oracle-prod:1521/ORCL",
    sqlConn: "Server=sql-prod;Database=DataWarehouse;Trusted_Connection=True;",
    parallelism: 8);

var columnMappings = new Dictionary<string, string>
{
    ["ORDER_ID"] = "OrderId",
    ["CUSTOMER_ID"] = "CustomerId",
    ["ORDER_DATE"] = "OrderDate",
    ["TOTAL_AMOUNT"] = "TotalAmount",
    ["STATUS"] = "OrderStatus",
    ["CREATED_DATE"] = "CreatedDate",
    ["MODIFIED_DATE"] = "ModifiedDate"
};

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

await migrator.MigrateTableAsync(
    oracleSchema: "PROD",
    oracleTable: "ORDERS",
    sqlTable: "dbo.Orders",
    columnMappings: columnMappings,
    ct: cts.Token);
```

---

## Performance Comparison

Migrating 50 million rows (ORDERS table, 15 columns):

| Method | Time | Oracle Sessions | Notes |
|---|---|---|---|
| OFFSET/FETCH (single thread) | 4.5 hours | 1 | Quadratic slowdown |
| ROWID chunking (1 thread) | 25 min | 1 | Linear, no sorting |
| ROWID chunking (4 threads) | 8 min | 4 | Near-linear scaling |
| ROWID chunking (8 threads) | 5 min | 8 | Diminishing returns (I/O bound) |

> **Caution:** Increasing parallelism beyond the I/O bandwidth of either the source or
> destination database yields no benefit. Monitor Oracle AWR reports and SQL Server wait
> statistics to find the bottleneck.

---

## Summary

| Concept | Implementation |
|---|---|
| Chunk creation | `DBMS_PARALLEL_EXECUTE.CREATE_CHUNKS_BY_ROWID` |
| Chunk extraction | `WHERE ROWID BETWEEN :start AND :end` |
| Parallelism | Multiple tasks, each with its own Oracle connection |
| Status tracking | `ConcurrentDictionary` with per-chunk state |
| Error handling | Per-chunk retry with exponential backoff |
| Loading to SQL Server | `SqlBulkCopy` with `EnableStreaming` and `TableLock` |
| Cleanup | `DBMS_PARALLEL_EXECUTE.DROP_TASK` |
