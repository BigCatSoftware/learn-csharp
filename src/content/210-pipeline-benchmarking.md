# Pipeline Benchmarking

*Chapter 13.11 — Data Engineering Patterns in C#*

## Overview

"It feels slow" is not a benchmark. Data engineers need precise measurements: how many
rows per second does the extract achieve? How many bytes does the transform allocate?
Where does the pipeline spend its time? Is the new column mapping faster or slower than
the old one?

This lesson covers BenchmarkDotNet for micro-benchmarking pipeline components, measuring
memory allocations, profiling full pipeline runs with `dotnet-trace` and `dotnet-counters`,
identifying bottlenecks with flame graphs, and establishing performance baselines that
prevent regressions.

## Core Concepts

### BenchmarkDotNet
The gold standard for .NET micro-benchmarking. It handles warmup, statistical analysis,
GC measurement, and reporting. Use it for transform functions, serialization, hashing,
and other CPU-bound pipeline components.

### Memory Allocations
In high-throughput pipelines, GC pressure from excessive allocations can dominate
execution time. Measuring allocations reveals which pipeline steps create the most
heap objects and where `Span<T>`, pooling, or streaming can help.

### dotnet-trace
A performance profiler that captures ETW events and CPU sampling data. Produces
`.nettrace` files viewable in Visual Studio, PerfView, or Speedscope (flame graphs).
Use it for full pipeline runs to find the hottest code paths.

### dotnet-counters
A real-time monitoring tool that displays .NET runtime counters: GC collections,
thread pool queue length, exception count, and custom metrics. Use it to observe
pipeline behavior without stopping it.

### Flame Graphs
A visualization of stack traces weighted by time. Wide bars indicate where time is
spent. Use them to find unexpected bottlenecks: a "simple" string trim that runs 15M
times, or a logging call that allocates on every invocation.

## Code Examples

### BenchmarkDotNet: Transform Throughput

```csharp
[MemoryDiagnoser]            // Measure allocations
[SimpleJob(RuntimeMoniker.Net90)]
public class TransformBenchmarks
{
    private IReadOnlyList<RawJobCost> _small = null!;
    private IReadOnlyList<RawJobCost> _medium = null!;
    private IReadOnlyList<RawJobCost> _large = null!;
    private JobCostTransformStep _transform = null!;

    [GlobalSetup]
    public void Setup()
    {
        _transform = new JobCostTransformStep();
        var builder = new JobCostBuilder();

        _small = builder.BuildMany(100);
        _medium = builder.BuildMany(10_000);
        _large = builder.BuildMany(1_000_000);
    }

    [Benchmark(Baseline = true)]
    public async Task<IReadOnlyList<CleanJobCost>> Transform_100()
        => await _transform.ExecuteAsync(_small, CancellationToken.None);

    [Benchmark]
    public async Task<IReadOnlyList<CleanJobCost>> Transform_10K()
        => await _transform.ExecuteAsync(_medium, CancellationToken.None);

    [Benchmark]
    public async Task<IReadOnlyList<CleanJobCost>> Transform_1M()
        => await _transform.ExecuteAsync(_large, CancellationToken.None);
}

// Run with: dotnet run -c Release -- --filter *TransformBenchmarks*
```

**Expected output:**

```
| Method         |  N       |       Mean |   Allocated |
|--------------- |--------- |-----------:|------------:|
| Transform_100  |      100 |   12.34 us |     8.56 KB |
| Transform_10K  |   10,000 |  987.65 us |   820.31 KB |
| Transform_1M   | 1000,000 | 98,765.4 us | 82,031.2 KB |
```

### BenchmarkDotNet: Hash Function Comparison

```csharp
[MemoryDiagnoser]
public class HashBenchmarks
{
    private CleanJobCost _row = null!;

    [GlobalSetup]
    public void Setup()
    {
        _row = new CleanJobCost
        {
            JobKey = "2301-00",
            CostCode = "03100",
            Amount = 1500.00m,
            PostingDate = new DateOnly(2026, 3, 15),
            CostType = CostType.Labor
        };
    }

    [Benchmark(Baseline = true)]
    public string SHA256_Hash()
        => HashChangeDetector.ComputeRowHash(_row);

    [Benchmark]
    public string MD5_Hash()
        => ComputeMD5Hash(_row);

    [Benchmark]
    public int XxHash32()
        => ComputeXxHash(_row);

    private static string ComputeMD5Hash(CleanJobCost row)
    {
        var input = $"{row.JobKey}|{row.CostCode}|{row.Amount}|" +
                    $"{row.PostingDate:yyyy-MM-dd}|{row.CostType}";
        var bytes = MD5.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes);
    }

    private static int ComputeXxHash(CleanJobCost row)
    {
        var input = $"{row.JobKey}|{row.CostCode}|{row.Amount}|" +
                    $"{row.PostingDate:yyyy-MM-dd}|{row.CostType}";
        return (int)XxHash32.HashToUInt32(Encoding.UTF8.GetBytes(input));
    }
}
```

### BenchmarkDotNet: String Allocation Comparison

```csharp
[MemoryDiagnoser]
public class StringBenchmarks
{
    private string _paddedJobNumber = "  2301-00  ";

    [Benchmark(Baseline = true)]
    public string TrimAndUpper()
        => _paddedJobNumber.Trim().ToUpperInvariant();

    [Benchmark]
    public string SpanBased()
    {
        var span = _paddedJobNumber.AsSpan().Trim();
        return string.Create(span.Length, span, static (chars, src) =>
        {
            src.ToUpperInvariant(chars);
        });
    }

    [Benchmark]
    public string TrimOnly()
        => _paddedJobNumber.Trim();
}
```

### BenchmarkDotNet: Serialization for DLQ

```csharp
[MemoryDiagnoser]
public class SerializationBenchmarks
{
    private RawJobCost _row = null!;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    [GlobalSetup]
    public void Setup()
    {
        _row = new JobCostBuilder().Build();
    }

    [Benchmark(Baseline = true)]
    public string SystemTextJson()
        => JsonSerializer.Serialize(_row, JsonOptions);

    [Benchmark]
    public byte[] SystemTextJson_Utf8()
        => JsonSerializer.SerializeToUtf8Bytes(_row, JsonOptions);
}
```

### dotnet-trace: Profiling a Pipeline Run

```bash
# List available providers
dotnet-trace list-profiles

# Start tracing the pipeline process
dotnet-trace collect \
    --process-id $(pidof MyPipeline) \
    --providers Microsoft-DotNETCore-SampleProfiler \
    --duration 00:02:00 \
    --output pipeline-trace.nettrace

# Or launch with tracing from the start
dotnet-trace collect \
    -- dotnet run -c Release --project src/Pipeline/Pipeline.csproj

# Convert to speedscope format for flame graphs
dotnet-trace convert pipeline-trace.nettrace --format speedscope
# Open in https://www.speedscope.app/
```

### dotnet-counters: Real-Time Monitoring

```bash
# Monitor runtime counters for a running pipeline
dotnet-counters monitor \
    --process-id $(pidof MyPipeline) \
    --counters \
        System.Runtime[gc-heap-size,gen-0-gc-count,gen-1-gc-count,gen-2-gc-count,threadpool-queue-length],\
        BNBuilders.DataPipeline[pipeline.rows.extracted,pipeline.rows.loaded,pipeline.step.duration]

# Output (refreshes every second):
# [System.Runtime]
#     GC Heap Size (MB)                         245
#     Gen 0 GC Count (Count / 1 sec)              3
#     Gen 1 GC Count (Count / 1 sec)              1
#     Gen 2 GC Count (Count / 1 sec)              0
#     ThreadPool Queue Length                      0
# [BNBuilders.DataPipeline]
#     pipeline.rows.extracted (rows)         450,000
#     pipeline.rows.loaded (rows)            430,000
#     pipeline.step.duration (ms)               2345
```

### Custom Counters for Pipeline Monitoring

```csharp
// Register counters that dotnet-counters can read
public static class PipelineCounters
{
    private static readonly Meter Meter = new("BNBuilders.DataPipeline");

    private static long _rowsExtracted;
    private static long _rowsLoaded;
    private static long _bytesProcessed;

    public static readonly Counter<long> RowsExtracted =
        Meter.CreateCounter<long>("pipeline.rows.extracted", "rows");

    public static readonly Counter<long> RowsLoaded =
        Meter.CreateCounter<long>("pipeline.rows.loaded", "rows");

    public static readonly Histogram<double> ChunkDuration =
        Meter.CreateHistogram<double>("pipeline.chunk.duration", "ms");

    public static readonly ObservableGauge<long> BytesProcessed =
        Meter.CreateObservableGauge("pipeline.bytes.processed",
            () => Interlocked.Read(ref _bytesProcessed), "bytes");

    public static void AddBytesProcessed(long bytes)
        => Interlocked.Add(ref _bytesProcessed, bytes);
}
```

### In-Pipeline Throughput Measurement

```csharp
public class ThroughputTracker
{
    private readonly Stopwatch _sw = Stopwatch.StartNew();
    private long _rowCount;
    private long _byteCount;
    private readonly ILogger _logger;
    private readonly string _stepName;
    private readonly TimeSpan _reportInterval;
    private DateTime _lastReport = DateTime.UtcNow;

    public ThroughputTracker(string stepName, ILogger logger,
        TimeSpan? reportInterval = null)
    {
        _stepName = stepName;
        _logger = logger;
        _reportInterval = reportInterval ?? TimeSpan.FromSeconds(10);
    }

    public void RecordRows(int count, long bytes = 0)
    {
        Interlocked.Add(ref _rowCount, count);
        Interlocked.Add(ref _byteCount, bytes);

        if (DateTime.UtcNow - _lastReport > _reportInterval)
        {
            Report();
            _lastReport = DateTime.UtcNow;
        }
    }

    public void Report()
    {
        var elapsed = _sw.Elapsed;
        var rows = Interlocked.Read(ref _rowCount);
        var bytes = Interlocked.Read(ref _byteCount);

        _logger.LogInformation(
            "[{Step}] {Rows:N0} rows in {Elapsed:mm\\:ss} " +
            "({RowsPerSec:N0} rows/s, {MBPerSec:F1} MB/s)",
            _stepName, rows, elapsed,
            rows / elapsed.TotalSeconds,
            bytes / elapsed.TotalSeconds / 1024 / 1024);
    }

    public ThroughputReport GetReport()
    {
        var elapsed = _sw.Elapsed;
        var rows = Interlocked.Read(ref _rowCount);
        var bytes = Interlocked.Read(ref _byteCount);

        return new ThroughputReport(
            StepName: _stepName,
            TotalRows: rows,
            TotalBytes: bytes,
            Elapsed: elapsed,
            RowsPerSecond: rows / elapsed.TotalSeconds,
            MegabytesPerSecond: bytes / elapsed.TotalSeconds / 1024 / 1024);
    }
}

public record ThroughputReport(
    string StepName,
    long TotalRows,
    long TotalBytes,
    TimeSpan Elapsed,
    double RowsPerSecond,
    double MegabytesPerSecond);
```

### Performance Baseline and Regression Detection

```csharp
[MemoryDiagnoser]
public class BaselineBenchmarks
{
    // These baselines are checked in CI to detect regressions
    // If a benchmark exceeds 2x the baseline, the build fails

    [Benchmark]
    [BaselineExpectation(maxMicroseconds: 1500, maxAllocatedKB: 1000)]
    public async Task Transform_10K_Rows()
    {
        var rows = new JobCostBuilder().BuildMany(10_000);
        var transform = new JobCostTransformStep();
        await transform.ExecuteAsync(rows, CancellationToken.None);
    }
}

// Custom attribute for CI enforcement
[AttributeUsage(AttributeTargets.Method)]
public class BaselineExpectationAttribute : Attribute
{
    public double MaxMicroseconds { get; }
    public double MaxAllocatedKB { get; }

    public BaselineExpectationAttribute(
        double maxMicroseconds, double maxAllocatedKB)
    {
        MaxMicroseconds = maxMicroseconds;
        MaxAllocatedKB = maxAllocatedKB;
    }
}
```

### Profiling SqlBulkCopy Throughput

```csharp
public class BulkCopyBenchmark
{
    private readonly SqlConnection _connection;
    private readonly ILogger _logger;

    public async Task<BulkCopyReport> MeasureBulkCopyAsync(
        IReadOnlyList<CleanJobCost> rows,
        CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        long rowsCopied = 0;

        using var bulk = new SqlBulkCopy(_connection)
        {
            DestinationTableName = "staging.JobCost",
            BatchSize = 10_000,
            BulkCopyTimeout = 300,
            NotifyAfter = 10_000
        };

        bulk.SqlRowsCopied += (_, args) =>
        {
            rowsCopied = args.RowsCopied;
            var elapsed = sw.Elapsed;
            _logger.LogDebug(
                "BulkCopy progress: {Rows:N0} rows, " +
                "{RowsPerSec:N0} rows/s",
                args.RowsCopied,
                args.RowsCopied / elapsed.TotalSeconds);
        };

        using var reader = new ObjectDataReader<CleanJobCost>(rows);
        await bulk.WriteToServerAsync(reader, ct);

        sw.Stop();
        return new BulkCopyReport(
            RowCount: rows.Count,
            Duration: sw.Elapsed,
            RowsPerSecond: rows.Count / sw.Elapsed.TotalSeconds);
    }
}

public record BulkCopyReport(
    int RowCount,
    TimeSpan Duration,
    double RowsPerSecond);
```

## Common Patterns

### Pattern 1: Benchmark Before Optimizing

Never optimize without a benchmark. Measure first, identify the bottleneck, optimize,
measure again. The flame graph tells you where time goes; the benchmark tells you if
your change helped.

### Pattern 2: Allocation Budget

Set an allocation budget per pipeline step. For example: "Transform must allocate less
than 100 bytes per row." BenchmarkDotNet's `[MemoryDiagnoser]` enforces this.

```
10K rows × 100 bytes/row = 1 MB total allocation
1M rows × 100 bytes/row = 100 MB total allocation
```

### Pattern 3: Bottleneck Identification Checklist

```
1. Measure end-to-end pipeline time
2. Measure per-step time (extract, transform, load)
3. Identify the slowest step (this is your bottleneck)
4. Profile the bottleneck step with dotnet-trace
5. Generate flame graph, find the hottest code path
6. Optimize the hot path
7. Re-measure to confirm improvement
```

### Pattern 4: Performance Comparison Table

```csharp
// Generate a comparison markdown table
public string FormatComparison(
    ThroughputReport before, ThroughputReport after)
{
    var speedup = after.RowsPerSecond / before.RowsPerSecond;
    return $"""
        | Metric | Before | After | Change |
        |--------|--------|-------|--------|
        | Rows/sec | {before.RowsPerSecond:N0} | {after.RowsPerSecond:N0} | {speedup:F2}x |
        | Duration | {before.Elapsed:mm\\:ss} | {after.Elapsed:mm\\:ss} | |
        | MB/sec | {before.MegabytesPerSecond:F1} | {after.MegabytesPerSecond:F1} | |
        """;
}
```

## Gotchas and Pitfalls

### 1. Benchmarking in Debug Mode
`dotnet run` defaults to Debug configuration with no optimizations. Always benchmark
with `-c Release`. BenchmarkDotNet warns you, but `dotnet-trace` does not.

### 2. Micro-Benchmark vs Real Throughput
BenchmarkDotNet measures a single function in isolation. Real pipeline throughput
includes network I/O, database latency, GC pauses, and contention. Micro-benchmarks
are useful for comparing implementations but not for predicting real throughput.

### 3. Warm Cache Bias
After the first pipeline run, Oracle and SQL Server have data cached. Subsequent runs
are faster. Benchmark both cold (after cache clear) and warm scenarios.

### 4. GC Mode Matters
Server GC (`<ServerGarbageCollection>true</ServerGarbageCollection>`) behaves differently
from workstation GC. Benchmark with the same GC mode you use in production.

### 5. Ignoring Allocation Rate
A pipeline that allocates 10 GB per run triggers many GC pauses even if CPU time is
low. Measure allocations alongside throughput. Gen 2 collections are the biggest
throughput killers.

### 6. Benchmarking Network-Bound Operations
If your extract is 99% network wait, optimizing the 1% of CPU work has negligible
effect. Use `dotnet-trace` to determine if the bottleneck is CPU, I/O, or network.

## Performance Considerations

**Target throughput for Oracle-to-SQL Server ETL:**

| Component | Expected Throughput | Bottleneck If Below |
|-----------|--------------------|--------------------|
| Oracle read (single query) | 50K-200K rows/sec | Network or missing index |
| Oracle read (parallel chunks) | 200K-1M rows/sec | Connection pool or Oracle CPU |
| C# transform (simple mapping) | 1M-10M rows/sec | Allocation-heavy transforms |
| C# transform (with hashing) | 500K-2M rows/sec | Hash function choice |
| SqlBulkCopy (single stream) | 100K-500K rows/sec | Network or disk I/O |
| SqlBulkCopy (parallel streams) | 200K-1M rows/sec | Lock contention above 3-4 streams |
| MERGE statement | 50K-200K rows/sec | Index maintenance, transaction log |

**Reading flame graphs:**

```
Wide bar at top        → This function itself is slow
Wide bar with children → Time is spent in callees, not the function itself
Unexpected wide bars   → Surprise bottlenecks (logging, GC, serialization)
```

## BNBuilders Context

### Establishing Performance Baselines

Before optimizing, measure the current pipeline:

```
JCDETL full extract (5M rows): 3 min 20 sec
JCDETL delta extract (5K rows): 1.2 sec
JCDETL transform: 0.8 sec per 100K rows
JCDETL SqlBulkCopy: 1.5 sec per 100K rows
Full pipeline (all tables): 12 min
```

These baselines go into a dashboard. If next week's run takes 25 min, investigate.

### Month-End Performance Testing

During month-end close, data volumes spike 5-10x. Benchmark the pipeline with month-end
volumes before it happens:

```csharp
[Params(5_000, 50_000, 500_000)]  // Normal, busy day, month-end
public int RowCount { get; set; }

[Benchmark]
public async Task FullPipelineStep()
{
    var rows = new JobCostBuilder().BuildMany(RowCount);
    await _pipeline.RunAsync(rows, CancellationToken.None);
}
```

### Network Profiling Between Oracle and SQL Server

If Oracle is on-prem and SQL Server is in Azure, network latency dominates. Measure
with:

```bash
# Ping for baseline latency
ping -c 10 oracle-server.bnbuilders.local

# Track network throughput during extract
dotnet-counters monitor --process-id $PID \
    --counters System.Net.Http[requests-started,current-requests]
```

### Optimization Priority

For BNBuilders pipelines, the typical bottleneck priority is:
1. Oracle read (network + query plan) — most impactful
2. SqlBulkCopy (network + disk) — second most impactful
3. MERGE statement (index maintenance) — important for large deltas
4. Transform (CPU) — rarely the bottleneck unless doing complex enrichment

Optimize in this order for maximum ROI.

## Interview / Senior Dev Questions

1. **"How do you find the bottleneck in a pipeline?"**
   Measure per-step duration. The slowest step is the bottleneck. Then profile that
   step with `dotnet-trace` and generate a flame graph. The widest bars in the flame
   graph show where time is spent. Optimize that code path and re-measure.

2. **"Why use BenchmarkDotNet instead of Stopwatch?"**
   BenchmarkDotNet handles warmup (JIT compilation), statistical analysis (standard
   deviation, confidence intervals), GC measurement, allocation tracking, and formatted
   reporting. A raw Stopwatch measurement includes JIT time, is subject to noise, and
   tells you nothing about memory behavior.

3. **"What does a Gen 2 GC collection indicate?"**
   Long-lived objects being collected. In a pipeline, this usually means large arrays
   or collections surviving multiple GC generations. Frequent Gen 2 collections cause
   significant pauses (100ms+). Reduce by streaming instead of materializing, pooling
   buffers, or reducing object lifetimes.

4. **"How do you benchmark network-bound operations?"**
   Separately. Measure the network round-trip time (`ping`, traceroute) and the
   database query time (execution plan, `SET STATISTICS TIME ON`). The difference
   between network + query time and your observed pipeline time is your application
   overhead. Optimizing application code only helps with the overhead portion.

## Quiz

### Question 1
You benchmark a transform function and it runs at 5M rows/sec. In production, the
full pipeline processes 50K rows/sec. Where is the bottleneck?

<details>
<summary>Show Answer</summary>

**Not in the transform.** The transform is 100x faster than the pipeline. The bottleneck
is elsewhere — likely the Oracle extract (network + query) or SqlBulkCopy (network +
disk). Measure per-step duration to identify which step is slowest. Optimizing the
transform further would have zero impact on pipeline throughput.
</details>

### Question 2
Your BenchmarkDotNet results show `Allocated: 82,031 KB` for transforming 10K rows.
Is this concerning?

<details>
<summary>Show Answer</summary>

That is ~8.2 bytes per row of allocation, which is very reasonable. At 1M rows it
would be ~80 MB — still manageable. Concern starts when allocation per row is 1KB+,
which at 1M rows would be 1 GB, triggering frequent Gen 2 GC collections. Monitor Gen 2
collection count alongside allocation size.
</details>

### Question 3
You run `dotnet-counters` and see `Gen 2 GC Count: 15/sec` during the transform step.
What does this indicate and how do you fix it?

<details>
<summary>Show Answer</summary>

15 Gen 2 collections per second is extremely high and indicates severe memory pressure.
Large objects (>85 KB) or long-lived collections are being allocated and promoted to
Gen 2. Fix: (1) stream data instead of materializing into `List<T>`, (2) use
`ArrayPool<T>` for temporary buffers, (3) reduce per-row allocations (use `Span<T>`
for string operations), (4) check for accidental retention of large collections.
Profile with `dotnet-trace` to find the allocation hot spots.
</details>

### Question 4
You compare two hash functions with BenchmarkDotNet:
- SHA256: 450 ns/op, 320 B allocated
- XxHash32: 85 ns/op, 128 B allocated

Which should you use for row-level change detection?

<details>
<summary>Show Answer</summary>

**It depends on your requirements.** XxHash32 is 5x faster and allocates less, but it
is a 32-bit non-cryptographic hash with higher collision probability. For change
detection in a pipeline with millions of rows, collisions (falsely detecting "no change")
could cause missed updates. SHA256 is overkill cryptographically but has negligible
collision risk. At 450 ns/row, 1M rows take 0.45 seconds — likely negligible compared
to I/O. Use SHA256 for correctness unless profiling shows hash computation is a
genuine bottleneck.
</details>

### Question 5
You benchmark with `-c Debug` by accident. Your results show the transform at 500K
rows/sec. In Release mode it is 5M rows/sec. Why the 10x difference?

<details>
<summary>Show Answer</summary>

Debug mode disables JIT optimizations: no inlining, no dead code elimination, no SIMD
vectorization, bounds checks on every array access. The JIT compiler in Release mode
aggressively optimizes hot paths. Always benchmark with `-c Release` and
`<Optimize>true</Optimize>`. BenchmarkDotNet explicitly warns if it detects a
non-optimized build.
</details>
