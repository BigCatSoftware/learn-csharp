# Parallel Data Pipelines

Real-world data processing rarely fits into a single method. You read from a source, transform the
data, and write to a destination. **System.Threading.Channels** lets you build multi-stage
pipelines where each stage runs concurrently, connected by thread-safe queues.

---

## Why Pipelines?

A naive sequential approach:

```
Read 10M rows (5 min) -> Transform (3 min) -> Write to DB (4 min) = 12 min total
```

A pipelined approach overlaps the stages:

```
Read ──────────────────>
       Transform ──────────────────>
                  Write ──────────────────>
                                           ≈ 6 min total
```

Each stage processes data as soon as it arrives from the previous stage.

---

## Channel Basics

```csharp
using System.Threading.Channels;

// Bounded channel provides backpressure
var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(1000)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleWriter = true,
    SingleReader = true
});

// Producer
await channel.Writer.WriteAsync("Hello");
channel.Writer.Complete();

// Consumer
await foreach (var item in channel.Reader.ReadAllAsync())
{
    Console.WriteLine(item);
}
```

> **Note:** `SingleWriter` and `SingleReader` hints allow the runtime to optimize internal
> synchronization. Set them to `true` when you can guarantee single access.

---

## Producer-Consumer Pattern

```csharp
public static class PipelineStages
{
    public static ChannelReader<string> ReadLines(string filePath, CancellationToken ct)
    {
        var channel = Channel.CreateBounded<string>(5000);

        _ = Task.Run(async () =>
        {
            try
            {
                using var reader = new StreamReader(filePath);
                while (await reader.ReadLineAsync(ct) is { } line)
                {
                    await channel.Writer.WriteAsync(line, ct);
                }
            }
            catch (Exception ex)
            {
                channel.Writer.Complete(ex);
                return;
            }
            channel.Writer.Complete();
        }, ct);

        return channel.Reader;
    }
}
```

> **Important:** Always call `channel.Writer.Complete()` when the producer finishes. If you
> forget, downstream consumers will block forever waiting for more data.

---

## Fan-Out: One Producer, Many Consumers

Distribute work across multiple consumers for CPU-bound transformations:

```csharp
public static ChannelReader<ProcessedRecord> TransformFanOut(
    ChannelReader<string> source,
    int workerCount,
    CancellationToken ct)
{
    var output = Channel.CreateBounded<ProcessedRecord>(5000);

    // Launch multiple consumers on the single input channel
    var workers = Enumerable.Range(0, workerCount).Select(_ => Task.Run(async () =>
    {
        await foreach (var line in source.ReadAllAsync(ct))
        {
            var record = ParseAndTransform(line);
            await output.Writer.WriteAsync(record, ct);
        }
    }, ct)).ToArray();

    // Complete output when all workers finish
    _ = Task.Run(async () =>
    {
        try
        {
            await Task.WhenAll(workers);
            output.Writer.Complete();
        }
        catch (Exception ex)
        {
            output.Writer.Complete(ex);
        }
    }, ct);

    return output.Reader;
}
```

> **Tip:** `ReadAllAsync()` on a single channel is safe to call from multiple consumers.
> Each item is delivered to exactly one consumer — no duplicates.

---

## Fan-In: Many Producers, One Consumer

Merge multiple sources into a single channel:

```csharp
public static ChannelReader<RawRecord> FanIn(
    IEnumerable<ChannelReader<RawRecord>> sources,
    CancellationToken ct)
{
    var output = Channel.CreateBounded<RawRecord>(5000);

    var tasks = sources.Select(source => Task.Run(async () =>
    {
        await foreach (var item in source.ReadAllAsync(ct))
        {
            await output.Writer.WriteAsync(item, ct);
        }
    }, ct)).ToArray();

    _ = Task.Run(async () =>
    {
        try { await Task.WhenAll(tasks); output.Writer.Complete(); }
        catch (Exception ex) { output.Writer.Complete(ex); }
    }, ct);

    return output.Reader;
}
```

---

## Pipeline Error Propagation

Pass exceptions through `Complete(exception)` so downstream stages see the failure:

```csharp
try
{
    await foreach (var item in inputChannel.ReadAllAsync(ct))
    {
        // process...
    }
}
catch (ChannelClosedException ex) when (ex.InnerException is not null)
{
    // The upstream stage failed — propagate to our output
    outputChannel.Writer.Complete(ex.InnerException);
    return;
}
```

> **Warning:** If an upstream stage calls `Complete(exception)`, downstream `ReadAllAsync()`
> will throw `ChannelClosedException` wrapping the original exception. Always handle this.

---

## Graceful Shutdown

```csharp
public class PipelineOrchestrator
{
    private readonly CancellationTokenSource _cts = new();

    public async Task RunAsync(string inputFile, string connectionString)
    {
        var ct = _cts.Token;

        try
        {
            var lines = PipelineStages.ReadLines(inputFile, ct);
            var transformed = TransformFanOut(lines, workerCount: 4, ct);
            await WriteToDatabase(transformed, connectionString, ct);
        }
        catch (OperationCanceledException)
        {
            Console.WriteLine("Pipeline shut down gracefully.");
        }
    }

    public void RequestShutdown() => _cts.Cancel();
}
```

---

## Pipeline Throughput Monitoring

Track rows per second at each stage:

```csharp
public class PipelineMetrics
{
    private long _readCount;
    private long _transformCount;
    private long _writeCount;
    private readonly Stopwatch _stopwatch = Stopwatch.StartNew();

    public void IncrementRead() => Interlocked.Increment(ref _readCount);
    public void IncrementTransform() => Interlocked.Increment(ref _transformCount);
    public void IncrementWrite() => Interlocked.Increment(ref _writeCount);

    public void PrintReport()
    {
        double seconds = _stopwatch.Elapsed.TotalSeconds;
        Console.WriteLine($"Read:      {_readCount:N0} ({_readCount / seconds:N0}/s)");
        Console.WriteLine($"Transform: {_transformCount:N0} ({_transformCount / seconds:N0}/s)");
        Console.WriteLine($"Write:     {_writeCount:N0} ({_writeCount / seconds:N0}/s)");
    }
}
```

---

## Complete Example: 3-Stage CSV-to-Database Pipeline

```csharp
using System.Diagnostics;
using System.Threading.Channels;
using Microsoft.Data.SqlClient;

public record SensorReading(int SensorId, DateTime Timestamp, double Value, string Unit);

public class EtlPipeline
{
    private readonly string _connectionString;
    private readonly PipelineMetrics _metrics = new();

    public EtlPipeline(string connectionString) => _connectionString = connectionString;

    // Stage 1: Read CSV lines
    public ChannelReader<string> ReadCsv(string path, CancellationToken ct)
    {
        var ch = Channel.CreateBounded<string>(new BoundedChannelOptions(10_000)
        {
            SingleWriter = true
        });

        _ = Task.Run(async () =>
        {
            try
            {
                using var sr = new StreamReader(path);
                await sr.ReadLineAsync(ct); // skip header
                while (await sr.ReadLineAsync(ct) is { } line)
                {
                    await ch.Writer.WriteAsync(line, ct);
                    _metrics.IncrementRead();
                }
                ch.Writer.Complete();
            }
            catch (Exception ex) { ch.Writer.Complete(ex); }
        }, ct);

        return ch.Reader;
    }

    // Stage 2: Transform (fan-out across workers)
    public ChannelReader<SensorReading> Transform(
        ChannelReader<string> input, int workers, CancellationToken ct)
    {
        var ch = Channel.CreateBounded<SensorReading>(10_000);

        var tasks = Enumerable.Range(0, workers).Select(_ => Task.Run(async () =>
        {
            await foreach (var line in input.ReadAllAsync(ct))
            {
                var parts = line.Split(',');
                var reading = new SensorReading(
                    int.Parse(parts[0]),
                    DateTime.Parse(parts[1]),
                    double.Parse(parts[2]),
                    parts[3].Trim());
                await ch.Writer.WriteAsync(reading, ct);
                _metrics.IncrementTransform();
            }
        }, ct)).ToArray();

        _ = Task.Run(async () =>
        {
            try { await Task.WhenAll(tasks); ch.Writer.Complete(); }
            catch (Exception ex) { ch.Writer.Complete(ex); }
        }, ct);

        return ch.Reader;
    }

    // Stage 3: Write to database in batches
    public async Task WriteToDatabaseAsync(
        ChannelReader<SensorReading> input, CancellationToken ct)
    {
        var batch = new List<SensorReading>(10_000);

        await foreach (var reading in input.ReadAllAsync(ct))
        {
            batch.Add(reading);
            if (batch.Count >= 10_000)
            {
                await FlushBatchAsync(batch, ct);
                batch.Clear();
            }
        }

        if (batch.Count > 0)
            await FlushBatchAsync(batch, ct);
    }

    private async Task FlushBatchAsync(List<SensorReading> batch, CancellationToken ct)
    {
        var dt = new System.Data.DataTable();
        dt.Columns.Add("SensorId", typeof(int));
        dt.Columns.Add("ReadingTimestamp", typeof(DateTime));
        dt.Columns.Add("MeasuredValue", typeof(double));
        dt.Columns.Add("UnitOfMeasure", typeof(string));

        foreach (var r in batch)
            dt.Rows.Add(r.SensorId, r.Timestamp, r.Value, r.Unit);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var bulk = new SqlBulkCopy(conn)
        {
            DestinationTableName = "dbo.SensorReadings",
            BatchSize = 10_000
        };
        await bulk.WriteToServerAsync(dt, ct);

        foreach (var _ in batch) _metrics.IncrementWrite();
    }

    // Orchestrate
    public async Task RunAsync(string csvPath, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();

        var lines = ReadCsv(csvPath, ct);
        var records = Transform(lines, workers: Environment.ProcessorCount, ct);
        await WriteToDatabaseAsync(records, ct);

        sw.Stop();
        Console.WriteLine($"Pipeline complete in {sw.Elapsed}.");
        _metrics.PrintReport();
    }
}
```

Usage:

```csharp
var pipeline = new EtlPipeline("Server=.;Database=Sensors;Trusted_Connection=True;");
using var cts = new CancellationTokenSource();

Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

await pipeline.RunAsync("/data/sensor_readings_10m.csv", cts.Token);
```

---

## Summary

| Concept | Mechanism |
|---|---|
| Stage connection | `Channel<T>` between stages |
| Backpressure | `BoundedChannelOptions` with `FullMode.Wait` |
| Parallelism within a stage | Fan-out: multiple tasks reading one channel |
| Merging sources | Fan-in: multiple tasks writing one channel |
| Error propagation | `Writer.Complete(exception)` |
| Graceful shutdown | `CancellationToken` threaded through every stage |
| Monitoring | `Interlocked` counters per stage |
