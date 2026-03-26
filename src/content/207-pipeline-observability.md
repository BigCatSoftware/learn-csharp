# Pipeline Observability

*Chapter 13.8 — Data Engineering Patterns in C#*

## Overview

A pipeline without observability is a black box. You know it started and you know it
finished (or did not), but you have no idea what happened in between. How many rows
were extracted? How long did each step take? Where is the bottleneck? Is performance
degrading over time? Which run introduced bad data?

This lesson covers the three pillars of observability — logging, metrics, and tracing —
applied specifically to data pipelines in C#. You will learn `IProgress<T>` for progress
reporting, structured logging with Serilog/Microsoft.Extensions.Logging, `System.
Diagnostics.Metrics` for pipeline throughput counters, and `Activity`/`ActivitySource`
for distributed tracing.

## Core Concepts

### The Three Pillars

1. **Logging** — Discrete events: "Extracted 50,000 rows from JCDETL in 3.2s"
2. **Metrics** — Aggregated measurements: "Pipeline throughput: 15,000 rows/sec"
3. **Tracing** — Request-scoped timelines: "This pipeline run took 45s, with 30s in
   extract, 5s in transform, 10s in load"

### IProgress<T>
A .NET interface for reporting progress from async operations. The pipeline reports
progress; the caller decides how to display it (console, UI, log).

### Structured Logging
Log entries with named properties, not just strings. `LogInformation("Extracted {RowCount} rows from {Table}", count, table)` produces a log entry that can be queried:
"show me all extractions where RowCount > 100000."

### System.Diagnostics.Metrics
The .NET 8+ metrics API. Create counters, histograms, and gauges that can be exported
to Prometheus, Application Insights, or any OpenTelemetry-compatible backend.

### Activity and ActivitySource
The .NET distributed tracing API. An `Activity` represents a unit of work with a start
time, duration, and parent-child relationships. Activities compose into traces that
visualize the full pipeline execution.

## Code Examples

### IProgress<T> for Pipeline Progress

```csharp
public record PipelineProgress(
    string StepName,
    int RowsProcessed,
    int TotalRows,
    TimeSpan Elapsed,
    string? Message = null)
{
    public double PercentComplete =>
        TotalRows > 0 ? (double)RowsProcessed / TotalRows * 100 : 0;

    public double RowsPerSecond =>
        Elapsed.TotalSeconds > 0 ? RowsProcessed / Elapsed.TotalSeconds : 0;
}

public class ObservablePipeline
{
    public async Task RunAsync(
        TableConfig config,
        IProgress<PipelineProgress> progress,
        CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();

        // Extract
        progress.Report(new PipelineProgress(
            "Extract", 0, 0, sw.Elapsed, "Starting extraction..."));

        var rows = await ExtractAsync(config, ct);

        progress.Report(new PipelineProgress(
            "Extract", rows.Count, rows.Count, sw.Elapsed,
            $"Extracted {rows.Count} rows"));

        // Transform
        var transformed = new List<CleanRow>();
        for (int i = 0; i < rows.Count; i++)
        {
            transformed.Add(Transform(rows[i]));

            if (i % 10_000 == 0) // Report every 10K rows
            {
                progress.Report(new PipelineProgress(
                    "Transform", i, rows.Count, sw.Elapsed));
            }
        }

        progress.Report(new PipelineProgress(
            "Transform", rows.Count, rows.Count, sw.Elapsed,
            "Transform complete"));

        // Load
        await LoadAsync(transformed, progress, sw, ct);

        progress.Report(new PipelineProgress(
            "Complete", rows.Count, rows.Count, sw.Elapsed,
            $"Pipeline complete: {rows.Count} rows in {sw.Elapsed}"));
    }
}

// Console progress handler
public class ConsoleProgressHandler : IProgress<PipelineProgress>
{
    public void Report(PipelineProgress value)
    {
        Console.Write(
            $"\r[{value.StepName,-12}] " +
            $"{value.PercentComplete,6:F1}% " +
            $"({value.RowsProcessed:N0}/{value.TotalRows:N0}) " +
            $"{value.RowsPerSecond:N0} rows/s " +
            $"[{value.Elapsed:mm\\:ss}] " +
            $"{value.Message ?? ""}");

        if (value.StepName == "Complete")
            Console.WriteLine();
    }
}
```

### Structured Logging

```csharp
public class LoggedPipeline
{
    private readonly ILogger<LoggedPipeline> _logger;

    public async Task RunAsync(TableConfig config, CancellationToken ct)
    {
        // Structured log — properties are queryable in log aggregators
        using var scope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["PipelineName"] = config.PipelineName,
            ["TableName"] = config.TableName,
            ["RunId"] = Guid.NewGuid().ToString("N")[..8]
        });

        _logger.LogInformation(
            "Pipeline {PipelineName} starting for table {TableName}",
            config.PipelineName, config.TableName);

        var sw = Stopwatch.StartNew();

        try
        {
            var extracted = await ExtractAsync(config, ct);
            _logger.LogInformation(
                "Extracted {RowCount} rows from {Source} in {ElapsedMs}ms",
                extracted.Count, config.SourceTable, sw.ElapsedMilliseconds);

            var transformed = TransformAll(extracted);
            _logger.LogInformation(
                "Transformed {RowCount} rows, {ErrorCount} errors",
                transformed.Good.Count, transformed.Errors.Count);

            var loaded = await LoadAsync(transformed.Good, config, ct);
            _logger.LogInformation(
                "Loaded {RowCount} rows to {Target} " +
                "({Inserted} inserted, {Updated} updated)",
                loaded.Total, config.TargetTable,
                loaded.Inserted, loaded.Updated);

            sw.Stop();
            _logger.LogInformation(
                "Pipeline {PipelineName} completed in {ElapsedSec:F1}s " +
                "({RowsPerSec:N0} rows/sec)",
                config.PipelineName, sw.Elapsed.TotalSeconds,
                extracted.Count / sw.Elapsed.TotalSeconds);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Pipeline {PipelineName} failed after {ElapsedSec:F1}s",
                config.PipelineName, sw.Elapsed.TotalSeconds);
            throw;
        }
    }
}
```

### System.Diagnostics.Metrics

```csharp
public static class PipelineMetrics
{
    private static readonly Meter Meter = new("BNBuilders.DataPipeline", "1.0");

    // Counters — monotonically increasing
    public static readonly Counter<long> RowsExtracted =
        Meter.CreateCounter<long>(
            "pipeline.rows.extracted",
            unit: "rows",
            description: "Total rows extracted from source");

    public static readonly Counter<long> RowsLoaded =
        Meter.CreateCounter<long>(
            "pipeline.rows.loaded",
            unit: "rows",
            description: "Total rows loaded to destination");

    public static readonly Counter<long> RowsFailed =
        Meter.CreateCounter<long>(
            "pipeline.rows.failed",
            unit: "rows",
            description: "Total rows that failed processing");

    // Histograms — distribution of values
    public static readonly Histogram<double> StepDuration =
        Meter.CreateHistogram<double>(
            "pipeline.step.duration",
            unit: "ms",
            description: "Duration of pipeline steps");

    public static readonly Histogram<double> BatchSize =
        Meter.CreateHistogram<double>(
            "pipeline.batch.size",
            unit: "rows",
            description: "Number of rows per batch");

    // Gauges — current value
    public static readonly ObservableGauge<int> ActivePipelines =
        Meter.CreateObservableGauge(
            "pipeline.active",
            () => _activePipelineCount,
            unit: "pipelines",
            description: "Currently running pipelines");

    private static int _activePipelineCount;

    public static IDisposable TrackActivePipeline()
    {
        Interlocked.Increment(ref _activePipelineCount);
        return new ActivePipelineTracker();
    }

    private class ActivePipelineTracker : IDisposable
    {
        public void Dispose()
            => Interlocked.Decrement(ref _activePipelineCount);
    }
}

// Usage in pipeline steps:
public class InstrumentedExtractor
{
    public async Task<IReadOnlyList<RawRow>> ExtractAsync(
        TableConfig config, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var rows = await ExtractInternalAsync(config, ct);
        sw.Stop();

        // Record metrics with tags
        var tags = new TagList
        {
            { "table", config.TableName },
            { "source", "oracle" }
        };

        PipelineMetrics.RowsExtracted.Add(rows.Count, tags);
        PipelineMetrics.StepDuration.Record(
            sw.Elapsed.TotalMilliseconds,
            new TagList { { "step", "extract" }, { "table", config.TableName } });

        return rows;
    }
}
```

### Activity/Tracing for Pipeline Runs

```csharp
public static class PipelineTracing
{
    public static readonly ActivitySource Source =
        new("BNBuilders.DataPipeline", "1.0");
}

public class TracedPipeline
{
    public async Task RunAsync(TableConfig config, CancellationToken ct)
    {
        // Root activity for the entire pipeline run
        using var pipelineActivity = PipelineTracing.Source.StartActivity(
            "Pipeline.Run",
            ActivityKind.Internal);

        pipelineActivity?.SetTag("pipeline.name", config.PipelineName);
        pipelineActivity?.SetTag("pipeline.table", config.TableName);

        // Extract activity (child of pipeline)
        IReadOnlyList<RawRow> rows;
        using (var extractActivity = PipelineTracing.Source.StartActivity(
            "Pipeline.Extract"))
        {
            extractActivity?.SetTag("source", config.SourceConnection);
            rows = await ExtractAsync(config, ct);
            extractActivity?.SetTag("rows.count", rows.Count);
        }

        // Transform activity
        IReadOnlyList<CleanRow> transformed;
        using (var transformActivity = PipelineTracing.Source.StartActivity(
            "Pipeline.Transform"))
        {
            transformed = TransformAll(rows);
            transformActivity?.SetTag("rows.input", rows.Count);
            transformActivity?.SetTag("rows.output", transformed.Count);
        }

        // Load activity
        using (var loadActivity = PipelineTracing.Source.StartActivity(
            "Pipeline.Load"))
        {
            loadActivity?.SetTag("destination", config.TargetTable);
            var result = await LoadAsync(transformed, config, ct);
            loadActivity?.SetTag("rows.inserted", result.Inserted);
            loadActivity?.SetTag("rows.updated", result.Updated);
        }

        pipelineActivity?.SetTag("pipeline.status", "completed");
        pipelineActivity?.SetTag("pipeline.total_rows", rows.Count);
    }
}
```

### Pipeline Run Log Table

```sql
CREATE TABLE etl.PipelineRunLog (
    RunId           UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    PipelineName    NVARCHAR(128)       NOT NULL,
    TableName       NVARCHAR(128)       NOT NULL,
    StartedAtUtc    DATETIME2           NOT NULL,
    CompletedAtUtc  DATETIME2           NULL,
    Status          NVARCHAR(20)        NOT NULL,  -- Running, Completed, Failed
    RowsExtracted   INT                 NULL,
    RowsLoaded      INT                 NULL,
    RowsFailed      INT                 NULL,
    DurationMs      INT                 NULL,
    ErrorMessage    NVARCHAR(MAX)       NULL,
    CONSTRAINT PK_PipelineRunLog PRIMARY KEY (RunId)
);

CREATE INDEX IX_RunLog_Pipeline
    ON etl.PipelineRunLog(PipelineName, StartedAtUtc DESC);
```

```csharp
public class PipelineRunLogger
{
    private readonly SqlConnection _connection;

    public async Task<Guid> StartRunAsync(
        string pipelineName, string tableName, CancellationToken ct)
    {
        var runId = Guid.NewGuid();
        const string sql = @"
            INSERT INTO etl.PipelineRunLog
                (RunId, PipelineName, TableName, StartedAtUtc, Status)
            VALUES
                (@runId, @name, @table, SYSUTCDATETIME(), 'Running')";

        await using var cmd = new SqlCommand(sql, _connection);
        cmd.Parameters.AddWithValue("@runId", runId);
        cmd.Parameters.AddWithValue("@name", pipelineName);
        cmd.Parameters.AddWithValue("@table", tableName);
        await cmd.ExecuteNonQueryAsync(ct);

        return runId;
    }

    public async Task CompleteRunAsync(
        Guid runId, int extracted, int loaded, int failed,
        CancellationToken ct)
    {
        const string sql = @"
            UPDATE etl.PipelineRunLog
            SET Status = 'Completed',
                CompletedAtUtc = SYSUTCDATETIME(),
                RowsExtracted = @extracted,
                RowsLoaded = @loaded,
                RowsFailed = @failed,
                DurationMs = DATEDIFF(MILLISECOND, StartedAtUtc, SYSUTCDATETIME())
            WHERE RunId = @runId";

        await using var cmd = new SqlCommand(sql, _connection);
        cmd.Parameters.AddWithValue("@runId", runId);
        cmd.Parameters.AddWithValue("@extracted", extracted);
        cmd.Parameters.AddWithValue("@loaded", loaded);
        cmd.Parameters.AddWithValue("@failed", failed);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task FailRunAsync(
        Guid runId, string error, CancellationToken ct)
    {
        const string sql = @"
            UPDATE etl.PipelineRunLog
            SET Status = 'Failed',
                CompletedAtUtc = SYSUTCDATETIME(),
                DurationMs = DATEDIFF(MILLISECOND, StartedAtUtc, SYSUTCDATETIME()),
                ErrorMessage = @error
            WHERE RunId = @runId";

        await using var cmd = new SqlCommand(sql, _connection);
        cmd.Parameters.AddWithValue("@runId", runId);
        cmd.Parameters.AddWithValue("@error", error);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
```

### Dashboard Query: Pipeline Health

```sql
-- Pipeline run history with trend
SELECT
    PipelineName,
    CAST(StartedAtUtc AS DATE) AS RunDate,
    COUNT(*) AS RunCount,
    SUM(CASE WHEN Status = 'Completed' THEN 1 ELSE 0 END) AS Successes,
    SUM(CASE WHEN Status = 'Failed' THEN 1 ELSE 0 END) AS Failures,
    AVG(DurationMs) AS AvgDurationMs,
    MAX(DurationMs) AS MaxDurationMs,
    SUM(RowsLoaded) AS TotalRowsLoaded,
    SUM(RowsFailed) AS TotalRowsFailed
FROM etl.PipelineRunLog
WHERE StartedAtUtc >= DATEADD(DAY, -30, SYSUTCDATETIME())
GROUP BY PipelineName, CAST(StartedAtUtc AS DATE)
ORDER BY PipelineName, RunDate DESC;

-- Slow pipeline detection
SELECT
    PipelineName,
    TableName,
    StartedAtUtc,
    DurationMs,
    RowsExtracted,
    RowsLoaded
FROM etl.PipelineRunLog
WHERE DurationMs > (
    SELECT AVG(DurationMs) * 2
    FROM etl.PipelineRunLog p2
    WHERE p2.PipelineName = PipelineRunLog.PipelineName
      AND p2.Status = 'Completed'
      AND p2.StartedAtUtc >= DATEADD(DAY, -7, SYSUTCDATETIME())
)
ORDER BY DurationMs DESC;
```

### Registering Metrics with OpenTelemetry

```csharp
// In Program.cs or startup
builder.Services.AddOpenTelemetry()
    .WithMetrics(metrics =>
    {
        metrics
            .AddMeter("BNBuilders.DataPipeline")
            .AddPrometheusExporter()       // For Grafana
            .AddOtlpExporter();            // For Jaeger/Zipkin
    })
    .WithTracing(tracing =>
    {
        tracing
            .AddSource("BNBuilders.DataPipeline")
            .AddOtlpExporter();
    });
```

## Common Patterns

### Pattern 1: Correlation IDs

Every log entry, metric, and trace for a single pipeline run shares a RunId. This
lets you query "show me everything that happened in run abc123."

### Pattern 2: Step-Level Timing

```csharp
public class StepTimer : IDisposable
{
    private readonly Stopwatch _sw = Stopwatch.StartNew();
    private readonly string _stepName;
    private readonly string _tableName;

    public StepTimer(string stepName, string tableName)
    {
        _stepName = stepName;
        _tableName = tableName;
    }

    public void Dispose()
    {
        _sw.Stop();
        PipelineMetrics.StepDuration.Record(
            _sw.Elapsed.TotalMilliseconds,
            new TagList
            {
                { "step", _stepName },
                { "table", _tableName }
            });
    }
}

// Usage:
using (new StepTimer("extract", "JCDETL"))
{
    rows = await ExtractAsync(config, ct);
}
```

### Pattern 3: Anomaly Detection in Run History

Compare current run metrics to the 7-day average. Alert if duration is 2x the average
or row count differs by more than 20%.

## Gotchas and Pitfalls

### 1. Logging Too Much
Logging every row in a 15M-row pipeline creates 15M log entries. Log at batch level
(every 10K rows) or step level, not row level. Use DEBUG level for row-level logging
and INFO for step-level.

### 2. Metrics Cardinality Explosion
Adding a tag with high cardinality (e.g., `job_number` with 5000 unique values) creates
5000 metric time series. This overwhelms Prometheus/Grafana. Tag by table name, step
name, and status — not by row content.

### 3. Missing Error Context
`_logger.LogError("Pipeline failed")` is useless. Include the exception, table name,
step name, row count at failure, and duration.

### 4. Not Logging Watermark Values
Without watermark logging, you cannot debug "why did the pipeline miss these rows?"
Log the previous and new watermark values on every delta load.

### 5. Silent Metric Gaps
If a pipeline does not run (scheduler failure), metrics show no data points. This
looks the same as "zero errors." Monitor for missing data points, not just bad values.

## Performance Considerations

- **Structured logging allocations:** Each `LogInformation` call allocates if the log
  level is enabled. Use `_logger.IsEnabled(LogLevel.Debug)` guards for verbose logging.
- **Metric recording is cheap:** `Counter.Add()` and `Histogram.Record()` are lock-free
  and take nanoseconds. Do not skip metrics for performance reasons.
- **Activity overhead:** Creating an `Activity` when no listener is registered returns
  null (via `StartActivity`). The `?.` pattern ensures zero overhead when tracing is
  not configured.
- **Batch progress updates:** Reporting `IProgress<T>` on every row adds overhead.
  Report every N rows (1000-10000) for a good balance of granularity and performance.

## BNBuilders Context

### Power BI Dashboard for Pipeline Health

Build a Power BI report on `etl.PipelineRunLog` showing:
- Daily run success/failure rate per pipeline
- Duration trend over 30 days (detect degradation)
- Rows loaded per day (detect data volume anomalies)
- DLQ entry count by table (data quality indicator)

### Teams Alerts

In a Microsoft shop, send Teams webhook notifications for pipeline failures:

```csharp
public async Task SendTeamsAlertAsync(PipelineError error)
{
    var card = new
    {
        title = $"Pipeline Failure: {error.PipelineName}",
        text = $"Table: {error.TableName}\n" +
               $"Step: {error.StepName}\n" +
               $"Error: {error.ErrorMessage}\n" +
               $"Time: {error.OccurredAtUtc:u}"
    };

    await _httpClient.PostAsJsonAsync(_teamsWebhookUrl, card);
}
```

### CMiC Extract Monitoring

Track rows extracted per table per day. If JCDETL normally returns 3000 delta rows
and suddenly returns 0, something changed (CMiC trigger disabled, date format change,
view broken). If it returns 500K, something else changed (bulk import, data migration).
Both anomalies warrant investigation.

### Execution Plan Logging

For long-running Oracle queries, log the execution time and row count. If extract time
increases from 2s to 30s, the Oracle execution plan may have changed (statistics stale,
index dropped). Proactive monitoring catches this before users notice stale dashboards.

## Interview / Senior Dev Questions

1. **"What are the three pillars of observability?"**
   Logging (discrete events), metrics (aggregated measurements), and tracing (request-
   scoped timelines). Together they answer: what happened (logs), how is the system
   performing (metrics), and where is time being spent (traces).

2. **"How do you detect pipeline performance degradation?"**
   Compare current run metrics to historical baselines. Alert when duration exceeds 2x
   the 7-day average, when row counts deviate by >20%, or when error rates exceed the
   threshold. Use a trends dashboard to visualize gradual degradation.

3. **"Why use structured logging instead of string interpolation?"**
   Structured logging preserves property names and types, enabling queries like "show
   me all runs where RowCount > 100000." String interpolation bakes values into the
   message, losing queryability. Structured logging also avoids the `ToString()`
   allocation when the log level is disabled.

4. **"How do you monitor a pipeline that does not run?"**
   Check for missing data points. If a pipeline is scheduled every hour but has no run
   log entry for 2 hours, the scheduler may be down. Use a "heartbeat" check: query
   `MAX(StartedAtUtc)` and alert if it is older than expected.

## Quiz

### Question 1
Your pipeline logs `Extracted {RowCount} rows` using `_logger.LogInformation()`.
You have 50 tables, each extracted 6 times per day. How many log entries per day
just for extraction?

<details>
<summary>Show Answer</summary>

**300 log entries.** 50 tables x 6 runs = 300. This is reasonable for INFO-level
logging. If you also logged every batch (10 batches per table), it would be 3000,
which is still manageable. Logging every ROW would be millions — too many.
</details>

### Question 2
You add a `job_number` tag to your `RowsLoaded` counter. There are 5000 unique job
numbers. What problem does this create?

<details>
<summary>Show Answer</summary>

**Metrics cardinality explosion.** Each unique tag combination creates a separate time
series. 5000 job numbers x 50 tables = 250,000 time series. Prometheus and Grafana
struggle with high cardinality. Fix: tag by table name and pipeline name (low
cardinality), not by row-level values.
</details>

### Question 3
Your pipeline run table shows that the JCDETL pipeline took 2.1 seconds yesterday
and 45 seconds today. Nothing in the code changed. What do you investigate?

<details>
<summary>Show Answer</summary>

Possible causes: (1) Oracle execution plan change — check if statistics are stale or
an index was dropped. (2) Data volume spike — check rows extracted today vs yesterday.
(3) Network latency — check if infrastructure changed. (4) Concurrent load on Oracle
— check if another process is running heavy queries. The run log with per-step timing
narrows down which step (extract, transform, load) is slow.
</details>

### Question 4
Why does `PipelineTracing.Source.StartActivity("Pipeline.Extract")` return null
sometimes?

<details>
<summary>Show Answer</summary>

`StartActivity` returns null when no `ActivityListener` is registered for the
`ActivitySource`. This is by design — tracing has zero overhead when not configured.
Code should use the null-conditional operator: `activity?.SetTag("key", "value")`.
In production, registering an OpenTelemetry exporter adds a listener, and activities
are created.
</details>
