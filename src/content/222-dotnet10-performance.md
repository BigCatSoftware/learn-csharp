# Performance Improvements in .NET 10

*Chapter 14.3 — Performance Improvements in .NET 10*

## Overview

Every .NET release ships with hundreds of performance improvements, and .NET 10 is no
exception. For Data Engineers who process millions of rows, large files, and complex
transformations, these improvements translate directly to faster pipelines, lower Azure
compute costs, and better throughput.

This lesson covers three pillars of .NET 10 performance:

1. **JIT Compiler** — Dynamic PGO fully enabled, loop optimizations, bounds check elimination,
   and better inlining decisions.
2. **Garbage Collector** — DATAS (Dynamic Adaptation To Application Sizes), region-based GC,
   and reduced pause times.
3. **ThreadPool and Async** — Better work-stealing, improved `ValueTask` handling, and
   async method overhead reduction.

These are not features you write code to use — they happen automatically when you upgrade.
But understanding them helps you write code that cooperates with the runtime instead of
fighting it.

## Core Concepts

### JIT Compiler: Dynamic PGO

Profile-Guided Optimization (PGO) uses runtime profiling data to make better compilation
decisions. In .NET 10, Dynamic PGO is enabled by default with no configuration needed.

The JIT works in two tiers:
- **Tier 0** — Quick compilation, instruments code to collect profile data.
- **Tier 1** — Recompiles hot methods using the collected profile data.

What the Tier 1 recompilation can do:

| Optimization | What It Does | DE Impact |
|-------------|-------------|-----------|
| Devirtualization | Replaces virtual/interface calls with direct calls | Faster LINQ, faster DI-resolved services |
| Guarded devirtualization | Speculates on the most common type | Interface-heavy data readers speed up |
| Hot/cold splitting | Moves error paths out of hot loops | Better CPU cache utilization |
| Loop cloning | Removes bounds checks from loops | Faster array iteration |
| Inlining | Inlines small methods at call sites | Reduced call overhead in transforms |

### JIT: Loop Optimizations

.NET 10 improves loop handling significantly:

```csharp
// The JIT can now hoist more invariants out of loops
for (int i = 0; i < data.Length; i++)
{
    // In .NET 10, the JIT recognizes that 'multiplier' never changes
    // and hoists the lookup outside the loop
    result[i] = data[i] * config.Multiplier;
}

// Bounds check elimination is more aggressive
Span<byte> buffer = stackalloc byte[1024];
for (int i = 0; i < buffer.Length; i++)
{
    // .NET 10 JIT eliminates the bounds check entirely
    // because it proves i < buffer.Length
    buffer[i] = (byte)(i & 0xFF);
}
```

### Garbage Collector: DATAS

DATAS (Dynamic Adaptation To Application Sizes) lets the GC dynamically adjust heap size
based on actual application needs:

- **Scales down** when the application is idle (e.g., between pipeline runs).
- **Scales up** when memory demand increases (e.g., during a large file import).
- **Reduces memory footprint** for container deployments where memory limits matter.

This is particularly useful for Azure Container Apps or Azure Functions where you pay
for memory.

### Garbage Collector: Region-Based GC

The region-based GC replaces the old segment-based heap with fixed-size regions:

- **Regions** are typically 4 MB each (configurable).
- **Less fragmentation** — regions can be independently reclaimed.
- **Better Gen2 behavior** — large, long-lived datasets (like lookup tables) cause
  fewer full GC pauses.
- **Pinning improvements** — pinned objects (common in I/O) cause less heap fragmentation.

### ThreadPool Enhancements

.NET 10 improves the ThreadPool for async-heavy workloads:

- **Better work-stealing** — idle threads pick up work from busy threads faster.
- **Reduced thread injection latency** — new threads spin up faster when the pool is
  saturated.
- **Improved `ValueTask` recycling** — less overhead when awaiting many small async
  operations (like database calls per row).

## Code Examples

### Measuring the Impact: BenchmarkDotNet

Always measure before and after. Here is how to benchmark a data pipeline operation:

```csharp
using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Running;

[MemoryDiagnoser]
[SimpleJob(runtimeMoniker: RuntimeMoniker.Net80)]
[SimpleJob(runtimeMoniker: RuntimeMoniker.Net100)]
public class CsvParsingBenchmarks
{
    private string[] _lines = null!;

    [GlobalSetup]
    public void Setup()
    {
        // Simulate 1 million CSV lines
        _lines = Enumerable.Range(0, 1_000_000)
            .Select(i => $"PRJ-{i:D6},03-310,{i * 100.50m:F2},2026-01-{(i % 28) + 1:D2}")
            .ToArray();
    }

    [Benchmark(Baseline = true)]
    public int ParseWithSplit()
    {
        int count = 0;
        foreach (var line in _lines)
        {
            var parts = line.Split(',');
            if (decimal.TryParse(parts[2], out var amount) && amount > 50_000m)
                count++;
        }
        return count;
    }

    [Benchmark]
    public int ParseWithSpan()
    {
        int count = 0;
        foreach (var line in _lines)
        {
            var span = line.AsSpan();
            // Skip first two fields
            var firstComma = span.IndexOf(',');
            var secondComma = span[(firstComma + 1)..].IndexOf(',') + firstComma + 1;
            var thirdComma = span[(secondComma + 1)..].IndexOf(',') + secondComma + 1;

            var amountSpan = span[(secondComma + 1)..thirdComma];
            if (decimal.TryParse(amountSpan, out var amount) && amount > 50_000m)
                count++;
        }
        return count;
    }
}

// Run with: dotnet run -c Release
// The Span version benefits more from .NET 10 JIT improvements
```

### Writing GC-Friendly Pipeline Code

Code patterns that cooperate with .NET 10's improved GC:

```csharp
public class GcFriendlyBatchProcessor
{
    // Pattern 1: Reuse buffers instead of allocating new ones
    private readonly ArrayPool<byte> _pool = ArrayPool<byte>.Shared;

    public async Task ProcessFileAsync(string path)
    {
        byte[] buffer = _pool.Rent(81920); // 80 KB — stays in Gen0/Gen1
        try
        {
            await using var stream = File.OpenRead(path);
            int bytesRead;
            while ((bytesRead = await stream.ReadAsync(buffer)) > 0)
            {
                ProcessChunk(buffer.AsSpan(0, bytesRead));
            }
        }
        finally
        {
            _pool.Return(buffer);
        }
    }

    // Pattern 2: Use structs for short-lived data to avoid GC entirely
    private readonly record struct ParsedRow(
        ReadOnlyMemory<char> ProjectId,
        decimal Amount,
        DateOnly Date
    );

    // Pattern 3: Pre-size collections to avoid resizing
    public List<BudgetSummary> Summarize(IReadOnlyList<BudgetRow> rows)
    {
        // Pre-size based on expected distinct keys
        var groups = new Dictionary<string, decimal>(capacity: rows.Count / 10);

        foreach (var row in rows)
        {
            if (!groups.TryAdd(row.CostCode, row.Amount))
                groups[row.CostCode] += row.Amount;
        }

        var result = new List<BudgetSummary>(groups.Count);
        foreach (var (code, total) in groups)
        {
            result.Add(new BudgetSummary(code, total));
        }
        return result;
    }
}

public record BudgetRow(string CostCode, decimal Amount);
public record BudgetSummary(string CostCode, decimal TotalAmount);
```

### Async Pipeline with ThreadPool Awareness

```csharp
public class ParallelPipelineRunner
{
    private readonly int _maxConcurrency;

    public ParallelPipelineRunner(int? maxConcurrency = null)
    {
        // .NET 10 ThreadPool is smarter, but still respect limits
        // for external resource constraints (DB connections, API rate limits)
        _maxConcurrency = maxConcurrency ?? Environment.ProcessorCount;
    }

    public async Task<PipelineResult> RunAsync(
        IReadOnlyList<string> projectNumbers,
        Func<string, CancellationToken, Task<ProjectData>> processor,
        CancellationToken ct)
    {
        var semaphore = new SemaphoreSlim(_maxConcurrency);
        var results = new ConcurrentBag<ProjectData>();
        var errors = new ConcurrentBag<(string Project, Exception Error)>();

        // Parallel.ForEachAsync cooperates with the ThreadPool
        await Parallel.ForEachAsync(
            projectNumbers,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = _maxConcurrency,
                CancellationToken = ct
            },
            async (projectNumber, token) =>
            {
                try
                {
                    var data = await processor(projectNumber, token);
                    results.Add(data);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    errors.Add((projectNumber, ex));
                }
            });

        return new PipelineResult(
            Processed: results.Count,
            Errors: errors.Count,
            FailedProjects: errors.Select(e => e.Project).ToList()
        );
    }
}

public record PipelineResult(int Processed, int Errors, List<string> FailedProjects);
public record ProjectData(string ProjectNumber, decimal TotalBudget);
```

### Monitoring GC with dotnet-counters

```bash
# Install the diagnostic tool
dotnet tool install --global dotnet-counters

# Monitor GC in real time while your pipeline runs
dotnet-counters monitor --process-id <PID> --counters \
  System.Runtime[gc-heap-size,gen-0-gc-count,gen-1-gc-count,gen-2-gc-count,time-in-gc]

# Or collect to a file for later analysis
dotnet-counters collect --process-id <PID> --output gc-metrics.csv --format csv
```

## Common Patterns

### Performance Optimization Priority for DE Workloads

| Priority | Area | Technique |
|----------|------|-----------|
| 1 | I/O | Use streaming (not load-all-at-once) for large files |
| 2 | Memory | Reuse buffers with `ArrayPool<T>` |
| 3 | Collections | Pre-size dictionaries and lists |
| 4 | Parsing | Use `Span<T>` for string slicing instead of `Substring` |
| 5 | Async | Use `Parallel.ForEachAsync` for concurrent API calls |
| 6 | Serialization | Use source-generated JSON serializers |
| 7 | GC | Use structs for short-lived intermediate data |

### The 80/20 Rule

Most pipeline performance is determined by:
- **Database query efficiency** (80%) — Indexes, query plans, batch sizes.
- **Network I/O** (15%) — Connection pooling, parallel requests.
- **CPU computation** (5%) — Where JIT and GC improvements help.

Do not optimize CPU-bound code until you have addressed I/O bottlenecks first.

## Gotchas and Pitfalls

1. **Dynamic PGO needs warm-up** — The first few thousand iterations use Tier 0 (slow)
   code. For short-lived processes (< 5 seconds), PGO may not help. Consider Native AOT
   for CLI tools instead.

2. **Server GC memory overhead** — Server GC uses more memory to achieve higher throughput.
   In a container with 512 MB RAM, Workstation GC may actually perform better. Test both.

3. **`ArrayPool<T>.Rent` returns oversized buffers** — If you rent 1000, you may get 1024.
   Always use the exact `bytesRead` count, not `buffer.Length`.

4. **`Parallel.ForEachAsync` is not always faster** — If each iteration is a single DB
   query that takes 50ms, and your DB connection pool is 10, then `MaxDegreeOfParallelism`
   above 10 just wastes threads waiting for connections.

5. **Struct boxing in generics** — Passing a struct to a method expecting `object` or a
   non-constrained generic boxes it, negating the GC benefit. Use generic constraints:

```csharp
// Bad — boxes the struct
void Process(object item) { }

// Good — no boxing
void Process<T>(T item) where T : struct { }
```

6. **Benchmarking pitfalls** — Never benchmark in Debug mode. Always use `Release`
   configuration with `BenchmarkDotNet` or at minimum `dotnet run -c Release`.

7. **LOH (Large Object Heap)** — Arrays > 85,000 bytes go on the LOH, which is collected
   less frequently. For data pipelines, this means a `byte[100_000]` allocated per row
   is catastrophic. Use `ArrayPool` instead.

## Performance Considerations

### Memory Budget Rule of Thumb

For a data pipeline container:

```
Container Memory = (Working Set) + (GC Overhead) + (Buffer Pool) + (Headroom)

Example for a 2 GB container:
  Working Set:   ~800 MB  (data being processed)
  GC Overhead:   ~400 MB  (Server GC reserves)
  Buffer Pool:   ~200 MB  (ArrayPool rentals)
  Headroom:      ~600 MB  (spikes, temporary allocations)
```

### Measuring Allocation Rates

```csharp
// Use GC.GetAllocatedBytesForCurrentThread() to measure allocations in a scope
long before = GC.GetAllocatedBytesForCurrentThread();

// ... your code here ...

long after = GC.GetAllocatedBytesForCurrentThread();
long allocated = after - before;
Console.WriteLine($"Allocated: {allocated:N0} bytes");
```

### Environment Variables for GC Tuning

```bash
# Enable Server GC (also settable in .csproj)
DOTNET_gcServer=1

# Set GC heap count (default: number of cores)
DOTNET_GCHeapCount=4

# Enable DATAS (default in .NET 10)
DOTNET_GCDynamicAdaptationMode=1

# Set GC latency mode for low-pause requirements
# 0 = Batch, 1 = Interactive (default), 2 = LowLatency, 3 = SustainedLowLatency
DOTNET_GCLatencyLevel=1

# Limit GC heap size (useful in containers)
DOTNET_GCHeapHardLimit=0x40000000  # 1 GB
```

## BNBuilders Context

### Real Pipeline Performance Scenario

Consider BNBuilders' nightly cost sync: pulling budget data from Sage, transforming it,
and loading into Azure SQL for Power BI reporting.

| Metric | .NET 8 | .NET 10 (est.) | Improvement |
|--------|--------|----------------|-------------|
| Startup time | 1.2s | 0.9s | 25% faster |
| Row processing (1M rows) | 4.5s | 3.6s | 20% faster (PGO) |
| Peak memory | 850 MB | 720 MB | 15% lower (DATAS) |
| Gen2 GC pauses | 12ms avg | 7ms avg | 42% shorter |
| Total pipeline time | 8 min | 6.5 min | 19% faster |

These are estimates based on published .NET team benchmarks. Your actual results will vary
based on your specific workload mix.

### Container Optimization for Azure

```dockerfile
# Multi-stage build for BNBuilders pipeline
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/runtime:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .

# Set GC for container workload
ENV DOTNET_gcServer=1
ENV DOTNET_GCDynamicAdaptationMode=1

ENTRYPOINT ["dotnet", "BNBuilders.CostSync.dll"]
```

### Cost Savings Estimation

If your pipeline runs on Azure Container Instances at $0.0035/GB/hour:
- .NET 8: 850 MB * 8 min = 0.85 GB * 0.133 hr = $0.00047/run
- .NET 10: 720 MB * 6.5 min = 0.72 GB * 0.108 hr = $0.00039/run
- Savings: ~17% per run * 365 nightly runs = meaningful at scale across dozens of pipelines.

## Interview / Senior Dev Questions

1. **Q: Explain Dynamic PGO and when it does NOT help.**
   A: Dynamic PGO profiles code at Tier 0, then recompiles hot methods at Tier 1 with
   optimizations like devirtualization and branch prediction. It does NOT help when:
   (a) the process is too short-lived for Tier 1 to kick in, (b) the workload is I/O-bound
   (waiting on network/disk), or (c) the hot path has no virtual calls or branching to
   optimize.

2. **Q: You have a pipeline that processes 10 million rows and causes frequent Gen2 GC
   pauses. What do you investigate?**
   A: (a) Check if large arrays (>85KB) are allocated per-row — move to `ArrayPool`.
   (b) Check if objects survive to Gen2 unnecessarily — use structs for intermediate data.
   (c) Enable Server GC if not already. (d) Check for pinned objects causing fragmentation.
   (e) Use `dotnet-gcdump` to analyze what is on the Gen2 heap.

3. **Q: How would you decide between `Parallel.ForEachAsync` and manual `Task.WhenAll`
   with a semaphore?**
   A: `Parallel.ForEachAsync` is simpler and cooperates with the ThreadPool scheduler. Use
   it when processing a known collection with uniform work items. Use manual `Task.WhenAll`
   with a semaphore when you need finer control — like different timeouts per item, complex
   error handling per task, or when items are produced by an async stream (`IAsyncEnumerable`).

4. **Q: What is the LOH and why does it matter for data pipelines?**
   A: The Large Object Heap holds objects >= 85,000 bytes. It is only collected during
   Gen2 collections, which are expensive. Data pipelines that allocate large byte arrays
   or strings per row can fill the LOH rapidly, causing long GC pauses. The fix is to use
   `ArrayPool<T>` for buffers and streaming APIs instead of loading entire datasets into
   memory.

## Quiz

**Question 1:** What is the default state of Dynamic PGO in .NET 10?

a) Disabled — you must opt in via a project setting
b) Enabled only for ASP.NET Core applications
c) Enabled by default for all applications
d) Available only with Native AOT

<details>
<summary>Answer</summary>

**c) Enabled by default for all applications.** In .NET 10, Dynamic PGO is on by default.
The JIT profiles methods at Tier 0 and recompiles hot methods at Tier 1 with optimizations
like devirtualization and better inlining.

</details>

**Question 2:** What does DATAS (Dynamic Adaptation To Application Sizes) do?

a) Automatically scales the number of CPU cores used
b) Dynamically adjusts GC heap size based on application memory needs
c) Compresses data in memory to reduce heap size
d) Distributes data across multiple servers

<details>
<summary>Answer</summary>

**b) Dynamically adjusts GC heap size based on application memory needs.** DATAS allows the
GC to shrink the heap when the application is idle and grow it under load. This is
particularly useful in container environments where memory costs money.

</details>

**Question 3:** An `ArrayPool<byte>.Rent(1000)` call returns a buffer. What is true about
this buffer?

a) It is exactly 1000 bytes
b) It may be larger than 1000 bytes
c) It is always 1024 bytes (next power of 2)
d) It is pre-filled with zeros

<details>
<summary>Answer</summary>

**b) It may be larger than 1000 bytes.** `ArrayPool.Rent` returns a buffer that is *at least*
the requested size, but may be larger. Always track the actual number of bytes you need
(e.g., `bytesRead` from a stream) rather than using `buffer.Length`.

</details>

**Question 4:** Which GC mode should a data pipeline running in a Docker container with
4 GB RAM use?

a) Always Workstation GC — containers need low memory
b) Always Server GC — it is faster
c) Server GC, but set `GCHeapHardLimit` to ~75% of container memory
d) Disable GC entirely for maximum performance

<details>
<summary>Answer</summary>

**c) Server GC with `GCHeapHardLimit`.** Server GC provides higher throughput for
batch-processing workloads, but it can consume all available memory if unconstrained.
Setting a hard limit (e.g., 3 GB in a 4 GB container) prevents OOM kills while retaining
Server GC's throughput advantages.

</details>
