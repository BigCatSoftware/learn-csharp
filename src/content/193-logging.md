# Logging in ASP.NET Core

*Chapter 12.14 — ASP.NET Core MVC & Razor Pages*

---

## Overview

Logging is one of those things that seems simple until you are troubleshooting a
production issue at 11 PM on a Friday. ASP.NET Core provides a built-in logging
abstraction (`ILogger<T>`, `ILoggerFactory`) that decouples your application code from
the underlying log destination. You write log statements once; the logging infrastructure
routes them to consoles, files, cloud services, or structured log platforms.

This lesson covers the built-in logging system, structured logging principles, Serilog
integration (the de facto standard for .NET structured logging), correlation IDs for
distributed tracing, and the high-performance `LoggerMessage.Define` pattern for
hot-path logging.

---

## Core Concepts

### Log Levels

ASP.NET Core defines six log levels, from most to least verbose:

| Level        | Value | Usage                                                |
|--------------|-------|------------------------------------------------------|
| `Trace`      | 0     | Most detailed. Rarely enabled in production.          |
| `Debug`      | 1     | Debugging information. Development and staging.       |
| `Information`| 2     | General flow. "Job cost sync started."                |
| `Warning`    | 3     | Unexpected but recoverable. "Retry attempt 2 of 3."  |
| `Error`      | 4     | Failure in current operation. "Failed to save record."|
| `Critical`   | 5     | System-wide failure. "Database connection pool exhausted." |

Setting a minimum level (e.g., `Warning`) suppresses all lower levels (`Information`,
`Debug`, `Trace`).

### ILogger<T> and Categories

`ILogger<T>` creates a logger whose **category** is the fully-qualified type name of `T`.
Categories are used for filtering:

```csharp
public class JobCostService
{
    private readonly ILogger<JobCostService> _logger;
    // Category: "BNBuilders.Services.JobCostService"
}
```

### Structured Logging

Instead of string concatenation, use **message templates** with named placeholders:

```csharp
// DO: structured logging
_logger.LogInformation("Processing project {ProjectId} with {LineCount} cost lines",
    projectId, lines.Count);

// DON'T: string interpolation (loses structure)
_logger.LogInformation($"Processing project {projectId} with {lines.Count} cost lines");
```

With structured logging, `ProjectId` and `LineCount` become searchable, filterable
fields in log aggregation tools like Seq, Elasticsearch, or Application Insights.

### Log Filtering by Category

```json
// appsettings.json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Microsoft.EntityFrameworkCore.Database.Command": "Warning",
      "BNBuilders.Services": "Debug"
    }
  }
}
```

This suppresses noisy framework logs while keeping your application logs verbose.

---

## Code Examples

### Basic Logging Usage

```csharp
public class ProjectController : Controller
{
    private readonly ILogger<ProjectController> _logger;
    private readonly IProjectService _projectService;

    public ProjectController(
        ILogger<ProjectController> logger,
        IProjectService projectService)
    {
        _logger = logger;
        _projectService = projectService;
    }

    public async Task<IActionResult> Details(int id)
    {
        _logger.LogInformation("Fetching project details for {ProjectId}", id);

        try
        {
            var project = await _projectService.GetByIdAsync(id);

            if (project is null)
            {
                _logger.LogWarning("Project {ProjectId} not found", id);
                return NotFound();
            }

            return View(project);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching project {ProjectId}", id);
            throw;
        }
    }
}
```

### Serilog Setup

```csharp
// Program.cs — two-stage initialization
using Serilog;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console()
    .CreateBootstrapLogger(); // catches startup errors

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((context, services, configuration) =>
    {
        configuration
            .ReadFrom.Configuration(context.Configuration)
            .ReadFrom.Services(services)
            .Enrich.FromLogContext()
            .Enrich.WithEnvironmentName()
            .Enrich.WithMachineName()
            .Enrich.WithThreadId()
            .WriteTo.Console(outputTemplate:
                "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} " +
                "{Properties:j}{NewLine}{Exception}")
            .WriteTo.File(
                path: "logs/bnbuilders-.log",
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 30,
                fileSizeLimitBytes: 50_000_000)
            .WriteTo.Seq("http://seq-server:5341");
    });

    var app = builder.Build();

    // Request logging middleware (replaces default Microsoft request logging)
    app.UseSerilogRequestLogging(options =>
    {
        options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
        {
            diagnosticContext.Set("UserName",
                httpContext.User.Identity?.Name ?? "anonymous");
            diagnosticContext.Set("ClientIp",
                httpContext.Connection.RemoteIpAddress?.ToString());
        };
    });

    app.MapControllers();
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
```

### Serilog Configuration via appsettings.json

```json
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft.AspNetCore": "Warning",
        "Microsoft.EntityFrameworkCore": "Warning",
        "BNBuilders": "Debug"
      }
    },
    "WriteTo": [
      { "Name": "Console" },
      {
        "Name": "File",
        "Args": {
          "path": "logs/bnbuilders-.log",
          "rollingInterval": "Day",
          "retainedFileCountLimit": 30
        }
      },
      {
        "Name": "Seq",
        "Args": { "serverUrl": "http://seq-server:5341" }
      }
    ],
    "Enrich": ["FromLogContext", "WithMachineName", "WithThreadId"]
  }
}
```

### Correlation IDs for Request Tracing

```csharp
// Middleware to set/propagate a correlation ID
public class CorrelationIdMiddleware
{
    private const string CorrelationIdHeader = "X-Correlation-Id";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        // Use existing header or generate new
        if (!context.Request.Headers.TryGetValue(
                CorrelationIdHeader, out var correlationId))
        {
            correlationId = Guid.NewGuid().ToString("N");
        }

        context.Items["CorrelationId"] = correlationId.ToString();
        context.Response.Headers[CorrelationIdHeader] = correlationId;

        // Push into Serilog's LogContext so every log in this request includes it
        using (LogContext.PushProperty("CorrelationId", correlationId.ToString()))
        {
            await _next(context);
        }
    }
}

// Registration in Program.cs
app.UseMiddleware<CorrelationIdMiddleware>();
```

### High-Performance Logging with LoggerMessage.Define

For hot paths (middleware, high-frequency services), avoid the overhead of parsing
message templates on every call:

```csharp
public static partial class LogMessages
{
    // .NET 6+ source generator approach (preferred)
    [LoggerMessage(
        EventId = 1001,
        Level = LogLevel.Information,
        Message = "Processing cost line {CostLineId} for project {ProjectId}")]
    public static partial void ProcessingCostLine(
        ILogger logger, int costLineId, int projectId);

    [LoggerMessage(
        EventId = 1002,
        Level = LogLevel.Warning,
        Message = "Cost line {CostLineId} exceeds budget threshold: {Amount:C}")]
    public static partial void CostLineOverBudget(
        ILogger logger, int costLineId, decimal amount);

    [LoggerMessage(
        EventId = 1003,
        Level = LogLevel.Error,
        Message = "Failed to sync project {ProjectId} with ERP")]
    public static partial void ErpSyncFailed(
        ILogger logger, int projectId, Exception exception);
}

// Usage:
LogMessages.ProcessingCostLine(_logger, costLine.Id, projectId);
LogMessages.CostLineOverBudget(_logger, costLine.Id, costLine.Amount);
LogMessages.ErpSyncFailed(_logger, projectId, ex);
```

### Logging Scopes

```csharp
// All logs within the using block automatically include ProjectId and Operation
using (_logger.BeginScope(new Dictionary<string, object>
    { ["ProjectId"] = projectId, ["Operation"] = "CostSync" }))
{
    _logger.LogInformation("Starting cost sync");
    await SyncPhase1();
    _logger.LogInformation("Cost sync complete");
}
```

---

## Common Patterns

1. **One logger per class** — Inject `ILogger<T>` where `T` is the class itself. This
   gives you category-based filtering for free.

2. **Structured properties for queryability** — Use named placeholders that match your
   domain: `{ProjectId}`, `{CostCode}`, `{UserId}`. This makes log analysis trivial in
   Seq or Application Insights.

3. **Log at boundaries** — Log at service entry/exit, external API calls, database
   queries, and error handlers. Do not log inside tight loops unless at `Trace` level.

4. **Separate concerns with sinks** — Console for development, File for local
   troubleshooting, Seq or Application Insights for production analysis.

5. **Use `EventId` for categorization** — Assign unique event IDs to different log
   messages. This enables precise filtering and alerting.

---

## Gotchas and Pitfalls

- **String interpolation in log methods.** `_logger.LogInformation($"Project {id}")`
  always evaluates the string, even if the log level is disabled. Use message templates:
  `_logger.LogInformation("Project {Id}", id)`.

- **Logging sensitive data.** Connection strings, passwords, SSNs, or financial data in
  logs is a compliance risk. Use Serilog's `Destructure` with a custom policy to mask
  sensitive properties.

- **Not filtering framework logs.** Without overrides, `Microsoft.AspNetCore` and
  `Microsoft.EntityFrameworkCore` produce enormous volumes of `Information`-level logs.
  Set them to `Warning` in production.

- **Forgetting `Log.CloseAndFlush()`.** Serilog buffers writes for performance. If the
  app crashes without flushing, you lose the most important log entries — the ones right
  before the crash.

- **Overlogging.** Logging inside a loop that processes 50,000 cost lines at
  `Information` level will tank performance and flood your log store. Use `Debug` or
  `Trace` for per-item logs, `Information` for batch summaries.

- **Missing correlation IDs.** Without them, tracing a single user request across
  multiple services (API -> background job -> ERP sync) is nearly impossible.

---

## Performance Considerations

- **`LoggerMessage.Define` / source generators** eliminate message template parsing on
  every call. This is measurably faster in hot paths — up to 6x faster than standard
  `ILogger` extension methods.

- **Check `IsEnabled` before expensive log parameter computation:**

```csharp
if (_logger.IsEnabled(LogLevel.Debug))
{
    var expensiveData = ComputeDebugSummary(costLines);
    _logger.LogDebug("Cost summary: {Summary}", expensiveData);
}
```

- **Async sinks** (Serilog's default) batch writes and flush periodically, minimizing
  I/O impact on request processing.

- **Log level filtering** happens early. Disabled log levels skip message formatting
  entirely (when using templates, not string interpolation).

- **File sinks** with rolling intervals and size limits prevent disk exhaustion.
  Always set `retainedFileCountLimit` and `fileSizeLimitBytes`.

- **Seq and Application Insights** are designed for high-throughput structured logging.
  Raw text file logging is harder to query and consumes more disk space.

---

## BNBuilders Context

- **Job cost sync logging** — When syncing cost data from Sage or Viewpoint, log the
  sync start/end with project count, duration, and any failed records. This is your
  first line of defense when accounting reports data discrepancies.

- **Field data app logging** — Mobile apps submitting daily reports and safety checklists
  from job sites need correlation IDs. When a superintendent reports "my daily log didn't
  save," you can trace the exact request through API -> validation -> database.

- **Application Insights integration** — If BNBuilders uses Azure, Application Insights
  provides dashboards, alerts, and distributed tracing out of the box. Serilog's
  Application Insights sink sends structured logs there.

- **Cost-over-budget alerts** — Use `LogLevel.Warning` for cost lines exceeding budget
  thresholds. Set up alerts in Seq or Application Insights to notify PMs automatically.

- **Compliance logging** — Log who accessed financial data (from the `ClaimsPrincipal`),
  what they viewed, and when. Use structured properties so auditors can query by user,
  project, or date range.

- **ERP error tracking** — ERP APIs are notoriously flaky. Log every call with request
  details, response status, and duration. Use correlation IDs to link retries to the
  original request.

---

## Interview / Senior Dev Questions

1. **Why is structured logging important? Give an example of when it saves time.**
   Structured logging captures log data as key-value pairs, not just text. When
   investigating why project 4521's cost sync failed, you can query
   `ProjectId = 4521 AND Level = Error` in Seq instead of grep-ing through text files.
   This turns a 30-minute investigation into a 30-second query.

2. **Explain the difference between `ILogger.LogInformation("Msg {Id}", id)` and
   `ILogger.LogInformation($"Msg {id}")`. Why does it matter?**
   The template version captures `Id` as a structured property and skips formatting when
   the log level is disabled. The interpolated version always allocates a string,
   regardless of log level, and loses the structured property.

3. **A singleton background service needs to log with a scoped correlation ID. How?**
   Use `LogContext.PushProperty` (Serilog) within the scope of each work item, or pass
   the correlation ID through the processing pipeline and include it via `BeginScope`.
   Since the service is singleton, you cannot inject scoped services directly.

4. **What is `LoggerMessage.Define` and when should you use it?**
   It pre-compiles log message templates into delegates, eliminating per-call parsing
   overhead. Use it in hot paths — middleware, high-frequency services, loops processing
   thousands of items. The .NET 6+ source generator (`[LoggerMessage]` attribute) is the
   modern, cleaner equivalent.

---

## Quiz

**Question 1:** What is wrong with this log statement?

```csharp
_logger.LogError($"Failed to process project {project.Id}: {ex.Message}");
```

<details>
<summary>Answer</summary>

Two problems:

1. **String interpolation** — The string is always allocated, even if `Error` level is
   disabled. It also loses structured properties. Use:
   ```csharp
   _logger.LogError(ex, "Failed to process project {ProjectId}", project.Id);
   ```

2. **Not passing the exception object** — `ex.Message` is a flat string. Pass `ex` as
   the first argument so the full stack trace is captured by the logger.
</details>

---

**Question 2:** You set `"Microsoft.AspNetCore": "Warning"` in your logging config, but
you still see `Information`-level logs from ASP.NET Core. What might be wrong?

<details>
<summary>Answer</summary>

The most likely cause is that the override is in the wrong configuration section. The
built-in logging uses `"Logging:LogLevel"` while Serilog uses `"Serilog:MinimumLevel:Override"`.
If you are using Serilog, you need:

```json
{
  "Serilog": {
    "MinimumLevel": {
      "Override": {
        "Microsoft.AspNetCore": "Warning"
      }
    }
  }
}
```

Not:

```json
{
  "Logging": {
    "LogLevel": {
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```

The built-in `Logging` section is ignored when Serilog takes over.
</details>

---

**Question 3:** Why should you use `LoggerMessage.Define` (or the `[LoggerMessage]`
source generator) instead of the standard `ILogger` extension methods?

<details>
<summary>Answer</summary>

`LoggerMessage.Define` **pre-compiles** the message template into a cached delegate.
Standard `ILogger.LogInformation(...)` parses the template string on every invocation.

Benefits:
- Up to **6x faster** in microbenchmarks.
- **Zero allocations** when the log level is disabled.
- Compile-time validation of parameter count and types (with source generators).

Use it for any logging in hot paths: middleware, per-request processing, batch jobs
processing thousands of records.
</details>

---

**Question 4:** How do correlation IDs help in a distributed system?

<details>
<summary>Answer</summary>

A correlation ID is a unique identifier (typically a GUID) assigned to a request at the
entry point and propagated to all downstream services, background jobs, and log entries.

When a problem occurs, you can query all logs across all services for that single
correlation ID to reconstruct the full timeline of the request. Without correlation IDs,
you are left correlating by timestamp — unreliable and time-consuming.

Example: A field app submits a daily report -> API logs the request -> background job
syncs to ERP -> ERP call fails. The correlation ID links all four log entries.
</details>
