# What's New in .NET 10

*Chapter 14.1 — What's New in .NET 10*

## Overview

.NET 10 is the next Long-Term Support (LTS) release following .NET 8, shipping in November 2025.
For Data Engineers, this release brings meaningful improvements to runtime performance,
memory management, JSON handling, and cloud-native tooling. This lesson focuses on the
features that directly impact data workloads — ingesting large files, transforming datasets,
running ETL pipelines, and deploying to Azure.

If you are running .NET 8 LTS today, .NET 10 is the natural upgrade path. .NET 9 (STS) was
a stepping stone; .NET 10 consolidates those improvements and adds LTS guarantees, which
matters when your pipelines run in production for years.

Key themes in .NET 10 for data engineers:

- **Runtime performance** — Dynamic PGO is now fully enabled by default; JIT generates
  faster code for hot loops without any code changes.
- **Garbage Collector** — The DATAS (Dynamic Adaptation To Application Sizes) feature and
  region-based GC reduce pause times for memory-heavy workloads.
- **Networking and I/O** — HTTP/3 is stable, `System.IO` has new high-throughput APIs, and
  `System.Text.Json` is faster and more flexible.
- **Native AOT** — Broader library support means you can now AOT-compile CLI tools and
  Azure Functions for near-instant startup.
- **Cloud-native** — Built-in OpenTelemetry improvements, better `IDistributedCache`, and
  tighter Azure SDK integration.

## Core Concepts

### LTS vs STS Release Cadence

| Release | Type | Support Ends | Use For |
|---------|------|--------------|---------|
| .NET 8  | LTS  | Nov 2026     | Current production workloads |
| .NET 9  | STS  | May 2026     | Early adopters, short-lived projects |
| .NET 10 | LTS  | Nov 2028     | Next production target |

As a Data Engineer at a construction company, stability matters. LTS releases get three years
of patches. Plan your migration from .NET 8 to .NET 10 during 2026 — you have runway.

### Target Framework Moniker

When you upgrade, your `.csproj` changes one line:

```xml
<!-- Before -->
<TargetFramework>net8.0</TargetFramework>

<!-- After -->
<TargetFramework>net10.0</TargetFramework>
```

### SDK and Runtime Versioning

```bash
# Check installed SDKs
dotnet --list-sdks

# Check installed runtimes
dotnet --list-runtimes

# Install .NET 10 SDK (Linux)
sudo apt-get install dotnet-sdk-10.0

# Install .NET 10 SDK (Windows — winget)
winget install Microsoft.DotNet.SDK.10
```

### Global.json Pinning

Pin your team to a specific SDK version so builds are reproducible:

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  }
}
```

## Code Examples

### New TimeProvider Improvements

`TimeProvider` (introduced in .NET 8) gets additional helpers in .NET 10 that simplify
testing time-dependent pipeline logic:

```csharp
// Production code — scheduling a pipeline retry
public class PipelineScheduler
{
    private readonly TimeProvider _time;

    public PipelineScheduler(TimeProvider time)
    {
        _time = time;
    }

    public DateTimeOffset GetNextRetryTime(int attempt)
    {
        var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt));
        return _time.GetUtcNow() + delay;
    }
}

// Test code — deterministic time
var fakeTime = new FakeTimeProvider(new DateTimeOffset(2026, 1, 15, 8, 0, 0, TimeSpan.Zero));
var scheduler = new PipelineScheduler(fakeTime);

var retry1 = scheduler.GetNextRetryTime(1);
// Exactly 2 seconds after 8:00:00 — no flaky tests
```

### System.Text.Json — New Contract Customization

.NET 10 expands JSON contract customization, making it easier to serialize construction
data models with varying shapes:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

// A cost code record from BNBuilders' ERP
public record CostCode(
    string Code,
    string Description,
    decimal BudgetAmount,
    DateTime? LastUpdated
);

// Custom modifier — strip null dates from JSON output
static void StripNullDates(JsonTypeInfo typeInfo)
{
    if (typeInfo.Type != typeof(CostCode)) return;

    foreach (var prop in typeInfo.Properties)
    {
        if (prop.PropertyType == typeof(DateTime?))
        {
            prop.ShouldSerialize = (obj, val) => val is not null;
        }
    }
}

// Configure once, reuse everywhere
var options = new JsonSerializerOptions
{
    TypeInfoResolver = new DefaultJsonTypeInfoResolver
    {
        Modifiers = { StripNullDates }
    },
    WriteIndented = true
};

var costCode = new CostCode("03-310", "Structural Concrete", 1_500_000m, null);
string json = JsonSerializer.Serialize(costCode, options);
// { "Code": "03-310", "Description": "Structural Concrete", "BudgetAmount": 1500000 }
```

### Improved Regex Source Generator

The regex source generator now handles more patterns and produces faster code — useful
when parsing semi-structured construction logs:

```csharp
using System.Text.RegularExpressions;

public partial class DailyLogParser
{
    // Source-generated regex — compiled at build time, AOT-compatible
    [GeneratedRegex(@"^(?<date>\d{4}-\d{2}-\d{2})\s+(?<crew>\w+)\s+(?<hours>\d+\.?\d*)\s+(?<activity>.+)$",
        RegexOptions.Multiline)]
    private static partial Regex DailyLogLine();

    public IEnumerable<DailyLogEntry> Parse(string rawLog)
    {
        foreach (Match match in DailyLogLine().Matches(rawLog))
        {
            yield return new DailyLogEntry(
                Date: DateOnly.Parse(match.Groups["date"].Value),
                Crew: match.Groups["crew"].Value,
                Hours: decimal.Parse(match.Groups["hours"].Value),
                Activity: match.Groups["activity"].Value
            );
        }
    }
}

public record DailyLogEntry(DateOnly Date, string Crew, decimal Hours, string Activity);
```

### OpenTelemetry Integration

.NET 10 makes observability first-class. For data pipelines, this means tracing every step
from ingestion to warehouse load:

```csharp
using System.Diagnostics;
using System.Diagnostics.Metrics;

public static class PipelineTelemetry
{
    public static readonly ActivitySource Source = new("BNBuilders.DataPipeline", "1.0.0");
    public static readonly Meter Meter = new("BNBuilders.DataPipeline", "1.0.0");

    public static readonly Counter<long> RowsProcessed =
        Meter.CreateCounter<long>("rows.processed", "rows", "Total rows processed");

    public static readonly Histogram<double> BatchDuration =
        Meter.CreateHistogram<double>("batch.duration", "ms", "Time per batch");
}

// Usage in a pipeline step
public async Task ProcessBatchAsync(IReadOnlyList<CostCode> batch)
{
    using var activity = PipelineTelemetry.Source.StartActivity("ProcessBatch");
    activity?.SetTag("batch.size", batch.Count);

    var sw = Stopwatch.StartNew();

    foreach (var code in batch)
    {
        // transform, validate, load...
    }

    sw.Stop();
    PipelineTelemetry.RowsProcessed.Add(batch.Count);
    PipelineTelemetry.BatchDuration.Record(sw.Elapsed.TotalMilliseconds);
}
```

## Common Patterns

### Migration Checklist for .NET 8 to .NET 10

1. **Update `global.json`** to the .NET 10 SDK version.
2. **Change `TargetFramework`** in all `.csproj` files to `net10.0`.
3. **Update NuGet packages** — run `dotnet outdated` (third-party tool) or check manually.
4. **Remove obsolete suppressions** — APIs deprecated in .NET 8 may be removed in .NET 10.
5. **Enable Dynamic PGO explicitly** if you had it off — it is now the default.
6. **Test with `dotnet test`** — focus on serialization, I/O, and date-handling code.
7. **Profile memory** — GC changes may shift allocation patterns; verify with `dotnet-counters`.
8. **Update Docker base images** — `mcr.microsoft.com/dotnet/runtime:10.0`.
9. **Update Azure DevOps pipelines** — change the `UseDotNet` task version.

### Feature Flags for Gradual Rollout

```csharp
// Use Microsoft.FeatureManagement to toggle new .NET 10 code paths
// while migrating a pipeline
if (await _featureManager.IsEnabledAsync("UseNet10JsonSerializer"))
{
    return JsonSerializer.Deserialize<ProjectBudget>(json, _net10Options);
}
else
{
    return JsonSerializer.Deserialize<ProjectBudget>(json, _legacyOptions);
}
```

## Gotchas and Pitfalls

1. **Breaking changes in System.Text.Json** — Some edge cases around `JsonNumberHandling`
   changed. If you serialize `decimal` budget values, test thoroughly.

2. **Obsolete API removals** — APIs that were `[Obsolete]` since .NET 6/7 may be removed.
   Compile with `TreatWarningsAsErrors` early to catch these.

3. **Docker image tags** — `mcr.microsoft.com/dotnet/aspnet:10.0` is not the same as
   `mcr.microsoft.com/dotnet/runtime:10.0`. Use `runtime` for console-app pipelines,
   `aspnet` for web APIs.

4. **Global using changes** — Some implicit usings may bring in new namespaces. If you have
   types with the same name, you will get ambiguity errors.

5. **NuGet package compatibility** — Not all third-party packages will have `net10.0` targets
   on day one. They may still work via `netstandard2.0`, but test behavior.

6. **Entity Framework Core 10** — Migrations generated on EF Core 8 should apply cleanly,
   but always test on a copy of your database first.

## Performance Considerations

- **Dynamic PGO** — Profile-Guided Optimization is fully on by default. The JIT collects
  runtime type information and recompiles hot methods. For data pipelines that loop over
  millions of rows, this can yield 10-30% throughput improvements with zero code changes.

- **GC Regions** — The generational GC now uses a region-based heap. This reduces
  fragmentation for workloads that allocate many medium-sized objects (like reading CSV rows
  into DTOs). Expect lower Gen2 collection pauses.

- **Server GC defaults** — For console apps processing large files, explicitly enable Server GC:

```xml
<!-- In your .csproj -->
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
</PropertyGroup>
```

- **UTF-8 string literals** — `"hello"u8` avoids UTF-16 to UTF-8 transcoding in hot paths.
  If you are writing JSON or CSV to streams, use UTF-8 throughout.

- **Frozen collections** — `FrozenDictionary` and `FrozenSet` (introduced .NET 8, improved
  in .NET 10) give O(1) lookups for read-only reference data like cost code mappings.

## BNBuilders Context

As a Data Engineer at BNBuilders (a construction company in a Microsoft ecosystem), here is
how .NET 10 maps to your daily work:

| Your Task | .NET 10 Feature | Impact |
|-----------|----------------|--------|
| ETL from Procore/Sage to Azure SQL | Improved System.Text.Json | Faster JSON deserialization of API responses |
| Nightly cost report generation | Dynamic PGO | Hot loops over budget line items run faster |
| Uploading files to Azure Blob | System.IO improvements | Faster streaming uploads |
| CLI tools for ad-hoc data fixes | Native AOT | Sub-100ms startup for quick scripts |
| Monitoring pipeline health | OpenTelemetry integration | Traces and metrics out of the box |
| Power BI dataset refresh triggers | HTTP/3 stability | Lower latency API calls |

### Migration Strategy

BNBuilders likely has a mix of .NET Framework 4.x (legacy) and .NET 8 (modern) projects.
Prioritize migrating data pipeline services to .NET 10 first — they benefit most from
performance improvements. Leave web frontends on .NET 8 until the team is comfortable.

## Interview / Senior Dev Questions

1. **Q: What is Dynamic PGO and why does it matter for data-intensive applications?**
   A: Dynamic Profile-Guided Optimization lets the JIT recompile hot methods using runtime
   type/branch data. For data pipelines that iterate over millions of records, the JIT can
   devirtualize interface calls, optimize branch prediction, and inline more aggressively.
   The result is 10-30% faster throughput for compute-bound loops — with zero code changes.

2. **Q: When would you choose .NET 10 over .NET 8 for a new data pipeline project?**
   A: If the project will run in production beyond November 2026 (when .NET 8 LTS ends),
   start on .NET 10 directly. You also benefit from Native AOT improvements for CLI tools,
   better GC for large-heap workloads, and improved JSON serialization. The only reason to
   stay on .NET 8 is if a critical third-party library has not validated .NET 10 support.

3. **Q: How would you plan a migration from .NET 8 to .NET 10 for a suite of data pipelines?**
   A: Start with the lowest-risk pipeline (maybe a read-only reporting job). Update the
   target framework, NuGet packages, and CI pipeline. Run the full test suite, then do a
   parallel deployment (old and new) comparing output. Once validated, roll out to the rest
   of the suite. Use feature flags for any behavioral changes in serialization or I/O.

4. **Q: What is the difference between Server GC and Workstation GC, and which should a
   data pipeline use?**
   A: Server GC uses one GC thread per core and collects on a dedicated heap per core. It
   yields higher throughput but uses more memory. Workstation GC uses a single thread and is
   optimized for low latency in interactive apps. Data pipelines processing large batches
   should use Server GC. Console apps default to Workstation GC, so you must opt in.

## Quiz

**Question 1:** What type of release is .NET 10?

a) Standard Term Support (STS) — 18 months
b) Long-Term Support (LTS) — 3 years
c) Community support only
d) Preview-only release

<details>
<summary>Answer</summary>

**b) Long-Term Support (LTS) — 3 years.** .NET 10 ships November 2025 and is supported
until November 2028, making it suitable for production data pipelines.

</details>

**Question 2:** What does Dynamic PGO do that benefits data-heavy loops?

a) It compresses data in memory
b) It recompiles hot methods using runtime profiling data
c) It parallelizes all loops automatically
d) It enables GPU offloading

<details>
<summary>Answer</summary>

**b) It recompiles hot methods using runtime profiling data.** The JIT collects information
about which types and branches are actually used at runtime, then recompiles hot methods
with that knowledge — enabling devirtualization, better inlining, and optimized branches.

</details>

**Question 3:** You have a console app that processes a 2 GB CSV file. Which GC mode should
you configure and how?

a) Workstation GC — it is the default for console apps and sufficient
b) Server GC — add `<ServerGarbageCollection>true</ServerGarbageCollection>` to the `.csproj`
c) No GC — disable it entirely for large files
d) Concurrent GC — enabled via an environment variable

<details>
<summary>Answer</summary>

**b) Server GC.** Console apps default to Workstation GC, which is optimized for interactive
use. For throughput-heavy workloads like parsing a 2 GB file, Server GC provides better
performance by using one GC heap and thread per CPU core. Enable it in the project file.

</details>

**Question 4:** Which `global.json` setting should you use to ensure all team members build
with the same .NET 10 SDK minor version but allow patch updates?

a) `"rollForward": "disable"`
b) `"rollForward": "latestFeature"`
c) `"rollForward": "latestPatch"`
d) `"rollForward": "latestMajor"`

<details>
<summary>Answer</summary>

**c) `"rollForward": "latestPatch"`.** This pins to the specified feature band (e.g., 10.0.1xx)
but allows the latest patch within it. `"latestFeature"` would also allow jumping to
10.0.2xx, which might introduce new behaviors. For team consistency, `"latestPatch"` is the
safest choice.

</details>
