# Config-Driven Pipelines

*Chapter 13.9 — Data Engineering Patterns in C#*

## Overview

Hard-coding table names, column mappings, chunk sizes, and load strategies into C#
classes creates a maintenance nightmare. Every new table requires code changes, a PR,
and a deployment. Config-driven pipelines externalize these decisions into JSON manifests
that operators can modify without touching code.

This lesson covers job manifest design, per-table strategy configuration, pipeline
orchestration from config, table dependency graphs (load DimProject before FactJobCost),
and how to build a flexible, config-driven ETL framework in C#.

## Core Concepts

### Job Manifest
A JSON (or YAML) file that declares which tables to extract, how to extract them
(full vs. delta), where to load them, column mappings, chunk sizes, and dependencies.

### Per-Table Strategy
Each table can have a different extraction strategy (full, delta, chunked), transform
(inline C# or SQL stored proc), and load strategy (truncate-insert, merge, append).
Configuration drives the strategy selection.

### Pipeline Orchestration
A runner that reads the manifest, resolves dependencies, orders execution, and runs
each table's pipeline with the configured strategy.

### Table Dependency Graphs
Dimension tables must load before fact tables that reference them. Configuration
declares these dependencies; the orchestrator topologically sorts them.

## Code Examples

### Job Manifest Schema

```csharp
public record PipelineManifest(
    string Name,
    string Description,
    ManifestDefaults Defaults,
    IReadOnlyList<TableJob> Tables);

public record ManifestDefaults(
    string OracleConnectionString,
    string SqlServerConnectionString,
    int DefaultChunkSize,
    int DefaultMaxParallelism,
    int DefaultRetryCount,
    TimeSpan DefaultRetryDelay);

public record TableJob(
    string SourceSchema,
    string SourceTable,
    string TargetSchema,
    string TargetTable,
    string StagingTable,
    LoadType LoadType,                   // Full, Delta, Chunked
    LoadStrategy LoadStrategy,           // TruncateInsert, Merge, Append
    string? WatermarkColumn,
    WatermarkType? WatermarkType,
    string? ChunkColumn,
    int? ChunkSize,
    int? MaxParallelism,
    int? RetryCount,
    IReadOnlyList<string>? MergeKeyColumns,
    IReadOnlyList<ColumnMapping>? ColumnMappings,
    IReadOnlyList<string>? DependsOn,   // Tables that must load first
    string? PostLoadSql,                 // SQL to run after load
    bool Enabled);

public record ColumnMapping(
    string SourceColumn,
    string TargetColumn,
    string? Transform);                  // "Trim", "Upper", "ToDate", etc.

public enum LoadType { Full, Delta, Chunked }
public enum LoadStrategy { TruncateInsert, Merge, Append }
```

### Sample Manifest JSON

```json
{
  "name": "CMiC-to-Warehouse-Nightly",
  "description": "Nightly sync of CMiC Oracle tables to SQL Server warehouse",
  "defaults": {
    "oracleConnectionString": "${ORACLE_CONNECTION}",
    "sqlServerConnectionString": "${SQLSERVER_CONNECTION}",
    "defaultChunkSize": 50000,
    "defaultMaxParallelism": 8,
    "defaultRetryCount": 3,
    "defaultRetryDelay": "00:00:02"
  },
  "tables": [
    {
      "sourceSchema": "cmic",
      "sourceTable": "JCHEAD",
      "targetSchema": "dw",
      "targetTable": "DimProject",
      "stagingTable": "staging.DimProject",
      "loadType": "Full",
      "loadStrategy": "Merge",
      "mergeKeyColumns": ["ProjectId"],
      "columnMappings": [
        { "sourceColumn": "JOB_NUMBER", "targetColumn": "ProjectId", "transform": "Trim" },
        { "sourceColumn": "JOB_NAME", "targetColumn": "ProjectName", "transform": "Trim" },
        { "sourceColumn": "JOB_STATUS", "targetColumn": "Status" },
        { "sourceColumn": "START_DATE", "targetColumn": "StartDate", "transform": "ToDate" }
      ],
      "dependsOn": [],
      "enabled": true
    },
    {
      "sourceSchema": "cmic",
      "sourceTable": "JCDETL",
      "targetSchema": "dw",
      "targetTable": "FactJobCost",
      "stagingTable": "staging.FactJobCost",
      "loadType": "Delta",
      "loadStrategy": "Merge",
      "watermarkColumn": "MODIFIED_DATE",
      "watermarkType": "DateTime",
      "chunkColumn": "TRANSACTION_ID",
      "chunkSize": 50000,
      "maxParallelism": 8,
      "mergeKeyColumns": ["TransactionId"],
      "columnMappings": [
        { "sourceColumn": "TRANSACTION_ID", "targetColumn": "TransactionId" },
        { "sourceColumn": "JOB_NUMBER", "targetColumn": "ProjectId", "transform": "Trim" },
        { "sourceColumn": "COST_CODE", "targetColumn": "CostCode", "transform": "Trim" },
        { "sourceColumn": "AMOUNT", "targetColumn": "Amount" },
        { "sourceColumn": "POSTING_DATE", "targetColumn": "PostingDate", "transform": "ToDate" },
        { "sourceColumn": "COST_TYPE", "targetColumn": "CostTypeCode" }
      ],
      "dependsOn": ["DimProject", "DimCostCode"],
      "postLoadSql": "EXEC dw.usp_RefreshJobCostSummary",
      "enabled": true
    },
    {
      "sourceSchema": "cmic",
      "sourceTable": "EQUIP",
      "targetSchema": "dw",
      "targetTable": "DimEquipment",
      "stagingTable": "staging.DimEquipment",
      "loadType": "Full",
      "loadStrategy": "Merge",
      "mergeKeyColumns": ["EquipmentId"],
      "dependsOn": [],
      "enabled": true
    }
  ]
}
```

### Manifest Loader with Environment Variable Substitution

```csharp
public class ManifestLoader
{
    public PipelineManifest Load(string filePath)
    {
        var json = File.ReadAllText(filePath);

        // Replace ${ENV_VAR} placeholders with environment variables
        json = Regex.Replace(json, @"\$\{(\w+)\}", match =>
        {
            var varName = match.Groups[1].Value;
            return Environment.GetEnvironmentVariable(varName)
                ?? throw new InvalidOperationException(
                    $"Environment variable '{varName}' not set");
        });

        var manifest = JsonSerializer.Deserialize<PipelineManifest>(json,
            new JsonSerializerOptions
            {
                PropertyNameCamelCase = true,
                Converters = { new JsonStringEnumConverter() }
            })
            ?? throw new InvalidOperationException("Failed to parse manifest");

        Validate(manifest);
        return manifest;
    }

    private void Validate(PipelineManifest manifest)
    {
        foreach (var table in manifest.Tables.Where(t => t.Enabled))
        {
            if (table.LoadType == LoadType.Delta && table.WatermarkColumn is null)
                throw new InvalidOperationException(
                    $"Table {table.SourceTable}: Delta load requires WatermarkColumn");

            if (table.LoadStrategy == LoadStrategy.Merge
                && (table.MergeKeyColumns is null || table.MergeKeyColumns.Count == 0))
                throw new InvalidOperationException(
                    $"Table {table.SourceTable}: Merge strategy requires MergeKeyColumns");

            if (table.LoadType == LoadType.Chunked && table.ChunkColumn is null)
                throw new InvalidOperationException(
                    $"Table {table.SourceTable}: Chunked load requires ChunkColumn");
        }
    }
}
```

### Dependency Graph and Topological Sort

```csharp
public class DependencyResolver
{
    /// <summary>
    /// Topologically sorts tables so dependencies are loaded first.
    /// Returns groups of tables that can be loaded in parallel within each group.
    /// </summary>
    public IReadOnlyList<IReadOnlyList<TableJob>> Resolve(
        IReadOnlyList<TableJob> tables)
    {
        var enabledTables = tables.Where(t => t.Enabled).ToList();
        var byTarget = enabledTables.ToDictionary(
            t => t.TargetTable, StringComparer.OrdinalIgnoreCase);

        // Validate dependencies exist
        foreach (var table in enabledTables)
        {
            foreach (var dep in table.DependsOn ?? [])
            {
                if (!byTarget.ContainsKey(dep))
                    throw new InvalidOperationException(
                        $"Table {table.TargetTable} depends on " +
                        $"'{dep}' which is not in the manifest");
            }
        }

        // Kahn's algorithm for topological sort with level grouping
        var inDegree = enabledTables.ToDictionary(
            t => t.TargetTable, _ => 0,
            StringComparer.OrdinalIgnoreCase);

        foreach (var table in enabledTables)
        {
            foreach (var dep in table.DependsOn ?? [])
            {
                inDegree[table.TargetTable]++;
            }
        }

        var result = new List<IReadOnlyList<TableJob>>();
        var remaining = new HashSet<string>(
            inDegree.Keys, StringComparer.OrdinalIgnoreCase);

        while (remaining.Count > 0)
        {
            // Find all tables with no unresolved dependencies
            var ready = remaining
                .Where(t => inDegree[t] == 0)
                .ToList();

            if (ready.Count == 0)
                throw new InvalidOperationException(
                    "Circular dependency detected among: " +
                    string.Join(", ", remaining));

            // This group can run in parallel
            var group = ready
                .Select(t => byTarget[t])
                .ToList();
            result.Add(group);

            // Remove resolved tables and update in-degrees
            foreach (var resolved in ready)
            {
                remaining.Remove(resolved);
                foreach (var table in enabledTables)
                {
                    if (table.DependsOn?.Contains(resolved,
                        StringComparer.OrdinalIgnoreCase) == true)
                    {
                        inDegree[table.TargetTable]--;
                    }
                }
            }
        }

        return result;
    }
}
```

### Pipeline Orchestrator

```csharp
public class PipelineOrchestrator
{
    private readonly ManifestLoader _manifestLoader;
    private readonly DependencyResolver _resolver;
    private readonly PipelineFactory _factory;
    private readonly ILogger _logger;

    public async Task<OrchestratorResult> RunManifestAsync(
        string manifestPath, CancellationToken ct)
    {
        var manifest = _manifestLoader.Load(manifestPath);
        var groups = _resolver.Resolve(manifest.Tables);
        var results = new List<TableResult>();

        _logger.LogInformation(
            "Manifest {Name}: {TableCount} tables in {GroupCount} dependency groups",
            manifest.Name, manifest.Tables.Count(t => t.Enabled), groups.Count);

        for (int g = 0; g < groups.Count; g++)
        {
            var group = groups[g];
            _logger.LogInformation(
                "Group {Group}/{Total}: {Tables}",
                g + 1, groups.Count,
                string.Join(", ", group.Select(t => t.TargetTable)));

            // Run tables within a group in parallel
            var tasks = group.Select(async table =>
            {
                try
                {
                    var pipeline = _factory.Create(table, manifest.Defaults);
                    var result = await pipeline.RunAsync(ct);
                    return new TableResult(table.TargetTable, result, null);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "Table {Table} failed", table.TargetTable);
                    return new TableResult(
                        table.TargetTable, null, ex.Message);
                }
            });

            var groupResults = await Task.WhenAll(tasks);
            results.AddRange(groupResults);

            // If a dependency failed, skip dependent tables
            var failed = groupResults
                .Where(r => r.Error is not null)
                .Select(r => r.TableName)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            if (failed.Count > 0)
            {
                // Find tables in later groups that depend on failed tables
                for (int later = g + 1; later < groups.Count; later++)
                {
                    foreach (var table in groups[later])
                    {
                        if (table.DependsOn?.Any(d =>
                            failed.Contains(d)) == true)
                        {
                            _logger.LogWarning(
                                "Skipping {Table}: dependency {Dep} failed",
                                table.TargetTable,
                                table.DependsOn.First(d => failed.Contains(d)));
                        }
                    }
                }
            }
        }

        return new OrchestratorResult(manifest.Name, results);
    }
}

public record TableResult(
    string TableName,
    PipelineResult? Result,
    string? Error);

public record OrchestratorResult(
    string ManifestName,
    IReadOnlyList<TableResult> Results)
{
    public int Succeeded => Results.Count(r => r.Error is null);
    public int Failed => Results.Count(r => r.Error is not null);
}
```

### Pipeline Factory: Config to Runtime

```csharp
public class PipelineFactory
{
    private readonly IServiceProvider _services;

    public IDataPipeline Create(TableJob job, ManifestDefaults defaults)
    {
        var chunkSize = job.ChunkSize ?? defaults.DefaultChunkSize;
        var parallelism = job.MaxParallelism ?? defaults.DefaultMaxParallelism;
        var retries = job.RetryCount ?? defaults.DefaultRetryCount;

        // Select extraction strategy based on config
        IExtractStrategy extractor = job.LoadType switch
        {
            LoadType.Full => new FullExtractStrategy(
                defaults.OracleConnectionString),
            LoadType.Delta => new DeltaExtractStrategy(
                defaults.OracleConnectionString,
                job.WatermarkColumn!,
                _services.GetRequiredService<IWatermarkStore>()),
            LoadType.Chunked => new ChunkedExtractStrategy(
                defaults.OracleConnectionString,
                job.ChunkColumn!,
                chunkSize,
                parallelism),
            _ => throw new ArgumentOutOfRangeException()
        };

        // Select load strategy based on config
        ILoadStrategy loader = job.LoadStrategy switch
        {
            LoadStrategy.TruncateInsert => new TruncateInsertLoader(
                defaults.SqlServerConnectionString,
                job.StagingTable, job.TargetSchema + "." + job.TargetTable),
            LoadStrategy.Merge => new MergeLoader(
                defaults.SqlServerConnectionString,
                job.StagingTable, job.TargetSchema + "." + job.TargetTable,
                job.MergeKeyColumns!),
            LoadStrategy.Append => new AppendLoader(
                defaults.SqlServerConnectionString,
                job.TargetSchema + "." + job.TargetTable),
            _ => throw new ArgumentOutOfRangeException()
        };

        // Build column mapper from config
        var mapper = job.ColumnMappings is not null
            ? new ConfigurableMapper(job.ColumnMappings)
            : new PassThroughMapper();

        return new ConfiguredPipeline(
            job, extractor, mapper, loader, retries,
            _services.GetRequiredService<ILogger<ConfiguredPipeline>>());
    }
}
```

### Column Transform from Config

```csharp
public class ConfigurableMapper
{
    private readonly IReadOnlyList<ColumnMapping> _mappings;

    public ConfigurableMapper(IReadOnlyList<ColumnMapping> mappings)
        => _mappings = mappings;

    public Dictionary<string, object?> MapRow(
        Dictionary<string, object?> sourceRow)
    {
        var result = new Dictionary<string, object?>(
            StringComparer.OrdinalIgnoreCase);

        foreach (var mapping in _mappings)
        {
            if (!sourceRow.TryGetValue(mapping.SourceColumn, out var value))
                continue;

            result[mapping.TargetColumn] = mapping.Transform switch
            {
                "Trim" => (value as string)?.Trim(),
                "Upper" => (value as string)?.Trim().ToUpperInvariant(),
                "ToDate" => value is DateTime dt ? DateOnly.FromDateTime(dt) : value,
                "ToDecimal" => Convert.ToDecimal(value),
                null => value,
                _ => throw new InvalidOperationException(
                    $"Unknown transform: {mapping.Transform}")
            };
        }

        return result;
    }
}
```

## Common Patterns

### Pattern 1: Environment-Specific Overrides

```
manifests/
  base.json              ← shared table definitions
  dev.overrides.json     ← dev connection strings, smaller chunks
  prod.overrides.json    ← prod connection strings, full parallelism
```

```csharp
public PipelineManifest LoadWithOverrides(string basePath, string overridePath)
{
    var baseManifest = Load(basePath);
    var overrides = Load(overridePath);

    // Merge: overrides replace base values where present
    return MergeManifests(baseManifest, overrides);
}
```

### Pattern 2: Manifest Versioning

Store manifests in source control. Tag each deployment with the manifest version. The
pipeline run log records which manifest version produced each load.

### Pattern 3: Dry Run Mode

```csharp
public async Task DryRunAsync(string manifestPath)
{
    var manifest = _loader.Load(manifestPath);
    var groups = _resolver.Resolve(manifest.Tables);

    Console.WriteLine($"Manifest: {manifest.Name}");
    Console.WriteLine($"Tables: {manifest.Tables.Count(t => t.Enabled)} enabled");
    Console.WriteLine($"Dependency groups: {groups.Count}");

    for (int g = 0; g < groups.Count; g++)
    {
        Console.WriteLine($"\n  Group {g + 1} (parallel):");
        foreach (var table in groups[g])
        {
            Console.WriteLine(
                $"    {table.SourceSchema}.{table.SourceTable} " +
                $"→ {table.TargetSchema}.{table.TargetTable} " +
                $"[{table.LoadType}/{table.LoadStrategy}]");
        }
    }
}
```

## Gotchas and Pitfalls

### 1. Config Validation at Startup
Validate the entire manifest before running any tables. A typo in the 30th table's
config should not cause a failure after 29 tables have already loaded.

### 2. Circular Dependencies
If TableA depends on TableB and TableB depends on TableA, the topological sort fails.
Detect and report cycles at validation time with a clear error message.

### 3. Secret Management
Do NOT put connection strings directly in JSON manifests. Use environment variable
placeholders (`${ORACLE_CONNECTION}`) or a secrets manager (Azure Key Vault in a
Microsoft shop).

### 4. Schema Drift
If a CMiC DBA adds a column to a source table, the column mappings in the manifest
may be incomplete. Consider a "passthrough" mode that maps all columns by name,
alongside explicit mappings for columns that need transforms.

### 5. Over-Configuration
If every aspect is configurable, the manifest becomes as complex as code. Keep the
manifest focused on WHAT (tables, strategies, dependencies) and let the code handle
HOW (retry logic, connection management, error handling).

### 6. Testing Config Changes
A config change is a deployment. Test manifests in dev/staging before production.
Use the dry-run mode to validate dependency resolution and strategy selection.

## Performance Considerations

- **Dependency groups enable parallelism.** Tables with no dependencies (all dimension
  tables) load in parallel in the first group. Fact tables load in parallel in the
  second group. This can cut total pipeline time by 50%+.
- **Per-table parallelism tuning.** Some tables benefit from 8 parallel Oracle readers;
  others (small dimension tables) need only 1. Config lets you tune per table.
- **Manifest caching.** For frequently-run pipelines, cache the parsed manifest and
  dependency resolution. Re-parse only when the file changes.
- **Connection pooling across tables.** All tables in a group share the same Oracle
  connection pool. Size the pool for the maximum parallelism across all tables in the
  largest group.

## BNBuilders Context

### CMiC Table Inventory

A typical BNBuilders CMiC-to-warehouse manifest includes:

| Group | Tables | Strategy |
|-------|--------|----------|
| 1 (Dimensions) | DimProject, DimCostCode, DimEmployee, DimVendor, DimEquipment | Full/Merge |
| 2 (Facts) | FactJobCost, FactPurchaseOrder, FactAPInvoice | Delta/Merge |
| 3 (Aggregates) | FactJobCostSummary, FactMonthlySpend | PostLoadSql |

### Operator Workflow

A data engineer at BNBuilders can:
1. Add a new CMiC table by adding a JSON entry to the manifest
2. Disable a table temporarily by setting `"enabled": false`
3. Force a full reload by changing `"loadType": "Full"` for one run
4. Adjust chunk sizes during month-end when data volumes spike

No code changes, no PR, no deployment for these operations.

### Power BI Refresh Dependency

After the warehouse load completes, Power BI datasets should refresh. The manifest
can include a `postLoadSql` that calls a stored proc to log completion, which a
Power BI gateway schedule monitors.

## Interview / Senior Dev Questions

1. **"Why use config-driven pipelines instead of coded pipelines?"**
   Separation of concerns. Table definitions (WHAT to load) change frequently and can
   be managed by operators. Pipeline logic (HOW to load) changes rarely and is managed
   by developers. Config-driven pipelines let each change independently.

2. **"How do you handle table dependency failures?"**
   If DimProject fails, skip FactJobCost (which depends on it). Log the skip, alert
   the team, and continue with independent tables. The next run retries both.

3. **"How do you version and deploy manifest changes?"**
   Store manifests in git alongside code. Use feature branches for manifest changes.
   Test in dev/staging. Tag releases. The pipeline run log records the manifest hash
   for traceability.

4. **"What is the risk of over-configuration?"**
   The manifest becomes as complex as code but without compile-time checks, IDE support,
   or unit tests. Keep the config focused on data (tables, columns, strategies) and let
   code handle behavior (retry, error handling, connection management).

## Quiz

### Question 1
Your manifest has FactJobCost depending on DimProject and DimCostCode. DimProject
depends on nothing. DimCostCode depends on nothing. How many dependency groups are there?

<details>
<summary>Show Answer</summary>

**2 groups.** Group 1: DimProject and DimCostCode (no dependencies, run in parallel).
Group 2: FactJobCost (depends on both, runs after Group 1 completes).
</details>

### Question 2
A manifest has `"oracleConnectionString": "Data Source=prod-oracle;..."` hard-coded.
What is wrong?

<details>
<summary>Show Answer</summary>

**Security risk and inflexibility.** The connection string (potentially with credentials)
is stored in a file that may be committed to source control. It also cannot vary between
environments (dev/staging/prod). Fix: use environment variable placeholders
(`"${ORACLE_CONNECTION}"`) and set the actual value in the deployment environment, or
use a secrets manager like Azure Key Vault.
</details>

### Question 3
DimProject depends on DimRegion. DimRegion depends on DimProject. What happens when
the dependency resolver runs?

<details>
<summary>Show Answer</summary>

**Circular dependency error.** The topological sort detects that neither table can have
its in-degree reduced to zero. The resolver should throw an `InvalidOperationException`
with a clear message identifying the cycle. Fix: remove the circular dependency by
restructuring the data model or breaking the cycle with a two-pass load.
</details>

### Question 4
You add a new CMiC table to the manifest. What is the minimum testing you should do
before deploying to production?

<details>
<summary>Show Answer</summary>

1. **Manifest validation**: run the dry-run mode to verify parsing, dependency
   resolution, and strategy selection.
2. **Dev environment load**: run the pipeline against dev Oracle and SQL Server to
   verify extraction, column mappings, and load strategy work correctly.
3. **Row count verification**: compare row counts between source and destination.
4. **Spot-check data**: verify a sample of rows match between source and destination.
5. **Idempotency test**: run twice and verify no duplicates.
</details>
