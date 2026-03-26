# Native AOT for .NET Tools

*Chapter 14.6 — Native AOT for .NET Tools*

## Overview

Native Ahead-of-Time (AOT) compilation produces a self-contained native executable from
your C# code — no .NET runtime needed on the target machine. For Data Engineers, this
is transformative for building CLI tools that start instantly, deploy as a single file,
and run in minimal container images.

Traditional .NET apps go through two compilation steps:
1. **Build time:** C# compiles to Intermediate Language (IL).
2. **Run time:** The JIT (Just-In-Time) compiler converts IL to native code on first use.

Native AOT eliminates step 2 by compiling everything to native code at build time. The
tradeoff: faster startup and smaller deployment, but some runtime features (like
unrestricted reflection) are not available.

Key benefits for DE automation:
- **Sub-50ms startup** — CLI tools feel instant.
- **Single-file deployment** — Copy one executable, done.
- **Smaller containers** — Base image can be `alpine` or `scratch` instead of the full
  .NET runtime image.
- **Lower memory footprint** — No JIT compiler loaded into memory.

## Core Concepts

### How Native AOT Works

```
Traditional .NET:
  C# source → [Roslyn] → IL (.dll) → [JIT at runtime] → Native code

Native AOT:
  C# source → [Roslyn] → IL (.dll) → [ILC at build time] → Native binary
```

ILC (IL Compiler) is the AOT compiler. It analyzes your entire application, resolves all
types and methods, and emits a native binary for the target platform.

### Enabling Native AOT

```xml
<!-- In your .csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>

    <!-- Enable Native AOT -->
    <PublishAot>true</PublishAot>

    <!-- Optional: strip symbols for smaller size -->
    <StripSymbols>true</StripSymbols>

    <!-- Optional: trim aggressively -->
    <TrimMode>link</TrimMode>
  </PropertyGroup>
</Project>
```

### Publishing

```bash
# Publish for the current platform
dotnet publish -c Release

# Publish for a specific platform
dotnet publish -c Release -r linux-x64
dotnet publish -c Release -r win-x64
dotnet publish -c Release -r osx-arm64

# Check the output size
ls -lh bin/Release/net10.0/linux-x64/publish/
```

### Size Comparison

| Deployment Type | Approximate Size | Startup Time |
|----------------|-----------------|--------------|
| Framework-dependent (.dll + runtime) | 150 MB runtime + 1 MB app | ~200ms |
| Self-contained (single file) | ~70 MB | ~150ms |
| Native AOT | ~8-15 MB | ~20-50ms |
| Native AOT + trimmed + stripped | ~3-8 MB | ~15-30ms |

### What Gets Compiled

The AOT compiler includes only code that is statically reachable:
- Your application code
- Referenced NuGet packages (that support trimming)
- Required framework libraries
- No unused framework code (trimmed away)

## Code Examples

### Simple CLI Tool: Data Validation

```csharp
// Program.cs — a CLI tool that validates a CSV budget file
using System.Diagnostics;
using System.Globalization;

var sw = Stopwatch.StartNew();

if (args.Length == 0)
{
    Console.Error.WriteLine("Usage: budget-validator <csv-file>");
    return 1;
}

string filePath = args[0];
if (!File.Exists(filePath))
{
    Console.Error.WriteLine($"File not found: {filePath}");
    return 1;
}

int rowCount = 0;
int errorCount = 0;
var errors = new List<string>();

await foreach (var line in File.ReadLinesAsync(filePath))
{
    rowCount++;
    if (rowCount == 1) continue; // skip header

    var fields = line.Split(',');
    if (fields.Length < 4)
    {
        errors.Add($"Row {rowCount}: Expected 4+ columns, got {fields.Length}");
        errorCount++;
        continue;
    }

    if (!decimal.TryParse(fields[2], NumberStyles.Any, CultureInfo.InvariantCulture, out _))
    {
        errors.Add($"Row {rowCount}: Invalid amount '{fields[2]}'");
        errorCount++;
    }

    if (!DateOnly.TryParse(fields[3], out _))
    {
        errors.Add($"Row {rowCount}: Invalid date '{fields[3]}'");
        errorCount++;
    }
}

sw.Stop();

Console.WriteLine($"Validated {rowCount - 1} rows in {sw.ElapsedMilliseconds}ms");
Console.WriteLine($"Errors: {errorCount}");

foreach (var error in errors.Take(20))
    Console.WriteLine($"  {error}");

if (errors.Count > 20)
    Console.WriteLine($"  ... and {errors.Count - 20} more");

return errorCount > 0 ? 1 : 0;
```

```xml
<!-- budget-validator.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <PublishAot>true</PublishAot>
    <StripSymbols>true</StripSymbols>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
</Project>
```

### CLI Tool with JSON Configuration

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

// Source-generated JSON serializer — AOT-compatible
[JsonSerializable(typeof(PipelineConfig))]
[JsonSerializable(typeof(List<PipelineStep>))]
internal partial class AppJsonContext : JsonSerializerContext { }

public class PipelineConfig
{
    public string Name { get; set; } = "";
    public string ConnectionString { get; set; } = "";
    public List<PipelineStep> Steps { get; set; } = [];
}

public class PipelineStep
{
    public string Type { get; set; } = "";
    public string Source { get; set; } = "";
    public string Destination { get; set; } = "";
    public int BatchSize { get; set; } = 1000;
}

// Usage with AOT-compatible deserialization
var configJson = await File.ReadAllTextAsync("pipeline-config.json");
var config = JsonSerializer.Deserialize(configJson, AppJsonContext.Default.PipelineConfig)
    ?? throw new InvalidOperationException("Invalid config");

Console.WriteLine($"Pipeline: {config.Name}");
foreach (var step in config.Steps)
{
    Console.WriteLine($"  Step: {step.Type} from {step.Source} to {step.Destination}");
}
```

```json
{
  "Name": "Nightly Cost Sync",
  "ConnectionString": "Server=bnbuilders-sql.database.windows.net;...",
  "Steps": [
    {
      "Type": "Extract",
      "Source": "Sage300Export",
      "Destination": "staging/raw",
      "BatchSize": 5000
    },
    {
      "Type": "Transform",
      "Source": "staging/raw",
      "Destination": "staging/clean",
      "BatchSize": 1000
    },
    {
      "Type": "Load",
      "Source": "staging/clean",
      "Destination": "AzureSQL",
      "BatchSize": 1000
    }
  ]
}
```

### CLI Tool with Argument Parsing

```csharp
// Using System.CommandLine (AOT-compatible in .NET 10)
using System.CommandLine;

var fileOption = new Option<FileInfo>(
    name: "--file",
    description: "The CSV file to process")
{ IsRequired = true };

var batchSizeOption = new Option<int>(
    name: "--batch-size",
    getDefaultValue: () => 1000,
    description: "Number of rows per batch");

var dryRunOption = new Option<bool>(
    name: "--dry-run",
    description: "Validate without writing to database");

var rootCommand = new RootCommand("BNBuilders Budget Loader")
{
    fileOption,
    batchSizeOption,
    dryRunOption
};

rootCommand.SetHandler(async (file, batchSize, dryRun) =>
{
    Console.WriteLine($"Processing: {file.FullName}");
    Console.WriteLine($"Batch size: {batchSize}");
    Console.WriteLine($"Dry run: {dryRun}");

    var rows = 0;
    await foreach (var line in File.ReadLinesAsync(file.FullName))
    {
        rows++;
        // Process each row...
    }

    Console.WriteLine($"Processed {rows} rows");
}, fileOption, batchSizeOption, dryRunOption);

return await rootCommand.InvokeAsync(args);
```

```bash
# Usage
./budget-loader --file budget_2026.csv --batch-size 5000 --dry-run
```

### Dockerfile for AOT Container

```dockerfile
# Build stage — needs the SDK
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
RUN apt-get update && apt-get install -y clang zlib1g-dev
WORKDIR /src
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -r linux-x64 -o /app

# Runtime stage — no .NET runtime needed!
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0-noble-chiseled AS runtime
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["./budget-validator"]
```

```bash
# Build and check image size
docker build -t budget-validator .
docker images budget-validator
# REPOSITORY          TAG       SIZE
# budget-validator    latest    ~15 MB  (vs ~200 MB with full runtime)
```

## Common Patterns

### AOT Decision Matrix

| Scenario | AOT? | Reason |
|----------|------|--------|
| CLI tool for dev team | Yes | Instant startup, single file distribution |
| Azure Function (isolated) | Yes | Cold start reduction |
| Console-app data pipeline | Maybe | Benefits from JIT's Dynamic PGO for long runs |
| ASP.NET Core API | Maybe | Startup matters less if always running |
| Tool using heavy reflection | No | Reflection is limited in AOT |
| Tool using Roslyn/scripting | No | Dynamic code gen not supported |

### Making Libraries AOT-Compatible

```csharp
// Mark your library as AOT-analyzable
// In your .csproj:
// <IsAotCompatible>true</IsAotCompatible>

// Use source generators instead of reflection:

// Bad — runtime reflection, breaks AOT
var properties = typeof(BudgetLine).GetProperties();
foreach (var prop in properties)
{
    var value = prop.GetValue(instance);
}

// Good — source-generated serialization, AOT-safe
[JsonSerializable(typeof(BudgetLine))]
internal partial class BudgetJsonContext : JsonSerializerContext { }
```

### Trimming Warnings

```bash
# Enable trim analysis warnings during development
dotnet publish -c Release -r linux-x64 /p:PublishAot=true

# You'll see warnings like:
# warning IL2026: Using 'System.Reflection...' which has
# 'RequiresUnreferencedCodeAttribute'
```

Handle warnings by:
1. Replacing reflection with source generators.
2. Using `[DynamicallyAccessedMembers]` attributes to preserve types.
3. Adding trim roots in a `rd.xml` file for types that must survive trimming.

## Gotchas and Pitfalls

1. **Reflection limitations** — `Type.GetType("SomeType")` by string name will fail if
   the type was trimmed. Always use concrete type references.

2. **Dynamic code generation** — `Reflection.Emit`, `Expression.Compile()`, and
   `AssemblyLoadContext` are not available. Libraries like Dapper (older versions) and
   AutoMapper rely on these — check compatibility.

3. **Platform-specific native dependencies** — AOT binaries are platform-specific. You need
   separate builds for `linux-x64`, `win-x64`, and `osx-arm64`.

4. **Build time** — AOT compilation is significantly slower than regular builds (2-5x).
   Only use `PublishAot` for the publish step, not during development.

5. **Debugging** — AOT binaries have limited debugging support. Debug with the JIT build,
   publish with AOT.

6. **NuGet package compatibility** — Not all NuGet packages support trimming/AOT. Check
   for `IsTrimmable` and `IsAotCompatible` in the package metadata. Common DE packages:

| Package | AOT-Compatible | Notes |
|---------|---------------|-------|
| System.Text.Json | Yes | Use source generators |
| Microsoft.Data.SqlClient | Partial | Basic scenarios work |
| Azure.Storage.Blobs | Partial | Improving in each release |
| Dapper | Recent versions | Use DapperAOT source generator |
| CsvHelper | Partial | Some features need reflection |
| Serilog | Yes | Most sinks compatible |

7. **`InvariantGlobalization`** — Setting this reduces binary size by ~5 MB by excluding
   ICU globalization data. But `CultureInfo` and culture-specific formatting stop working.
   For data pipelines that always use `InvariantCulture`, this is fine. For user-facing
   tools, keep it off.

8. **JSON serialization** — You MUST use `JsonSerializerContext` (source generator) for
   `System.Text.Json` in AOT. The reflection-based serializer does not work.

## Performance Considerations

### Startup Time Comparison

```
Scenario: CLI tool that reads a config file and validates 1000 CSV rows.

JIT (.NET 10):
  Process start → Main():  ~120ms
  Main() → Work done:      ~50ms
  Total:                    ~170ms

Native AOT (.NET 10):
  Process start → Main():  ~15ms
  Main() → Work done:      ~50ms
  Total:                    ~65ms
```

The startup improvement (120ms to 15ms) matters when:
- Running tools in a loop (e.g., validating 100 files in a script)
- Azure Functions cold starts
- Interactive CLI tools where responsiveness matters

### Throughput Comparison

For long-running workloads, JIT with Dynamic PGO can *outperform* AOT because PGO
optimizes based on actual runtime behavior. AOT uses generic optimizations.

```
Processing 1 million CSV rows:
  AOT:           2.1 seconds (static optimization)
  JIT (cold):    2.5 seconds (Tier 0, no PGO yet)
  JIT (warm):    1.8 seconds (Tier 1 + PGO kicks in)
```

Rule of thumb: Use AOT for short-lived tools. Use JIT for long-running pipelines.

### Memory Footprint

```
Idle memory after startup:
  JIT:        ~45 MB (runtime + JIT compiler + IL metadata)
  Native AOT: ~12 MB (just the native code + minimal runtime)
```

## BNBuilders Context

### CLI Toolbox for Data Engineering

Build a set of AOT-compiled CLI tools for your team:

```bash
# Directory structure
bn-tools/
├── budget-validator/     # Validate CSV exports from Sage
├── cost-code-lookup/     # Quick cost code reference
├── sql-runner/           # Execute parameterized SQL scripts
├── blob-uploader/        # Upload files to Azure Blob Storage
└── pipeline-trigger/     # Trigger ADF pipeline runs
```

Each tool compiles to a single executable that team members can run without installing
the .NET runtime:

```bash
# Distribute via a shared network drive or Azure Artifacts
\\bnbuilders-share\tools\budget-validator.exe budget_march_2026.csv
\\bnbuilders-share\tools\cost-code-lookup.exe 03-310

# Or on Linux/Mac
./budget-validator budget_march_2026.csv
```

### Azure Functions with AOT

For event-driven data pipelines (e.g., a Blob trigger that processes uploaded files):

```csharp
// AOT-compatible Azure Function (isolated worker model)
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

public class BlobProcessor
{
    private readonly ILogger<BlobProcessor> _logger;

    public BlobProcessor(ILogger<BlobProcessor> logger)
    {
        _logger = logger;
    }

    [Function("ProcessBudgetUpload")]
    public async Task Run(
        [BlobTrigger("budget-uploads/{name}", Connection = "AzureWebJobsStorage")]
        Stream blobStream,
        string name)
    {
        _logger.LogInformation("Processing blob: {Name}", name);

        using var reader = new StreamReader(blobStream);
        int rowCount = 0;

        while (await reader.ReadLineAsync() is { } line)
        {
            rowCount++;
            // Validate and transform...
        }

        _logger.LogInformation("Processed {Count} rows from {Name}", rowCount, name);
    }
}
```

Cold start reduction with AOT: ~800ms (JIT) to ~150ms (AOT). For a Blob trigger that
fires when Sage exports drop files nightly, this means faster processing of the first file.

### Build Pipeline for AOT Tools

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include: [main]
  paths:
    include: [tools/*]

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: UseDotNet@2
    inputs:
      version: '10.0.x'

  - script: |
      sudo apt-get update
      sudo apt-get install -y clang zlib1g-dev
    displayName: 'Install AOT prerequisites'

  - script: |
      for tool in budget-validator cost-code-lookup sql-runner; do
        dotnet publish tools/$tool -c Release -r linux-x64 -o publish/$tool
      done
    displayName: 'Build AOT tools'

  - task: PublishPipelineArtifact@1
    inputs:
      targetPath: 'publish'
      artifact: 'cli-tools'
```

## Interview / Senior Dev Questions

1. **Q: When would you choose Native AOT over JIT compilation for a data pipeline?**
   A: Choose AOT for short-lived CLI tools (validation scripts, data fixers, one-shot
   imports) where startup time dominates. Choose JIT for long-running pipelines (nightly
   ETL, streaming ingestion) where Dynamic PGO can optimize hot loops beyond what static
   AOT compilation achieves. Also choose JIT when you depend on reflection-heavy libraries.

2. **Q: What are the main limitations of Native AOT?**
   A: (a) No unrestricted reflection — `Type.GetType` by string fails for trimmed types.
   (b) No dynamic code generation (`Reflection.Emit`, `Expression.Compile`). (c) Platform-
   specific binaries — need separate builds per OS/arch. (d) Slower build times. (e) Not all
   NuGet packages are compatible.

3. **Q: How do you make `System.Text.Json` work with Native AOT?**
   A: Use the source generator by creating a `JsonSerializerContext`-derived class annotated
   with `[JsonSerializable(typeof(YourType))]`. The source generator creates serialization
   code at compile time, eliminating the need for runtime reflection.

4. **Q: A colleague's AOT build produces a 50 MB binary for a simple CLI tool. How would
   you reduce the size?**
   A: (a) Enable `<StripSymbols>true</StripSymbols>` to remove debug symbols. (b) Set
   `<InvariantGlobalization>true</InvariantGlobalization>` if culture-specific formatting
   is not needed. (c) Set `<TrimMode>link</TrimMode>` for aggressive trimming. (d) Remove
   unnecessary NuGet dependencies. (e) Use `IlcOptimizationPreference` set to `Size`.

## Quiz

**Question 1:** What is the primary advantage of Native AOT for CLI data tools?

a) The code runs with higher throughput than JIT
b) Near-instant startup time and single-file deployment
c) It supports all .NET features including reflection
d) It produces cross-platform binaries

<details>
<summary>Answer</summary>

**b) Near-instant startup time and single-file deployment.** AOT compiles to native code at
build time, eliminating JIT startup overhead. The resulting single executable can be deployed
without installing the .NET runtime. Note: AOT binaries are platform-specific, not
cross-platform, and throughput may actually be lower than JIT with PGO for long-running work.

</details>

**Question 2:** Why must you use `JsonSerializerContext` with Native AOT?

a) It is faster than the regular serializer
b) The reflection-based serializer cannot work without JIT/reflection
c) It produces smaller JSON output
d) It supports more JSON features

<details>
<summary>Answer</summary>

**b) The reflection-based serializer cannot work without JIT/reflection.** Native AOT trims
unused code and does not support unrestricted reflection. The `JsonSerializerContext` source
generator creates serialization code at compile time, making it AOT-compatible.

</details>

**Question 3:** For a nightly ETL pipeline that runs for 30 minutes processing 10M rows,
should you use Native AOT?

a) Yes — AOT is always faster
b) No — JIT with Dynamic PGO will optimize hot loops better for long-running processes
c) Yes — but only on Linux
d) It makes no difference

<details>
<summary>Answer</summary>

**b) No — JIT with Dynamic PGO will optimize hot loops better.** For long-running workloads,
the JIT compiler profiles the actual execution and recompiles hot methods with runtime-
specific optimizations. AOT uses static analysis, which cannot match PGO's runtime-informed
decisions. The 15ms startup savings is negligible compared to a 30-minute runtime.

</details>

**Question 4:** Which Dockerfile base image can you use for an AOT-compiled .NET app?

a) Only `mcr.microsoft.com/dotnet/aspnet:10.0`
b) Only `mcr.microsoft.com/dotnet/runtime:10.0`
c) `mcr.microsoft.com/dotnet/runtime-deps:10.0` or even `scratch`
d) AOT apps cannot run in Docker

<details>
<summary>Answer</summary>

**c) `runtime-deps` or even `scratch`.** AOT binaries only need native OS libraries (libc,
libssl, etc.), not the .NET runtime. The `runtime-deps` image provides just those native
dependencies. With static linking, you can even use the empty `scratch` image for the
smallest possible container.

</details>
