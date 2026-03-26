# ETL vs ELT Patterns

*Chapter 13.1 — Data Engineering Patterns in C#*

## Overview

ETL (Extract-Transform-Load) and ELT (Extract-Load-Transform) are the two fundamental
paradigms for moving data between systems. The difference is not just ordering — it
determines where compute happens, how you handle schema evolution, and what tools you
reach for. As a Data Engineer at a construction company running Oracle (CMiC) and
SQL Server, you live in a world where both patterns coexist, and choosing wrong costs
real money in developer time, compute, and stale data.

This lesson covers the tradeoffs, when each wins, hybrid approaches that blend the two,
and how to implement both in C# with clean abstractions.

## Core Concepts

### ETL — Extract, Transform, Load

Data is pulled from the source, transformed in-flight (in your C# process), and then
written to the destination in its final shape.

**Characteristics:**
- Transformation logic lives in application code (C#, Python, etc.)
- Source system sees only read queries
- Destination receives clean, shaped data
- Your process owns compute for transforms
- Good when transforms are complex or involve multiple sources

### ELT — Extract, Load, Transform

Data is pulled from the source, loaded raw into a staging area, and then transformed
inside the destination database using SQL.

**Characteristics:**
- Transformation logic lives in SQL (stored procs, views, CTEs)
- Destination database owns compute for transforms
- Raw data is preserved in staging tables
- Good when SQL Server's engine is faster than your app at set-based ops
- Enables re-transformation without re-extraction

### The Spectrum

In practice, most pipelines are hybrid. You might do light transforms in C# (type
mapping, null handling) and heavy transforms in SQL (joins, aggregations, window
functions). The key is being intentional about where each transform lives.

```
Pure ETL ←————————————————————→ Pure ELT
   |         Hybrid              |
   |  C# does mapping,          |
   |  SQL does aggregation      |
   |                             |
   App compute                DB compute
```

## Code Examples

### Classic ETL: Transform in C#

```csharp
public class JobCostEtlPipeline
{
    private readonly OracleConnection _source;
    private readonly SqlConnection _destination;

    public async Task RunAsync(CancellationToken ct)
    {
        // EXTRACT — read from Oracle (CMiC)
        var rawRecords = await ExtractJobCostsAsync(ct);

        // TRANSFORM — in C# memory
        var transformed = rawRecords
            .Where(r => r.JobNumber != null)
            .Select(r => new JobCostFact
            {
                JobKey = NormalizeJobNumber(r.JobNumber),
                CostCode = r.CostCode?.Trim() ?? "UNKNOWN",
                Amount = r.OriginalAmount ?? 0m,
                PostingDate = r.PostingDate ?? DateOnly.MinValue,
                CostType = MapCostType(r.CmicCostType),
                LoadedAtUtc = DateTime.UtcNow
            })
            .ToList();

        // LOAD — bulk insert to SQL Server
        await BulkLoadAsync(transformed, ct);
    }

    private static string NormalizeJobNumber(string raw)
    {
        // CMiC stores "  2301-00 " — normalize to "2301-00"
        return raw.Trim().ToUpperInvariant();
    }

    private static CostType MapCostType(string cmicType) => cmicType switch
    {
        "L" => CostType.Labor,
        "M" => CostType.Material,
        "S" => CostType.Subcontract,
        "E" => CostType.Equipment,
        "O" => CostType.Other,
        _   => CostType.Unknown
    };
}
```

### Classic ELT: Transform in SQL

```csharp
public class JobCostEltPipeline
{
    private readonly OracleConnection _source;
    private readonly SqlConnection _destination;

    public async Task RunAsync(CancellationToken ct)
    {
        // EXTRACT + LOAD — dump raw data into staging
        var rawRecords = await ExtractRawAsync(ct);
        await BulkLoadToStagingAsync(rawRecords, ct);

        // TRANSFORM — in SQL Server
        await TransformInDatabaseAsync(ct);
    }

    private async Task TransformInDatabaseAsync(CancellationToken ct)
    {
        const string sql = @"
            INSERT INTO dw.JobCostFact
                (JobKey, CostCode, Amount, PostingDate, CostType, LoadedAtUtc)
            SELECT
                LTRIM(RTRIM(UPPER(s.JobNumber)))     AS JobKey,
                ISNULL(LTRIM(RTRIM(s.CostCode)), 'UNKNOWN') AS CostCode,
                ISNULL(s.OriginalAmount, 0)           AS Amount,
                ISNULL(s.PostingDate, '0001-01-01')   AS PostingDate,
                CASE s.CmicCostType
                    WHEN 'L' THEN 'Labor'
                    WHEN 'M' THEN 'Material'
                    WHEN 'S' THEN 'Subcontract'
                    WHEN 'E' THEN 'Equipment'
                    WHEN 'O' THEN 'Other'
                    ELSE 'Unknown'
                END                                    AS CostType,
                SYSUTCDATETIME()                       AS LoadedAtUtc
            FROM staging.JobCostRaw s
            WHERE s.JobNumber IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dw.JobCostFact f
                  WHERE f.JobKey = LTRIM(RTRIM(UPPER(s.JobNumber)))
                    AND f.PostingDate = s.PostingDate
              );";

        await using var cmd = new SqlCommand(sql, _destination);
        cmd.CommandTimeout = 300;
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
```

### Hybrid: Light ETL + Heavy ELT

```csharp
public class HybridJobCostPipeline
{
    public async Task RunAsync(CancellationToken ct)
    {
        // EXTRACT from Oracle
        var raw = await ExtractAsync(ct);

        // LIGHT TRANSFORM in C# — type mapping, encoding fixes
        var cleaned = raw.Select(r => new
        {
            JobNumber = r.JobNumber?.Trim().ToUpperInvariant(),
            r.CostCode,
            r.Amount,
            r.PostingDate,
            r.CmicCostType,
            ExtractedAtUtc = DateTime.UtcNow
        });

        // LOAD to staging
        await BulkLoadToStagingAsync(cleaned, ct);

        // HEAVY TRANSFORM in SQL — joins, aggregations, SCD logic
        await ExecuteSqlTransformAsync(@"
            EXEC dw.usp_TransformJobCosts;   -- joins to dim tables
            EXEC dw.usp_BuildCostSummary;    -- aggregation layer
            EXEC dw.usp_UpdateJobSCD;        -- slowly changing dims
        ", ct);
    }
}
```

### Abstraction That Supports Both

```csharp
public interface IDataPipeline
{
    string Name { get; }
    PipelineStrategy Strategy { get; }  // ETL, ELT, Hybrid
    Task<PipelineResult> ExecuteAsync(CancellationToken ct);
}

public enum PipelineStrategy
{
    Etl,
    Elt,
    Hybrid
}

public record PipelineResult(
    string PipelineName,
    int RowsExtracted,
    int RowsLoaded,
    int RowsTransformed,
    TimeSpan Duration,
    PipelineStrategy Strategy);
```

## Common Patterns

### Pattern 1: Stage-Then-Transform (ELT)

Almost every ELT pipeline follows this skeleton:

1. Truncate or swap the staging table
2. Bulk-load raw data into staging
3. Run SQL transforms from staging to target
4. Log results and update watermark

```csharp
public async Task StageAndTransform(CancellationToken ct)
{
    await TruncateStagingAsync(ct);
    var rows = await BulkLoadStagingAsync(ct);
    var transformed = await RunSqlTransformsAsync(ct);
    await UpdateWatermarkAsync(rows, transformed, ct);
}
```

### Pattern 2: Stream Transform (ETL)

For row-by-row or micro-batch processing:

```csharp
public async IAsyncEnumerable<TOut> StreamTransformAsync<TIn, TOut>(
    IAsyncEnumerable<TIn> source,
    Func<TIn, TOut> transform,
    [EnumeratorCancellation] CancellationToken ct = default)
{
    await foreach (var item in source.WithCancellation(ct))
    {
        yield return transform(item);
    }
}
```

### Pattern 3: Decision Matrix

```csharp
public PipelineStrategy ChooseStrategy(TableConfig config)
{
    // If transforms require C#-only logic (API calls, file parsing), use ETL
    if (config.RequiresExternalEnrichment)
        return PipelineStrategy.Etl;

    // If transforms are heavy joins/aggregations, let SQL Server do it
    if (config.HasComplexJoins || config.HasWindowFunctions)
        return PipelineStrategy.Elt;

    // Default: hybrid — clean in C#, aggregate in SQL
    return PipelineStrategy.Hybrid;
}
```

## Gotchas and Pitfalls

### 1. ETL Memory Pressure
Loading all rows into C# memory for transformation can blow up your process. A 10M-row
table of job cost details at 500 bytes/row = 5 GB in memory before you even transform.
Use streaming (`IAsyncEnumerable`) or chunking instead of `.ToList()`.

### 2. ELT Staging Table Bloat
If you load raw data to staging but don't clean up, your tempdb or staging schema grows
unbounded. Always truncate staging tables after successful transforms.

### 3. Type Mismatches in ELT
When you skip C# transforms, you lose compile-time type safety. Oracle NUMBER(15,2)
loaded as-is might silently truncate when SQL Server casts to DECIMAL(10,2). Define
staging table schemas explicitly.

### 4. Transform Duplication
In hybrid approaches, you can end up with the same transform in both C# and SQL. A
field trimmed in C# and again in SQL wastes CPU and makes maintenance harder. Document
which transforms happen where.

### 5. Network Bottleneck in ETL
If your C# process runs on a different machine than the database, every row crosses the
network twice in ETL (read from source, write to destination). ELT with staging tables
on the destination server avoids the second hop for transforms.

### 6. Oracle to SQL Server Date Handling
Oracle DATE includes time. SQL Server DATE does not. If your ETL strips time from
Oracle DATEs, you might lose information. If your ELT loads raw, the staging column
must be DATETIME2 to preserve the time component.

## Performance Considerations

| Factor | ETL | ELT |
|--------|-----|-----|
| **Network trips** | 2 (read + write shaped) | 2 (read + write raw) + 0 for transform |
| **Compute location** | App server | Database server |
| **Memory pressure** | High (rows in C# heap) | Low (rows in DB temp storage) |
| **Parallelism** | C# `Parallel.ForEachAsync` | SQL parallel query plans |
| **Index usage** | None during transform | Full index/statistics |
| **Complex joins** | Slow (hash join in memory) | Fast (query optimizer) |
| **External API calls** | Natural fit | Impossible in SQL |
| **Debugging** | Breakpoints, logging | Execution plans, DMVs |

**Rules of thumb:**
- If the transform is a JOIN across tables already in SQL Server, ELT wins.
- If the transform calls an external API or parses a file, ETL wins.
- If you need to replay transforms with different logic, ELT with raw staging wins.
- If the dataset is under 100K rows, the difference is negligible — optimize for
  developer clarity.

## BNBuilders Context

### Oracle CMiC to SQL Server Warehouse

BNBuilders runs CMiC on Oracle for project management, job costing, and accounting.
The BI warehouse lives in SQL Server. This is a textbook cross-platform ETL scenario.

**Why Hybrid Wins Here:**

1. **Extract from Oracle** — Use ODP.NET or Oracle.ManagedDataAccess to read from CMiC
   tables like `JCDETL` (job cost detail), `EQUIP` (equipment), `EMPL` (employees).

2. **Light C# Transform** — Fix Oracle-specific quirks: CHAR padding, NUMBER precision,
   Oracle DATE → C# DateTime mapping, CMiC-specific code normalization.

3. **Bulk Load to SQL Server Staging** — Use SqlBulkCopy for high-speed loading.

4. **SQL Transform** — Join to dimension tables (DimProject, DimCostCode, DimEmployee),
   apply SCD Type 2 logic, build aggregate fact tables for Power BI.

### Typical Table Flow

```
Oracle CMiC (JCDETL)
    → C# Extract (ODP.NET, chunked by ROWID)
    → C# Light Transform (trim, type-map)
    → SQL Server staging.JobCostDetail_Raw
    → SQL Transform (MERGE into dw.FactJobCost)
    → Power BI reads from dw.FactJobCost
```

### Job Cost Specifics

CMiC job cost codes follow a hierarchy: Job → Phase → Cost Code → Cost Type.
In Oracle, these might be separate columns or concatenated strings. The ETL layer
(C#) is the right place to parse and normalize these. The ELT layer (SQL) is the
right place to join them to the dimension hierarchy and compute running totals.

### Equipment Tracking

Equipment data in CMiC tracks utilization by job. The extract pulls daily equipment
assignments. C# handles the Oracle-specific date arithmetic, and SQL handles the
pivot from daily rows to monthly utilization summaries for the BI dashboard.

## Interview / Senior Dev Questions

1. **"When would you choose ETL over ELT?"**
   When transforms require logic unavailable in SQL: external API enrichment, complex
   file parsing, ML model inference, or when the destination database lacks compute
   capacity for heavy transforms.

2. **"How do you prevent data loss in ELT staging?"**
   Use swap-table patterns instead of TRUNCATE. Load into a shadow table, verify row
   counts, then rename. Keep the previous staging table as a backup for one cycle.

3. **"What are the risks of a pure C# ETL for a 50M-row table?"**
   Memory pressure from materializing rows, GC pauses, network bandwidth for two
   full data transfers, and inability to leverage database indexes during transforms.
   Mitigate with streaming, chunking, and bounded memory buffers.

4. **"How would you refactor a monolithic ETL into a hybrid pipeline?"**
   Identify transforms that are set-based operations (joins, aggregations, window
   functions) and move them to SQL post-load. Keep row-level cleaning and type mapping
   in C#. Measure before and after to validate the refactor.

5. **"How do you test that ETL and ELT produce identical results?"**
   Run both in parallel, load to separate targets, and use SQL to compare row-by-row
   with EXCEPT/INTERSECT queries. Automate this as a regression test during migration.

## Quiz

### Question 1
You need to transform Oracle CMiC job cost records by joining them with a SQL Server
dimension table that has 500K rows. Which approach is most efficient?

<details>
<summary>Show Answer</summary>

**ELT (or Hybrid).** Load the raw Oracle data into a SQL Server staging table, then
use a SQL JOIN to the dimension table. SQL Server's query optimizer can use indexes
on the dimension table and choose an efficient join strategy. Doing this join in C#
would require loading the dimension table into memory and performing a hash join
manually.
</details>

### Question 2
Your pipeline extracts equipment records from Oracle and must call a REST API to
enrich each record with GPS coordinates from a fleet management system. ETL or ELT?

<details>
<summary>Show Answer</summary>

**ETL.** The REST API call is external logic that cannot run inside SQL Server. Extract
the records, call the API in C# (with appropriate parallelism and retry logic), then
load the enriched records to SQL Server.
</details>

### Question 3
A developer loads raw data to staging and runs transforms, but the staging table
grows to 200 GB over time. What went wrong?

<details>
<summary>Show Answer</summary>

The staging table is never truncated after successful transforms. Fix: add a
`TRUNCATE TABLE staging.TableName` step after the SQL transforms complete successfully.
Better: use a swap-table pattern where you load into a new table and rename it, keeping
the old one for exactly one cycle as a safety net.
</details>

### Question 4
What is the primary advantage of a hybrid ETL/ELT approach?

<details>
<summary>Show Answer</summary>

Each transform runs where it is most efficient. Row-level cleaning, type mapping, and
external enrichment happen in C# (where they are natural to express). Set-based joins,
aggregations, and slowly changing dimension logic happen in SQL (where the database
engine optimizes them). This avoids the worst-case performance of either pure approach.
</details>

### Question 5
In a hybrid pipeline, how do you prevent the same transform from being applied twice
(once in C# and once in SQL)?

<details>
<summary>Show Answer</summary>

Maintain a clear contract for each layer. Document (or enforce via column naming) which
columns are "cleaned" by C# and which are "raw." For example, staging columns prefixed
with `Raw_` are untouched; columns without the prefix have been cleaned. The SQL
transform layer only operates on `Raw_` columns, and C#-cleaned columns pass through.
</details>
