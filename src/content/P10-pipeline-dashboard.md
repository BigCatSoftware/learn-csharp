# Project 10: BNBuilders Pipeline Dashboard

*Difficulty: Medium-Hard — Estimated: 1-2 weeks — Category: Web Development / Data Engineering*

---

## Project Overview

Build a full-featured ASP.NET Core MVC web application that monitors ETL pipeline health and data quality for BNBuilders. This is the kind of internal tool every data engineering team needs — a single pane of glass showing which pipelines ran, whether they succeeded, how many rows they processed, and where data quality issues are hiding.

The application uses SQL Server with Entity Framework Core for persistence, a background `IHostedService` that simulates pipeline execution and generates realistic metrics, SignalR for pushing real-time job status updates to the browser, and Chart.js for visualizing pipeline throughput, row counts, and job duration trends.

Six primary pages make up the dashboard: a main overview showing all jobs and their current status, a job detail page with run history and error logs, a table explorer showing all synced tables with row counts and freshness timestamps, a data quality page surfacing validation failures, an alerts page for configuring thresholds, and a settings page for managing job configurations.

ASP.NET Core Identity provides authentication so only authorized users can view pipeline data and modify settings. The entire application is structured as a clean multi-project solution following MVC conventions with dependency injection throughout.

This project directly maps to Tiger's day-to-day work at BNBuilders — monitoring Procore, Sage, and Oracle data flowing into SQL Server. Building it from scratch demonstrates both web development skill and deep understanding of the data engineering domain.

---

## Learning Objectives

By completing this project you will:

1. Structure a multi-project ASP.NET Core MVC solution with proper separation of concerns
2. Design and implement an EF Core data model with migrations for pipeline metadata
3. Build Razor views with layouts, partial views, and view components
4. Integrate Chart.js for interactive data visualization in Razor views
5. Implement `IHostedService` for long-running background work in ASP.NET Core
6. Use SignalR to push real-time updates from server to connected browser clients
7. Configure ASP.NET Core Identity for authentication and role-based authorization
8. Apply the repository pattern and dependency injection for testable service layers
9. Build REST API endpoints for AJAX-driven dashboard updates without full page reloads
10. Write integration tests for controllers and services using `WebApplicationFactory`

---

## Prerequisites

Before starting this project, complete these lessons:

| Lesson | Topic | Why You Need It |
|--------|-------|-----------------|
| 180 | ASP.NET Core Fundamentals | Middleware pipeline, hosting, startup |
| 181 | MVC Pattern | Model-View-Controller architecture |
| 182 | Controllers | Action methods, routing, action results |
| 183 | Views and Razor Syntax | Razor templates, tag helpers, layouts |
| 184 | Model Binding | Binding form/query data to models |
| 186 | Razor Pages | Understanding the page-based alternative |
| 191 | Dependency Injection | Service registration, scopes, lifetimes |
| 192 | Configuration | appsettings.json, secrets, options pattern |
| 193 | Logging | ILogger, structured logging, log levels |
| 21 | Entity Framework Core | DbContext, migrations, LINQ queries |
| 120 | T-SQL Fundamentals | Understanding the SQL Server data model |
| 15 | Dependency Injection | Core DI concepts from C# perspective |

---

## Architecture

```
BNDashboard/
├── BNDashboard.sln
├── src/
│   ├── BNDashboard.Core/
│   │   ├── BNDashboard.Core.csproj
│   │   ├── Models/
│   │   │   ├── PipelineJob.cs          # Job definition (name, schedule, source, target)
│   │   │   ├── JobRun.cs               # Single execution of a job
│   │   │   ├── JobRunStatus.cs         # Enum: Pending, Running, Success, Failed, Warning
│   │   │   ├── TableSync.cs            # Per-table sync metadata
│   │   │   ├── DataQualityResult.cs    # Validation check result
│   │   │   ├── QualityCheckType.cs     # Enum: NullCheck, DuplicateCheck, RangeCheck, etc.
│   │   │   ├── Alert.cs               # Alert definition (threshold, notification type)
│   │   │   └── AlertEvent.cs          # Triggered alert instance
│   │   ├── Interfaces/
│   │   │   ├── IPipelineRepository.cs
│   │   │   ├── IDataQualityService.cs
│   │   │   └── IAlertService.cs
│   │   └── DTOs/
│   │       ├── DashboardSummaryDto.cs
│   │       ├── JobDetailDto.cs
│   │       ├── TableHealthDto.cs
│   │       └── QualityReportDto.cs
│   │
│   ├── BNDashboard.Data/
│   │   ├── BNDashboard.Data.csproj
│   │   ├── DashboardDbContext.cs
│   │   ├── Migrations/
│   │   ├── Repositories/
│   │   │   └── PipelineRepository.cs
│   │   └── Seed/
│   │       └── SeedData.cs             # Initial jobs, tables, quality checks
│   │
│   ├── BNDashboard.Services/
│   │   ├── BNDashboard.Services.csproj
│   │   ├── PipelineSimulatorService.cs  # IHostedService — generates metrics
│   │   ├── DataQualityService.cs
│   │   ├── AlertService.cs
│   │   └── MetricsAggregator.cs         # Computes dashboard summaries
│   │
│   └── BNDashboard.Web/
│       ├── BNDashboard.Web.csproj
│       ├── Program.cs
│       ├── appsettings.json
│       ├── Controllers/
│       │   ├── DashboardController.cs
│       │   ├── JobsController.cs
│       │   ├── TablesController.cs
│       │   ├── QualityController.cs
│       │   ├── AlertsController.cs
│       │   ├── SettingsController.cs
│       │   └── Api/
│       │       └── MetricsApiController.cs  # REST endpoints for AJAX
│       ├── Hubs/
│       │   └── PipelineHub.cs            # SignalR hub for live updates
│       ├── ViewModels/
│       │   ├── DashboardViewModel.cs
│       │   ├── JobDetailViewModel.cs
│       │   ├── TableExplorerViewModel.cs
│       │   ├── QualityViewModel.cs
│       │   └── AlertsViewModel.cs
│       ├── Views/
│       │   ├── _ViewImports.cshtml
│       │   ├── _ViewStart.cshtml
│       │   ├── Shared/
│       │   │   ├── _Layout.cshtml
│       │   │   ├── _StatusBadge.cshtml
│       │   │   └── _Pagination.cshtml
│       │   ├── Dashboard/
│       │   │   └── Index.cshtml
│       │   ├── Jobs/
│       │   │   ├── Index.cshtml
│       │   │   └── Detail.cshtml
│       │   ├── Tables/
│       │   │   └── Index.cshtml
│       │   ├── Quality/
│       │   │   └── Index.cshtml
│       │   ├── Alerts/
│       │   │   ├── Index.cshtml
│       │   │   └── Configure.cshtml
│       │   └── Settings/
│       │       └── Index.cshtml
│       └── wwwroot/
│           ├── css/
│           │   └── dashboard.css
│           └── js/
│               ├── dashboard.js          # Chart.js initialization
│               └── signalr-client.js     # SignalR connection
│
└── tests/
    └── BNDashboard.Tests/
        ├── BNDashboard.Tests.csproj
        ├── Controllers/
        │   └── DashboardControllerTests.cs
        ├── Services/
        │   ├── DataQualityServiceTests.cs
        │   └── AlertServiceTests.cs
        └── Integration/
            └── WebAppTests.cs
```

---

## Requirements

### Core Requirements

1. **Data model**: Design EF Core entities for `PipelineJob` (name, description, source system, target table, cron schedule, enabled flag, created/modified timestamps), `JobRun` (job FK, start time, end time, status, rows extracted, rows loaded, error message), `TableSync` (table name, source system, last sync time, row count, size bytes), and `DataQualityResult` (table, check type, column, expected, actual, passed, checked at).

2. **Dashboard page**: Main overview showing all pipeline jobs in a card grid. Each card displays job name, source system, last run status (color-coded badge), last run time, rows processed, and duration. Include summary metrics at top: total jobs, success rate (last 24h), total rows processed today, and active alerts count.

3. **Job detail page**: Shows a single job's full history. Table of recent runs with status, duration, row counts. Line chart (Chart.js) showing rows processed per run over time. Bar chart showing duration per run. Error log section showing last 10 failures with full error messages.

4. **Table explorer**: Grid of all synced tables with columns: table name, source system, row count, last sync timestamp, freshness indicator (green if synced in last hour, yellow if 1-6 hours, red if 6+ hours). Sortable by any column.

5. **Data quality page**: List of recent quality check results grouped by table. Each result shows check type (null percentage, duplicate count, range violation), column name, expected vs actual values, pass/fail badge. Filter by status (pass/fail) and table.

6. **Background service**: `PipelineSimulatorService` implements `IHostedService` and runs on a timer (every 30 seconds). It picks a random job, creates a `JobRun` with realistic metrics (random row counts, occasional failures, varying durations), and saves to the database. This simulates real pipeline execution without requiring actual data sources.

7. **SignalR real-time updates**: When the background service completes a job run, it broadcasts the result via a `PipelineHub`. Connected dashboard clients receive the update and refresh the affected job card without a full page reload.

8. **Authentication**: ASP.NET Core Identity with cookie auth. Login/register pages. Only authenticated users can access the dashboard. An "Admin" role can access Settings and Alert configuration.

### Extended Requirements

9. **REST API**: `MetricsApiController` exposes endpoints: `GET /api/metrics/summary` (dashboard summary DTO), `GET /api/metrics/jobs/{id}/history` (paginated run history), `GET /api/metrics/throughput?hours=24` (hourly row counts for chart). Dashboard JavaScript calls these for dynamic updates.

10. **Alerts system**: Configure alert rules (e.g., "notify if job X fails 3 times in a row", "notify if table Y not synced in 2 hours", "notify if null percentage exceeds 5%"). When a rule triggers, create an `AlertEvent` and display it in the alerts page. Show active alert count in the nav bar.

11. **Chart.js dashboards**: Pipeline throughput line chart (rows/hour over last 24h), job duration trend chart, success/failure pie chart, per-source-system bar chart. All charts update when SignalR pushes new data.

12. **Settings page**: CRUD for pipeline job configurations. Edit job name, schedule, source, target, enabled/disabled toggle. Admin-only access.

### Stretch Requirements

13. **Export to CSV**: Download job run history or data quality results as CSV files.
14. **Dark mode**: Toggle between light and dark themes with CSS variables.
15. **Email notifications**: Send alert emails using a configurable SMTP service (or log them in development).
16. **Health check endpoint**: ASP.NET Core health checks for database connectivity and background service status.

---

## Technical Guidance

### Project Structure and DI Registration

Your `Program.cs` is the composition root. Register all services there:

```
builder.Services.AddDbContext<DashboardDbContext>(...)
builder.Services.AddScoped<IPipelineRepository, PipelineRepository>()
builder.Services.AddScoped<IDataQualityService, DataQualityService>()
builder.Services.AddHostedService<PipelineSimulatorService>()
builder.Services.AddSignalR()
```

Keep the `Core` project free of framework dependencies — it should only contain models, interfaces, and DTOs. The `Data` project references `Core` and provides EF implementations. The `Web` project references everything and wires it up.

### EF Core Model Design

Use Fluent API configuration in `DashboardDbContext.OnModelCreating` rather than data annotations. This keeps your models clean. Define indexes on frequently queried columns (e.g., `JobRun.StartedAt`, `TableSync.LastSyncAt`).

For the `JobRun` to `PipelineJob` relationship, configure cascade delete. For `DataQualityResult`, consider a composite index on `(TableName, CheckedAt)` for efficient recent-results queries.

Think about how you query data on the dashboard: you will need "last run per job" which is a `GROUP BY` with `MAX(StartedAt)`. EF Core can express this with `.GroupBy()` and `.Select()`, or you can use a raw SQL view.

### Background Service Pattern

`IHostedService` with a `Timer` is the standard pattern. Use `PeriodicTimer` in .NET 6+ for cleaner async loops:

```
while (await _timer.WaitForNextTickAsync(stoppingToken))
{
    await SimulateJobRunAsync(stoppingToken);
}
```

Inject `IServiceScopeFactory` (not `DashboardDbContext` directly) because hosted services are singletons but DbContext is scoped. Create a scope inside each tick.

### SignalR Integration

Define your hub with strongly-typed clients for type safety. Create an `IPipelineClient` interface with methods like `ReceiveJobUpdate(JobRunDto run)` and `ReceiveAlert(AlertDto alert)`. The background service injects `IHubContext<PipelineHub, IPipelineClient>` to broadcast without going through the hub instance.

On the client side, use the `@microsoft/signalr` npm package or the CDN-hosted script. Connect on page load and update DOM elements when messages arrive.

### Chart.js Patterns

Initialize charts in a dedicated JavaScript file. Fetch data from your REST API endpoints, then create Chart.js instances. When SignalR pushes an update, call `chart.data.datasets[0].data.push(newPoint)` and `chart.update()` to add points without re-creating the chart.

Use `fetch('/api/metrics/throughput?hours=24')` to load initial chart data. Consider using `chartjs-adapter-date-fns` for time-series x-axes.

### View Organization

Use a shared `_Layout.cshtml` with a sidebar navigation listing all six pages. Use `_ViewImports.cshtml` to import tag helpers and set the default namespace. Create partial views for repeated elements like status badges (`_StatusBadge.cshtml`) and pagination controls.

ViewModels should be specific to each view and only contain the data that view needs. Do not pass EF entities directly to views — map to ViewModels in the controller.

### Authentication Setup

ASP.NET Core Identity with `AddDefaultIdentity<IdentityUser>()` gives you login, register, and cookie management. Store identity tables in the same `DashboardDbContext` or a separate one. Use `[Authorize]` on controllers and `[Authorize(Roles = "Admin")]` on Settings/Alerts configuration actions.

Seed an admin user in `SeedData.cs` so you can log in immediately after first run.

---

## Step-by-Step Milestones

### Milestone 1: Solution Structure and Data Model (Day 1)

Create the four-project solution. Define all EF Core entities in `BNDashboard.Core`. Implement `DashboardDbContext` with Fluent API configuration. Create the initial migration. Write `SeedData.cs` that populates 5 pipeline jobs (e.g., "Procore Projects Sync", "Sage Cost Codes", "Oracle AP Extract", "Timecard Import", "Budget Forecast"), 10 synced tables, and some initial quality checks.

**Deliverable**: `dotnet ef database update` creates the database with seed data. Verify with a SQL query.

### Milestone 2: Dashboard and Job List (Days 2-3)

Implement `DashboardController` with an `Index` action that queries the database for all jobs, their last run, and summary metrics. Create the `_Layout.cshtml` with sidebar navigation and the `Dashboard/Index.cshtml` view with job cards. Style with CSS (use a minimal CSS framework or hand-write a grid layout). Each card is clickable and links to the job detail page.

**Deliverable**: Browser shows the dashboard with 5 job cards displaying seed data.

### Milestone 3: Job Detail and Charts (Days 4-5)

Implement `JobsController` with `Detail(int id)` action. Create the detail view with a run history table and two Chart.js charts (rows over time, duration over time). Implement `MetricsApiController` with the history endpoint. Write JavaScript that fetches chart data via AJAX and renders Chart.js instances.

**Deliverable**: Clicking a job card shows detailed history with interactive charts.

### Milestone 4: Background Simulator and SignalR (Days 6-7)

Implement `PipelineSimulatorService` as a hosted service. Every 30 seconds it creates a new `JobRun` for a random job with realistic data. Implement `PipelineHub` and broadcast job completions. Add SignalR client JavaScript to the dashboard page that updates job cards in real time when new runs complete.

**Deliverable**: Leave the dashboard open — cards update automatically every 30 seconds without page refresh.

### Milestone 5: Table Explorer and Data Quality (Days 8-9)

Implement `TablesController` showing all synced tables with freshness indicators. Implement `QualityController` showing recent validation results with filtering. The background service should also generate occasional data quality results (random null percentages, duplicate counts) alongside job runs.

**Deliverable**: Table explorer shows freshness badges. Quality page filters by pass/fail.

### Milestone 6: Alerts and Authentication (Days 10-11)

Implement `AlertsController` with alert rule CRUD. Define alert rules in the database and evaluate them after each simulated job run. Implement ASP.NET Core Identity with login/register. Protect all controllers with `[Authorize]`. Protect alert configuration with admin role.

**Deliverable**: Must log in to see dashboard. Admin can configure alert thresholds. Alerts fire when thresholds are breached.

### Milestone 7: Settings and Polish (Days 12-13)

Implement `SettingsController` for job configuration CRUD. Add pagination to run history. Add the success/failure pie chart and per-source bar chart to the dashboard. Handle error states gracefully (empty states, loading spinners). Add the active alert count badge to the navigation bar.

**Deliverable**: Complete application with all six pages functional.

### Milestone 8: Testing (Day 14)

Write controller tests using `WebApplicationFactory<Program>` for integration testing. Mock the repository in unit tests for services. Test the alert evaluation logic with various threshold scenarios. Test the background service creates valid job runs.

**Deliverable**: Test suite passes. Key flows covered.

---

## Testing Requirements

### Unit Tests

- **PipelineRepository**: Query methods return correct results for various filter combinations (by status, date range, job ID)
- **DataQualityService**: Correctly evaluates null checks, duplicate checks, range checks against mock data
- **AlertService**: Triggers alert when failure count exceeds threshold, does not trigger when below threshold, correctly evaluates freshness alerts
- **MetricsAggregator**: Computes correct success rates, total row counts, hourly throughput bucketing

### Integration Tests

- **DashboardController**: `GET /` returns 200 with dashboard HTML containing job cards. Verify correct job count in response.
- **JobsController**: `GET /Jobs/Detail/1` returns job detail page with correct job name. Returns 404 for non-existent job.
- **MetricsApiController**: `GET /api/metrics/summary` returns valid JSON with expected fields. `GET /api/metrics/throughput?hours=24` returns 24 data points.
- **Authentication**: Unauthenticated requests to `/Dashboard` redirect to `/Identity/Account/Login`. Admin-only endpoints return 403 for non-admin users.

### Browser/Manual Tests

- Open two browser tabs on the dashboard — verify both update simultaneously via SignalR
- Chart.js charts render correctly and respond to window resize
- Freshness badges update color correctly based on time elapsed
- Alert notification appears in nav bar when a new alert fires

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### BNDashboard.Core/Models/PipelineJob.cs

```csharp
namespace BNDashboard.Core.Models;

public sealed class PipelineJob
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string SourceSystem { get; set; } = string.Empty;    // "Procore", "Sage", "Oracle"
    public string TargetTable { get; set; } = string.Empty;
    public string CronSchedule { get; set; } = "0 */6 * * *";  // Every 6 hours
    public bool IsEnabled { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ModifiedAt { get; set; } = DateTime.UtcNow;

    public ICollection<JobRun> Runs { get; set; } = new List<JobRun>();
}
```

### BNDashboard.Core/Models/JobRun.cs

```csharp
namespace BNDashboard.Core.Models;

public sealed class JobRun
{
    public int Id { get; set; }
    public int PipelineJobId { get; set; }
    public PipelineJob PipelineJob { get; set; } = null!;
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public JobRunStatus Status { get; set; } = JobRunStatus.Pending;
    public int RowsExtracted { get; set; }
    public int RowsLoaded { get; set; }
    public string? ErrorMessage { get; set; }
    public double DurationSeconds => CompletedAt.HasValue
        ? (CompletedAt.Value - StartedAt).TotalSeconds
        : 0;
}

public enum JobRunStatus
{
    Pending = 0,
    Running = 1,
    Success = 2,
    Failed = 3,
    Warning = 4
}
```

### BNDashboard.Core/Models/TableSync.cs

```csharp
namespace BNDashboard.Core.Models;

public sealed class TableSync
{
    public int Id { get; set; }
    public string TableName { get; set; } = string.Empty;
    public string SourceSystem { get; set; } = string.Empty;
    public string SchemaName { get; set; } = "dbo";
    public DateTime? LastSyncAt { get; set; }
    public long RowCount { get; set; }
    public long SizeBytes { get; set; }

    public string FreshnessLevel => LastSyncAt switch
    {
        null => "stale",
        DateTime t when (DateTime.UtcNow - t).TotalHours < 1 => "fresh",
        DateTime t when (DateTime.UtcNow - t).TotalHours < 6 => "warm",
        _ => "stale"
    };
}
```

### BNDashboard.Core/Models/DataQualityResult.cs

```csharp
namespace BNDashboard.Core.Models;

public sealed class DataQualityResult
{
    public int Id { get; set; }
    public string TableName { get; set; } = string.Empty;
    public string ColumnName { get; set; } = string.Empty;
    public QualityCheckType CheckType { get; set; }
    public string Expected { get; set; } = string.Empty;
    public string Actual { get; set; } = string.Empty;
    public bool Passed { get; set; }
    public DateTime CheckedAt { get; set; } = DateTime.UtcNow;
}

public enum QualityCheckType
{
    NullPercentage = 0,
    DuplicateCount = 1,
    RangeCheck = 2,
    ForeignKeyOrphan = 3,
    FormatValidation = 4,
    RowCountAnomaly = 5
}
```

### BNDashboard.Core/Models/Alert.cs

```csharp
namespace BNDashboard.Core.Models;

public sealed class Alert
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public AlertType Type { get; set; }
    public int? PipelineJobId { get; set; }
    public string? TableName { get; set; }
    public double Threshold { get; set; }
    public bool IsEnabled { get; set; } = true;

    public ICollection<AlertEvent> Events { get; set; } = new List<AlertEvent>();
}

public sealed class AlertEvent
{
    public int Id { get; set; }
    public int AlertId { get; set; }
    public Alert Alert { get; set; } = null!;
    public DateTime TriggeredAt { get; set; } = DateTime.UtcNow;
    public string Message { get; set; } = string.Empty;
    public bool Acknowledged { get; set; }
}

public enum AlertType
{
    ConsecutiveFailures = 0,
    FreshnessThreshold = 1,
    NullPercentageThreshold = 2,
    RowCountDrop = 3
}
```

### BNDashboard.Core/Interfaces/IPipelineRepository.cs

```csharp
using BNDashboard.Core.Models;

namespace BNDashboard.Core.Interfaces;

public interface IPipelineRepository
{
    Task<List<PipelineJob>> GetAllJobsAsync();
    Task<PipelineJob?> GetJobByIdAsync(int id);
    Task<List<JobRun>> GetRecentRunsAsync(int jobId, int count = 50);
    Task<JobRun?> GetLastRunAsync(int jobId);
    Task<Dictionary<int, JobRun?>> GetLastRunPerJobAsync();
    Task AddJobRunAsync(JobRun run);
    Task<List<TableSync>> GetAllTableSyncsAsync();
    Task UpdateTableSyncAsync(string tableName, long rowCount, DateTime syncTime);
    Task<List<DataQualityResult>> GetRecentQualityResultsAsync(int count = 100);
    Task AddQualityResultAsync(DataQualityResult result);
    Task<int> GetActiveAlertCountAsync();
    Task<List<AlertEvent>> GetRecentAlertEventsAsync(int count = 50);
    Task<(int TotalJobs, int SuccessLast24h, int FailedLast24h, long RowsToday)> GetSummaryAsync();
    Task<List<(DateTime Hour, long Rows)>> GetHourlyThroughputAsync(int hours = 24);
}
```

### BNDashboard.Core/DTOs/DashboardSummaryDto.cs

```csharp
namespace BNDashboard.Core.DTOs;

public sealed class DashboardSummaryDto
{
    public int TotalJobs { get; set; }
    public int SuccessCount24h { get; set; }
    public int FailedCount24h { get; set; }
    public double SuccessRate24h => TotalJobs > 0
        ? Math.Round((double)SuccessCount24h / (SuccessCount24h + FailedCount24h) * 100, 1)
        : 0;
    public long TotalRowsToday { get; set; }
    public int ActiveAlerts { get; set; }
}

public sealed class JobDetailDto
{
    public int JobId { get; set; }
    public string JobName { get; set; } = string.Empty;
    public string SourceSystem { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? LastRunAt { get; set; }
    public int RowsProcessed { get; set; }
    public double DurationSeconds { get; set; }
}

public sealed class ThroughputPointDto
{
    public DateTime Timestamp { get; set; }
    public long RowCount { get; set; }
}
```

### BNDashboard.Data/DashboardDbContext.cs

```csharp
using BNDashboard.Core.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BNDashboard.Data;

public sealed class DashboardDbContext : IdentityDbContext
{
    public DbSet<PipelineJob> PipelineJobs => Set<PipelineJob>();
    public DbSet<JobRun> JobRuns => Set<JobRun>();
    public DbSet<TableSync> TableSyncs => Set<TableSync>();
    public DbSet<DataQualityResult> DataQualityResults => Set<DataQualityResult>();
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<AlertEvent> AlertEvents => Set<AlertEvent>();

    public DashboardDbContext(DbContextOptions<DashboardDbContext> options)
        : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder); // Identity tables

        modelBuilder.Entity<PipelineJob>(e =>
        {
            e.HasKey(j => j.Id);
            e.Property(j => j.Name).HasMaxLength(200).IsRequired();
            e.Property(j => j.SourceSystem).HasMaxLength(50);
            e.Property(j => j.TargetTable).HasMaxLength(200);
            e.Property(j => j.CronSchedule).HasMaxLength(50);
            e.HasMany(j => j.Runs).WithOne(r => r.PipelineJob)
                .HasForeignKey(r => r.PipelineJobId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<JobRun>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasIndex(r => r.StartedAt);
            e.HasIndex(r => new { r.PipelineJobId, r.StartedAt });
            e.Property(r => r.ErrorMessage).HasMaxLength(4000);
        });

        modelBuilder.Entity<TableSync>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.TableName).IsUnique();
            e.Property(t => t.TableName).HasMaxLength(200).IsRequired();
            e.Property(t => t.SourceSystem).HasMaxLength(50);
        });

        modelBuilder.Entity<DataQualityResult>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasIndex(d => new { d.TableName, d.CheckedAt });
            e.Property(d => d.TableName).HasMaxLength(200);
            e.Property(d => d.ColumnName).HasMaxLength(200);
            e.Property(d => d.Expected).HasMaxLength(500);
            e.Property(d => d.Actual).HasMaxLength(500);
        });

        modelBuilder.Entity<Alert>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.Name).HasMaxLength(200);
            e.HasMany(a => a.Events).WithOne(ae => ae.Alert)
                .HasForeignKey(ae => ae.AlertId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AlertEvent>(e =>
        {
            e.HasKey(ae => ae.Id);
            e.HasIndex(ae => ae.TriggeredAt);
            e.Property(ae => ae.Message).HasMaxLength(1000);
        });
    }
}
```

### BNDashboard.Data/Repositories/PipelineRepository.cs

```csharp
using BNDashboard.Core.Interfaces;
using BNDashboard.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace BNDashboard.Data.Repositories;

public sealed class PipelineRepository : IPipelineRepository
{
    private readonly DashboardDbContext _db;

    public PipelineRepository(DashboardDbContext db) => _db = db;

    public Task<List<PipelineJob>> GetAllJobsAsync() =>
        _db.PipelineJobs.AsNoTracking().OrderBy(j => j.Name).ToListAsync();

    public Task<PipelineJob?> GetJobByIdAsync(int id) =>
        _db.PipelineJobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == id);

    public Task<List<JobRun>> GetRecentRunsAsync(int jobId, int count = 50) =>
        _db.JobRuns.AsNoTracking()
            .Where(r => r.PipelineJobId == jobId)
            .OrderByDescending(r => r.StartedAt)
            .Take(count)
            .ToListAsync();

    public Task<JobRun?> GetLastRunAsync(int jobId) =>
        _db.JobRuns.AsNoTracking()
            .Where(r => r.PipelineJobId == jobId)
            .OrderByDescending(r => r.StartedAt)
            .FirstOrDefaultAsync();

    public async Task<Dictionary<int, JobRun?>> GetLastRunPerJobAsync()
    {
        var lastRuns = await _db.JobRuns.AsNoTracking()
            .GroupBy(r => r.PipelineJobId)
            .Select(g => g.OrderByDescending(r => r.StartedAt).First())
            .ToListAsync();

        return lastRuns.ToDictionary(r => r.PipelineJobId, r => (JobRun?)r);
    }

    public async Task AddJobRunAsync(JobRun run)
    {
        _db.JobRuns.Add(run);
        await _db.SaveChangesAsync();
    }

    public Task<List<TableSync>> GetAllTableSyncsAsync() =>
        _db.TableSyncs.AsNoTracking().OrderBy(t => t.TableName).ToListAsync();

    public async Task UpdateTableSyncAsync(string tableName, long rowCount, DateTime syncTime)
    {
        var table = await _db.TableSyncs.FirstOrDefaultAsync(t => t.TableName == tableName);
        if (table is not null)
        {
            table.RowCount = rowCount;
            table.LastSyncAt = syncTime;
            await _db.SaveChangesAsync();
        }
    }

    public Task<List<DataQualityResult>> GetRecentQualityResultsAsync(int count = 100) =>
        _db.DataQualityResults.AsNoTracking()
            .OrderByDescending(d => d.CheckedAt)
            .Take(count)
            .ToListAsync();

    public async Task AddQualityResultAsync(DataQualityResult result)
    {
        _db.DataQualityResults.Add(result);
        await _db.SaveChangesAsync();
    }

    public async Task<int> GetActiveAlertCountAsync() =>
        await _db.AlertEvents.CountAsync(e => !e.Acknowledged);

    public Task<List<AlertEvent>> GetRecentAlertEventsAsync(int count = 50) =>
        _db.AlertEvents.AsNoTracking()
            .Include(e => e.Alert)
            .OrderByDescending(e => e.TriggeredAt)
            .Take(count)
            .ToListAsync();

    public async Task<(int TotalJobs, int SuccessLast24h, int FailedLast24h, long RowsToday)> GetSummaryAsync()
    {
        var cutoff = DateTime.UtcNow.AddHours(-24);
        var today = DateTime.UtcNow.Date;

        int totalJobs = await _db.PipelineJobs.CountAsync(j => j.IsEnabled);
        int success = await _db.JobRuns.CountAsync(r => r.StartedAt >= cutoff && r.Status == JobRunStatus.Success);
        int failed = await _db.JobRuns.CountAsync(r => r.StartedAt >= cutoff && r.Status == JobRunStatus.Failed);
        long rows = await _db.JobRuns.Where(r => r.StartedAt >= today && r.Status == JobRunStatus.Success)
            .SumAsync(r => (long)r.RowsLoaded);

        return (totalJobs, success, failed, rows);
    }

    public async Task<List<(DateTime Hour, long Rows)>> GetHourlyThroughputAsync(int hours = 24)
    {
        var cutoff = DateTime.UtcNow.AddHours(-hours);

        var raw = await _db.JobRuns.AsNoTracking()
            .Where(r => r.StartedAt >= cutoff && r.Status == JobRunStatus.Success)
            .GroupBy(r => new { r.StartedAt.Year, r.StartedAt.Month, r.StartedAt.Day, r.StartedAt.Hour })
            .Select(g => new
            {
                Hour = new DateTime(g.Key.Year, g.Key.Month, g.Key.Day, g.Key.Hour, 0, 0, DateTimeKind.Utc),
                Rows = g.Sum(r => (long)r.RowsLoaded)
            })
            .OrderBy(x => x.Hour)
            .ToListAsync();

        return raw.Select(x => (x.Hour, x.Rows)).ToList();
    }
}
```

### BNDashboard.Services/PipelineSimulatorService.cs

```csharp
using BNDashboard.Core.Interfaces;
using BNDashboard.Core.Models;
using BNDashboard.Web.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BNDashboard.Services;

public sealed class PipelineSimulatorService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<PipelineHub, IPipelineClient> _hubContext;
    private readonly ILogger<PipelineSimulatorService> _logger;
    private readonly Random _rng = new();

    private static readonly string[] ErrorMessages =
    [
        "Connection timeout to source database after 30s",
        "Deadlock detected on target table, transaction rolled back",
        "Source query returned 0 rows — possible schema change",
        "Authentication token expired for Procore API",
        "Bulk copy failed: string or binary data would be truncated",
        "Foreign key constraint violation on dbo.CostCodes",
    ];

    public PipelineSimulatorService(
        IServiceScopeFactory scopeFactory,
        IHubContext<PipelineHub, IPipelineClient> hubContext,
        ILogger<PipelineSimulatorService> logger)
    {
        _scopeFactory = scopeFactory;
        _hubContext = hubContext;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Pipeline simulator started.");

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await SimulateJobRunAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error in pipeline simulator.");
            }
        }
    }

    private async Task SimulateJobRunAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IPipelineRepository>();

        var jobs = await repo.GetAllJobsAsync();
        if (jobs.Count == 0) return;

        var job = jobs[_rng.Next(jobs.Count)];
        bool success = _rng.NextDouble() > 0.15; // 85% success rate
        int rowCount = success ? _rng.Next(100, 50_000) : 0;
        double duration = success ? _rng.NextDouble() * 120 + 5 : _rng.NextDouble() * 10 + 1;

        var run = new JobRun
        {
            PipelineJobId = job.Id,
            StartedAt = DateTime.UtcNow.AddSeconds(-duration),
            CompletedAt = DateTime.UtcNow,
            Status = success ? JobRunStatus.Success : JobRunStatus.Failed,
            RowsExtracted = rowCount + (success ? _rng.Next(0, 100) : 0),
            RowsLoaded = rowCount,
            ErrorMessage = success ? null : ErrorMessages[_rng.Next(ErrorMessages.Length)]
        };

        await repo.AddJobRunAsync(run);

        _logger.LogInformation("Simulated {Status} run for '{Job}': {Rows} rows in {Duration:F1}s",
            run.Status, job.Name, run.RowsLoaded, duration);

        // Broadcast via SignalR
        await _hubContext.Clients.All.ReceiveJobUpdate(new JobUpdateMessage(
            job.Id, job.Name, run.Status.ToString(), run.RowsLoaded,
            run.DurationSeconds, run.CompletedAt!.Value));

        // Simulate data quality check occasionally
        if (success && _rng.NextDouble() > 0.6)
        {
            var quality = new DataQualityResult
            {
                TableName = job.TargetTable,
                ColumnName = "various",
                CheckType = (QualityCheckType)_rng.Next(0, 6),
                Expected = "< 2%",
                Actual = $"{_rng.NextDouble() * 5:F1}%",
                Passed = _rng.NextDouble() > 0.3,
                CheckedAt = DateTime.UtcNow
            };
            await repo.AddQualityResultAsync(quality);
        }
    }
}
```

### BNDashboard.Web/Hubs/PipelineHub.cs

```csharp
using Microsoft.AspNetCore.SignalR;

namespace BNDashboard.Web.Hubs;

public interface IPipelineClient
{
    Task ReceiveJobUpdate(JobUpdateMessage message);
    Task ReceiveAlert(AlertMessage message);
}

public sealed record JobUpdateMessage(
    int JobId,
    string JobName,
    string Status,
    int RowsLoaded,
    double DurationSeconds,
    DateTime CompletedAt);

public sealed record AlertMessage(string AlertName, string Message, DateTime TriggeredAt);

public sealed class PipelineHub : Hub<IPipelineClient>
{
    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }
}
```

### BNDashboard.Web/Controllers/DashboardController.cs

```csharp
using BNDashboard.Core.DTOs;
using BNDashboard.Core.Interfaces;
using BNDashboard.Web.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BNDashboard.Web.Controllers;

[Authorize]
public sealed class DashboardController : Controller
{
    private readonly IPipelineRepository _repo;

    public DashboardController(IPipelineRepository repo) => _repo = repo;

    public async Task<IActionResult> Index()
    {
        var jobs = await _repo.GetAllJobsAsync();
        var lastRuns = await _repo.GetLastRunPerJobAsync();
        var (totalJobs, success24h, failed24h, rowsToday) = await _repo.GetSummaryAsync();
        int activeAlerts = await _repo.GetActiveAlertCountAsync();

        var vm = new DashboardViewModel
        {
            Summary = new DashboardSummaryDto
            {
                TotalJobs = totalJobs,
                SuccessCount24h = success24h,
                FailedCount24h = failed24h,
                TotalRowsToday = rowsToday,
                ActiveAlerts = activeAlerts
            },
            JobCards = jobs.Select(j =>
            {
                lastRuns.TryGetValue(j.Id, out var lastRun);
                return new JobCardViewModel
                {
                    JobId = j.Id,
                    Name = j.Name,
                    SourceSystem = j.SourceSystem,
                    Status = lastRun?.Status.ToString() ?? "Never Run",
                    LastRunAt = lastRun?.StartedAt,
                    RowsProcessed = lastRun?.RowsLoaded ?? 0,
                    DurationSeconds = lastRun?.DurationSeconds ?? 0
                };
            }).ToList()
        };

        return View(vm);
    }
}
```

### BNDashboard.Web/Controllers/JobsController.cs

```csharp
using BNDashboard.Core.Interfaces;
using BNDashboard.Web.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BNDashboard.Web.Controllers;

[Authorize]
public sealed class JobsController : Controller
{
    private readonly IPipelineRepository _repo;

    public JobsController(IPipelineRepository repo) => _repo = repo;

    public async Task<IActionResult> Detail(int id)
    {
        var job = await _repo.GetJobByIdAsync(id);
        if (job is null) return NotFound();

        var runs = await _repo.GetRecentRunsAsync(id, 50);

        var vm = new JobDetailViewModel
        {
            JobId = job.Id,
            JobName = job.Name,
            SourceSystem = job.SourceSystem,
            TargetTable = job.TargetTable,
            CronSchedule = job.CronSchedule,
            IsEnabled = job.IsEnabled,
            Runs = runs.Select(r => new JobRunViewModel
            {
                RunId = r.Id,
                StartedAt = r.StartedAt,
                CompletedAt = r.CompletedAt,
                Status = r.Status.ToString(),
                RowsExtracted = r.RowsExtracted,
                RowsLoaded = r.RowsLoaded,
                DurationSeconds = r.DurationSeconds,
                ErrorMessage = r.ErrorMessage
            }).ToList()
        };

        return View(vm);
    }
}
```

### BNDashboard.Web/Controllers/Api/MetricsApiController.cs

```csharp
using BNDashboard.Core.DTOs;
using BNDashboard.Core.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BNDashboard.Web.Controllers.Api;

[ApiController]
[Route("api/metrics")]
[Authorize]
public sealed class MetricsApiController : ControllerBase
{
    private readonly IPipelineRepository _repo;

    public MetricsApiController(IPipelineRepository repo) => _repo = repo;

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var (totalJobs, success24h, failed24h, rowsToday) = await _repo.GetSummaryAsync();
        int activeAlerts = await _repo.GetActiveAlertCountAsync();

        return Ok(new DashboardSummaryDto
        {
            TotalJobs = totalJobs,
            SuccessCount24h = success24h,
            FailedCount24h = failed24h,
            TotalRowsToday = rowsToday,
            ActiveAlerts = activeAlerts
        });
    }

    [HttpGet("jobs/{id}/history")]
    public async Task<IActionResult> GetJobHistory(int id, [FromQuery] int count = 50)
    {
        var runs = await _repo.GetRecentRunsAsync(id, count);
        return Ok(runs.Select(r => new
        {
            r.Id,
            r.StartedAt,
            r.CompletedAt,
            Status = r.Status.ToString(),
            r.RowsExtracted,
            r.RowsLoaded,
            r.DurationSeconds,
            r.ErrorMessage
        }));
    }

    [HttpGet("throughput")]
    public async Task<IActionResult> GetThroughput([FromQuery] int hours = 24)
    {
        var data = await _repo.GetHourlyThroughputAsync(hours);
        return Ok(data.Select(d => new ThroughputPointDto
        {
            Timestamp = d.Hour,
            RowCount = d.Rows
        }));
    }
}
```

### BNDashboard.Web/ViewModels/DashboardViewModel.cs

```csharp
using BNDashboard.Core.DTOs;

namespace BNDashboard.Web.ViewModels;

public sealed class DashboardViewModel
{
    public DashboardSummaryDto Summary { get; set; } = new();
    public List<JobCardViewModel> JobCards { get; set; } = [];
}

public sealed class JobCardViewModel
{
    public int JobId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string SourceSystem { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? LastRunAt { get; set; }
    public int RowsProcessed { get; set; }
    public double DurationSeconds { get; set; }

    public string StatusCssClass => Status switch
    {
        "Success" => "badge-success",
        "Failed" => "badge-danger",
        "Running" => "badge-primary",
        "Warning" => "badge-warning",
        _ => "badge-secondary"
    };
}

public sealed class JobDetailViewModel
{
    public int JobId { get; set; }
    public string JobName { get; set; } = string.Empty;
    public string SourceSystem { get; set; } = string.Empty;
    public string TargetTable { get; set; } = string.Empty;
    public string CronSchedule { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public List<JobRunViewModel> Runs { get; set; } = [];
}

public sealed class JobRunViewModel
{
    public int RunId { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public int RowsExtracted { get; set; }
    public int RowsLoaded { get; set; }
    public double DurationSeconds { get; set; }
    public string? ErrorMessage { get; set; }
}
```

### BNDashboard.Web/Views/Shared/_Layout.cshtml

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>@ViewData["Title"] - BNBuilders Pipeline Dashboard</title>
    <link rel="stylesheet" href="~/css/dashboard.css" />
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body>
    <div class="app-container">
        <nav class="sidebar">
            <div class="sidebar-header">
                <h2>BNBuilders</h2>
                <span class="subtitle">Pipeline Monitor</span>
            </div>
            <ul class="nav-links">
                <li><a href="/" class="@(ViewContext.RouteData.Values["controller"]?.ToString() == "Dashboard" ? "active" : "")">Dashboard</a></li>
                <li><a href="/Tables" class="@(ViewContext.RouteData.Values["controller"]?.ToString() == "Tables" ? "active" : "")">Tables</a></li>
                <li><a href="/Quality" class="@(ViewContext.RouteData.Values["controller"]?.ToString() == "Quality" ? "active" : "")">Data Quality</a></li>
                <li><a href="/Alerts" class="@(ViewContext.RouteData.Values["controller"]?.ToString() == "Alerts" ? "active" : "")">Alerts <span id="alert-badge" class="alert-count"></span></a></li>
                <li><a href="/Settings" class="@(ViewContext.RouteData.Values["controller"]?.ToString() == "Settings" ? "active" : "")">Settings</a></li>
            </ul>
        </nav>
        <main class="main-content">
            <header class="page-header">
                <h1>@ViewData["Title"]</h1>
                <div class="user-info">
                    @if (User.Identity?.IsAuthenticated == true)
                    {
                        <span>@User.Identity.Name</span>
                        <a href="/Identity/Account/Logout">Sign Out</a>
                    }
                </div>
            </header>
            <div class="content-area">
                @RenderBody()
            </div>
        </main>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js"></script>
    <script src="~/js/signalr-client.js"></script>
    @await RenderSectionAsync("Scripts", required: false)
</body>
</html>
```

### BNDashboard.Web/Views/Dashboard/Index.cshtml

```html
@model BNDashboard.Web.ViewModels.DashboardViewModel
@{
    ViewData["Title"] = "Dashboard";
}

<div class="summary-cards">
    <div class="summary-card">
        <div class="summary-value">@Model.Summary.TotalJobs</div>
        <div class="summary-label">Active Pipelines</div>
    </div>
    <div class="summary-card success">
        <div class="summary-value">@Model.Summary.SuccessRate24h%</div>
        <div class="summary-label">Success Rate (24h)</div>
    </div>
    <div class="summary-card">
        <div class="summary-value">@Model.Summary.TotalRowsToday.ToString("N0")</div>
        <div class="summary-label">Rows Processed Today</div>
    </div>
    <div class="summary-card @(Model.Summary.ActiveAlerts > 0 ? "danger" : "")">
        <div class="summary-value">@Model.Summary.ActiveAlerts</div>
        <div class="summary-label">Active Alerts</div>
    </div>
</div>

<div class="chart-row">
    <div class="chart-container">
        <h3>Pipeline Throughput (24h)</h3>
        <canvas id="throughputChart"></canvas>
    </div>
</div>

<h2>Pipeline Jobs</h2>
<div class="job-grid" id="job-grid">
    @foreach (var job in Model.JobCards)
    {
        <div class="job-card" data-job-id="@job.JobId">
            <div class="job-header">
                <h3>@job.Name</h3>
                <span class="badge @job.StatusCssClass">@job.Status</span>
            </div>
            <div class="job-meta">
                <span class="source">@job.SourceSystem</span>
                @if (job.LastRunAt.HasValue)
                {
                    <span class="last-run">@job.LastRunAt.Value.ToString("g")</span>
                }
            </div>
            <div class="job-stats">
                <div><strong>@job.RowsProcessed.ToString("N0")</strong> rows</div>
                <div><strong>@job.DurationSeconds.ToString("F1")</strong>s</div>
            </div>
            <a href="/Jobs/Detail/@job.JobId" class="detail-link">View Details</a>
        </div>
    }
</div>

@section Scripts {
<script src="~/js/dashboard.js"></script>
}
```

### BNDashboard.Web/wwwroot/js/dashboard.js

```javascript
// Fetch and render throughput chart
async function initThroughputChart() {
    const response = await fetch('/api/metrics/throughput?hours=24');
    const data = await response.json();

    const ctx = document.getElementById('throughputChart');
    if (!ctx) return;

    window.throughputChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.timestamp).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit'
            })),
            datasets: [{
                label: 'Rows Processed',
                data: data.map(d => d.rowCount),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v
                    }
                }
            }
        }
    });
}

initThroughputChart();
```

### BNDashboard.Web/wwwroot/js/signalr-client.js

```javascript
const connection = new signalR.HubConnectionBuilder()
    .withUrl('/hubs/pipeline')
    .withAutomaticReconnect()
    .build();

connection.on('ReceiveJobUpdate', (message) => {
    console.log('Job update:', message);

    // Update the matching job card in the DOM
    const card = document.querySelector(`[data-job-id="${message.jobId}"]`);
    if (card) {
        const badge = card.querySelector('.badge');
        if (badge) {
            badge.textContent = message.status;
            badge.className = 'badge badge-' + (
                message.status === 'Success' ? 'success' :
                message.status === 'Failed' ? 'danger' :
                message.status === 'Running' ? 'primary' : 'secondary'
            );
        }

        const stats = card.querySelector('.job-stats');
        if (stats) {
            stats.innerHTML = `
                <div><strong>${message.rowsLoaded.toLocaleString()}</strong> rows</div>
                <div><strong>${message.durationSeconds.toFixed(1)}</strong>s</div>
            `;
        }

        const lastRun = card.querySelector('.last-run');
        if (lastRun) {
            lastRun.textContent = new Date(message.completedAt).toLocaleString();
        }

        // Flash animation
        card.classList.add('updated');
        setTimeout(() => card.classList.remove('updated'), 2000);
    }

    // Refresh throughput chart
    if (window.throughputChart) {
        initThroughputChart();
    }
});

connection.on('ReceiveAlert', (message) => {
    const badge = document.getElementById('alert-badge');
    if (badge) {
        const current = parseInt(badge.textContent) || 0;
        badge.textContent = current + 1;
        badge.classList.add('pulse');
    }
});

connection.start().catch(err => console.error('SignalR connection error:', err));
```

### BNDashboard.Web/Program.cs

```csharp
using BNDashboard.Core.Interfaces;
using BNDashboard.Data;
using BNDashboard.Data.Repositories;
using BNDashboard.Services;
using BNDashboard.Web.Hubs;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<DashboardDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Identity
builder.Services.AddDefaultIdentity<IdentityUser>(options =>
{
    options.SignIn.RequireConfirmedAccount = false;
    options.Password.RequireDigit = false;
    options.Password.RequiredLength = 6;
})
.AddRoles<IdentityRole>()
.AddEntityFrameworkStores<DashboardDbContext>();

// Services
builder.Services.AddScoped<IPipelineRepository, PipelineRepository>();
builder.Services.AddHostedService<PipelineSimulatorService>();
builder.Services.AddSignalR();

// MVC
builder.Services.AddControllersWithViews();
builder.Services.AddRazorPages(); // For Identity UI

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(name: "default", pattern: "{controller=Dashboard}/{action=Index}/{id?}");
app.MapRazorPages();
app.MapHub<PipelineHub>("/hubs/pipeline");

// Seed database
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<DashboardDbContext>();
    await db.Database.MigrateAsync();
    await SeedData.InitializeAsync(db, scope.ServiceProvider);
}

app.Run();

// Seed data helper
static class SeedData
{
    public static async Task InitializeAsync(DashboardDbContext db, IServiceProvider services)
    {
        if (await db.PipelineJobs.AnyAsync()) return;

        db.PipelineJobs.AddRange(
            new() { Name = "Procore Projects Sync", SourceSystem = "Procore", TargetTable = "dbo.Projects", CronSchedule = "0 */4 * * *" },
            new() { Name = "Sage Cost Codes", SourceSystem = "Sage 300", TargetTable = "dbo.CostCodes", CronSchedule = "0 6 * * *" },
            new() { Name = "Oracle AP Extract", SourceSystem = "Oracle", TargetTable = "dbo.AccountsPayable", CronSchedule = "0 */6 * * *" },
            new() { Name = "Timecard Import", SourceSystem = "Procore", TargetTable = "dbo.Timecards", CronSchedule = "30 5 * * *" },
            new() { Name = "Budget Forecast Sync", SourceSystem = "Sage 300", TargetTable = "dbo.BudgetForecasts", CronSchedule = "0 2 * * 1" }
        );

        db.TableSyncs.AddRange(
            new() { TableName = "dbo.Projects", SourceSystem = "Procore", RowCount = 342, SizeBytes = 2_400_000 },
            new() { TableName = "dbo.CostCodes", SourceSystem = "Sage 300", RowCount = 15_280, SizeBytes = 8_100_000 },
            new() { TableName = "dbo.AccountsPayable", SourceSystem = "Oracle", RowCount = 89_400, SizeBytes = 45_000_000 },
            new() { TableName = "dbo.Timecards", SourceSystem = "Procore", RowCount = 128_000, SizeBytes = 62_000_000 },
            new() { TableName = "dbo.BudgetForecasts", SourceSystem = "Sage 300", RowCount = 4_200, SizeBytes = 3_800_000 },
            new() { TableName = "dbo.Vendors", SourceSystem = "Oracle", RowCount = 2_100, SizeBytes = 1_500_000 },
            new() { TableName = "dbo.Submittals", SourceSystem = "Procore", RowCount = 8_900, SizeBytes = 5_200_000 },
            new() { TableName = "dbo.ChangeOrders", SourceSystem = "Procore", RowCount = 3_400, SizeBytes = 2_900_000 },
            new() { TableName = "dbo.Invoices", SourceSystem = "Oracle", RowCount = 67_200, SizeBytes = 38_000_000 },
            new() { TableName = "dbo.Employees", SourceSystem = "Sage 300", RowCount = 1_850, SizeBytes = 980_000 }
        );

        await db.SaveChangesAsync();

        // Seed admin user
        var userManager = services.GetRequiredService<UserManager<IdentityUser>>();
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();

        if (!await roleManager.RoleExistsAsync("Admin"))
            await roleManager.CreateAsync(new IdentityRole("Admin"));

        var admin = new IdentityUser { UserName = "tiger@bnbuilders.com", Email = "tiger@bnbuilders.com" };
        var result = await userManager.CreateAsync(admin, "BNBuild3rs!");
        if (result.Succeeded)
            await userManager.AddToRoleAsync(admin, "Admin");
    }
}
```

</details>

---

## What to Show Off

### Portfolio Presentation

- **Live demo**: Run the application locally, open the dashboard in a browser, and show job cards updating in real time via SignalR. Show the charts animating as new data flows in. This is visually impressive.
- **Architecture diagram**: Show the data flow from background service through SignalR to browser. Show the project dependency graph (Web -> Services -> Data -> Core). This demonstrates understanding of clean architecture.
- **Screenshots**: Include screenshots of each page in your GitHub README. The dashboard, chart views, data quality page, and alert configuration all photograph well.

### Interview Talking Points

- "I built a pipeline monitoring dashboard using ASP.NET Core MVC with SignalR for real-time updates — no polling required."
- "The background service uses `IHostedService` with `PeriodicTimer` and creates scoped DbContext instances to avoid lifetime issues."
- "I used the repository pattern with interfaces in the Core project to keep EF Core out of my business logic."
- "The dashboard uses Chart.js with data fetched from REST API endpoints, and SignalR pushes incremental updates."
- Discuss trade-offs: why MVC over Blazor, why SignalR over polling, why a background service over a real scheduler.

### Code Quality Signals

- Clean project separation: Core has zero framework dependencies
- Strongly-typed SignalR hub with `IPipelineClient` interface
- Proper async/await throughout with cancellation token support
- EF Core Fluent API configuration with appropriate indexes
- ViewModels mapping in controllers, not passing entities to views

---

## Stretch Goals

1. **Blazor interactive components**: Replace the JavaScript/SignalR chart updates with Blazor Server components. This lets you write C# instead of JavaScript for the real-time dashboard portions while keeping the MVC shell.

2. **Export to CSV/Excel**: Add download buttons on the Job History and Data Quality pages that generate CSV files using `CsvHelper` or Excel files using `ClosedXML`. Useful for stakeholders who want to analyze pipeline data in Excel.

3. **Email alert notifications**: Implement `IAlertNotifier` with an SMTP implementation that sends emails when critical alerts fire. Use `IOptions<SmtpSettings>` for configuration. In development, log the email body instead of sending.

4. **Health check dashboard**: Add ASP.NET Core health checks (`builder.Services.AddHealthChecks().AddSqlServer(...)`) for database connectivity, background service heartbeat, and disk space. Expose at `/healthz` and display status on the Settings page.

5. **Multi-tenant support**: Add a `TenantId` column to all tables and filter by the current user's tenant. This simulates a SaaS deployment where multiple teams each see their own pipelines. Use a global query filter in EF Core.
