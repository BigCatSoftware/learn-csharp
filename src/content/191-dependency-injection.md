# Dependency Injection Deep Dive

*Chapter 12.12 — ASP.NET Core MVC & Razor Pages*

---

## Overview

Dependency Injection (DI) is a first-class citizen in ASP.NET Core. The built-in IoC
(Inversion of Control) container manages the creation, lifetime, and disposal of
services throughout your application.

Rather than classes creating their own dependencies with `new`, they **declare** what
they need through constructor parameters. The DI container resolves the dependency graph
at runtime, wiring everything together.

This lesson goes beyond the basics. We cover service lifetimes in depth, the dangerous
captive dependency problem, advanced registration techniques (keyed services, open
generics, decorators), and the practical patterns you will use daily in ASP.NET Core
applications.

---

## Core Concepts

### Service Lifetimes

ASP.NET Core's DI container supports three lifetimes:

| Lifetime      | Created...                                | Disposed...                        |
|---------------|-------------------------------------------|------------------------------------|
| **Transient** | Every time it is requested                | At scope disposal (end of request) |
| **Scoped**    | Once per scope (typically once per HTTP request) | At scope disposal          |
| **Singleton** | Once for the application lifetime         | At application shutdown            |

**When to use each:**

- **Transient** — Lightweight, stateless services. Each consumer gets its own instance.
  Good for: services with no shared state, operation-specific work.

- **Scoped** — Services that should be shared within a single request but isolated
  between requests. Good for: `DbContext`, unit-of-work patterns, per-request caching.

- **Singleton** — Services that are expensive to create or must maintain global state.
  Good for: `HttpClient` factories, configuration wrappers, in-memory caches.

### The Captive Dependency Problem

A **captive dependency** occurs when a longer-lived service holds a reference to a
shorter-lived service:

```
Singleton -> holds Scoped service    // BUG!
Singleton -> holds Transient service // BUG! (transient becomes singleton)
Scoped    -> holds Transient service // OK (transient lives for request)
```

The scoped service is "captured" by the singleton and lives far longer than intended.
For `DbContext`, this means a single instance is shared across all requests —
stale data, tracking bugs, and thread-safety violations.

**Detection:** Set `ServiceProviderOptions.ValidateScopes = true` (enabled by default
in Development):

```csharp
builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = true;
    options.ValidateOnBuild = true; // also validates at startup
});
```

### IServiceScopeFactory

When a singleton needs to access a scoped service, create a new scope explicitly:

```csharp
public class BackgroundJobService : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public BackgroundJobService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task ProcessAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        // dbContext is properly scoped and will be disposed with the scope
    }
}
```

---

## Code Examples

### Basic Registration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Transient
builder.Services.AddTransient<IEmailSender, SmtpEmailSender>();

// Scoped (most common for data access)
builder.Services.AddScoped<IProjectRepository, SqlProjectRepository>();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

// Singleton
builder.Services.AddSingleton<ICostCodeCache, InMemoryCostCodeCache>();

// Multiple implementations of the same interface
builder.Services.AddScoped<INotificationService, EmailNotificationService>();
builder.Services.AddScoped<INotificationService, SmsNotificationService>();
// Injecting IEnumerable<INotificationService> gives you both
```

### Constructor Injection (Standard Pattern)

```csharp
public class JobCostController : Controller
{
    private readonly IProjectRepository _projectRepo;
    private readonly ICostCodeCache _costCodes;
    private readonly ILogger<JobCostController> _logger;

    public JobCostController(
        IProjectRepository projectRepo,
        ICostCodeCache costCodes,
        ILogger<JobCostController> logger)
    {
        _projectRepo = projectRepo;
        _costCodes = costCodes;
        _logger = logger;
    }

    public async Task<IActionResult> Index(int projectId)
    {
        var project = await _projectRepo.GetByIdAsync(projectId);
        var codes = _costCodes.GetAll();
        return View(new JobCostViewModel(project, codes));
    }
}
```

### Keyed Services (.NET 8+)

```csharp
// Registration with keys
builder.Services.AddKeyedScoped<IReportGenerator, PdfReportGenerator>("pdf");
builder.Services.AddKeyedScoped<IReportGenerator, ExcelReportGenerator>("excel");
builder.Services.AddKeyedScoped<IReportGenerator, CsvReportGenerator>("csv");

// Injection using [FromKeyedServices]
public class ReportController : Controller
{
    public IActionResult GeneratePdf(
        [FromKeyedServices("pdf")] IReportGenerator generator,
        int projectId)
    {
        var report = generator.Generate(projectId);
        return File(report.Data, report.ContentType, report.FileName);
    }
}

// Or resolve from the container manually:
public class ReportService
{
    private readonly IServiceProvider _provider;

    public ReportService(IServiceProvider provider) => _provider = provider;

    public IReportGenerator GetGenerator(string format)
    {
        return _provider.GetRequiredKeyedService<IReportGenerator>(format);
    }
}
```

### Open Generic Registration

```csharp
// Register a generic repository for any entity type
builder.Services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));

// Now you can inject:
public class ProjectService
{
    private readonly IRepository<Project> _projectRepo;
    private readonly IRepository<CostCode> _costCodeRepo;

    public ProjectService(
        IRepository<Project> projectRepo,
        IRepository<CostCode> costCodeRepo)
    {
        _projectRepo = projectRepo;
        _costCodeRepo = costCodeRepo;
    }
}
```

### Decorator Pattern with DI

The built-in container does not natively support decorators, but you can achieve it
with a factory registration:

```csharp
// The decorator wraps the inner service
public class CachingProjectRepository : IProjectRepository
{
    private readonly IProjectRepository _inner;
    private readonly IMemoryCache _cache;

    public CachingProjectRepository(IProjectRepository inner, IMemoryCache cache)
    {
        _inner = inner;
        _cache = cache;
    }

    public async Task<Project?> GetByIdAsync(int id)
    {
        return await _cache.GetOrCreateAsync($"project:{id}",
            async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
                return await _inner.GetByIdAsync(id);
            });
    }

    // delegate other methods to _inner...
}

// Registration using factory
builder.Services.AddScoped<SqlProjectRepository>();
builder.Services.AddScoped<IProjectRepository>(sp =>
{
    var inner = sp.GetRequiredService<SqlProjectRepository>();
    var cache = sp.GetRequiredService<IMemoryCache>();
    return new CachingProjectRepository(inner, cache);
});
```

For more complex decorator chains, consider the **Scrutor** NuGet package:

```csharp
// With Scrutor
builder.Services.AddScoped<IProjectRepository, SqlProjectRepository>();
builder.Services.Decorate<IProjectRepository, CachingProjectRepository>();
builder.Services.Decorate<IProjectRepository, LoggingProjectRepository>();
// Resolution order: Logging -> Caching -> Sql
```

### Service Registration with TryAdd

```csharp
using Microsoft.Extensions.DependencyInjection.Extensions;

// Only registers if IProjectRepository is not already registered
builder.Services.TryAddScoped<IProjectRepository, SqlProjectRepository>();

// Useful in library code where you want to provide defaults
// that the consuming app can override
```

### Validating the DI Container at Startup

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Host.UseDefaultServiceProvider(options =>
{
    // Validate that scoped services are not resolved from the root container
    options.ValidateScopes = true;

    // Validate that all services can be created at startup
    // Catches missing registrations before the first request
    options.ValidateOnBuild = true;
});
```

---

## Common Patterns

1. **Interface segregation** — Define focused interfaces (`IProjectReader`,
   `IProjectWriter`) rather than a single large `IProjectService`. This makes testing
   easier and dependency graphs clearer.

2. **Options pattern for configuration** — Instead of injecting `IConfiguration`
   directly, bind sections to POCOs and inject `IOptions<T>`. (See lesson 192.)

3. **Factory pattern** — When the service to create depends on runtime data, inject a
   factory instead of the service itself:

```csharp
builder.Services.AddScoped<Func<string, IExportService>>(sp => format =>
    format switch
    {
        "pdf" => sp.GetRequiredService<PdfExportService>(),
        "csv" => sp.GetRequiredService<CsvExportService>(),
        _ => throw new ArgumentException($"Unknown format: {format}")
    });
```

4. **Register hosted services** for background work:

```csharp
builder.Services.AddHostedService<DailyCostSyncService>();
```

5. **Extension method for clean registration:**

```csharp
public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddJobCostServices(
        this IServiceCollection services)
    {
        services.AddScoped<IProjectRepository, SqlProjectRepository>();
        services.AddScoped<ICostCalculator, StandardCostCalculator>();
        services.AddScoped<IJobCostService, JobCostService>();
        return services;
    }
}

// Program.cs
builder.Services.AddJobCostServices();
```

---

## Gotchas and Pitfalls

- **Captive dependencies** — The number one DI mistake. A singleton holding a scoped
  `DbContext` will reuse the same context across all requests. Enable `ValidateScopes`
  in development to catch this early.

- **Resolving services in `Configure` methods.** Avoid
  `app.ApplicationServices.GetService<T>()` for scoped services — it resolves from the
  root provider. Use `app.Services.CreateScope()` or resolve within middleware.

- **Too many constructor parameters.** If a class has 8+ dependencies, it is a code smell
  suggesting the class has too many responsibilities. Refactor using aggregate services
  or the facade pattern.

- **Disposable transients.** Transient services that implement `IDisposable` are tracked
  by the container and disposed at scope end. This can cause unexpected memory growth if
  you create many transients within a request. Consider making them scoped instead.

- **Registering the same interface multiple times** replaces the previous registration
  (last one wins) unless you inject `IEnumerable<T>`. Use `TryAdd` if you want
  "register only if not already registered" semantics.

- **Service Locator anti-pattern.** Injecting `IServiceProvider` and calling
  `GetService<T>()` everywhere defeats the purpose of DI. It hides dependencies and
  makes code harder to test. Use it sparingly — only in factories or framework code.

- **Forgetting `ValidateOnBuild`.** Without it, missing registrations are only discovered
  when the first request hits the endpoint that needs the service. With it, the app
  fails fast at startup.

---

## Performance Considerations

- **Singleton services** avoid per-request allocation and are faster to resolve. Use
  them for stateless, thread-safe services.

- **Transient services** create a new instance on every resolution. For services resolved
  many times per request (e.g., in a loop), this can cause allocation pressure. Consider
  promoting to scoped.

- **The built-in container is fast** for typical use cases (hundreds of registrations).
  If you have thousands of registrations or complex resolution chains, consider a
  third-party container like Autofac, but measure first.

- **`ValidateOnBuild = true`** adds startup time because it attempts to resolve every
  registered service. Disable it in production if startup time is critical (though the
  safety benefit usually outweighs the cost).

- **Open generic registrations** are slightly slower to resolve than closed generics
  because the container must construct the closed type at runtime. In practice, this is
  negligible.

- **Avoid resolving services in hot loops.** If you need a service inside a loop,
  resolve it once before the loop and reuse the reference.

---

## BNBuilders Context

- **`DbContext` as scoped** — The ERP database context (`SageDbContext`,
  `ViewpointDbContext`) should always be scoped. A captive dependency here means stale
  financial data showing up on dashboards — a potentially costly mistake in construction.

- **Keyed services for report generation** — BNBuilders likely generates reports in
  multiple formats (PDF for clients, Excel for PMs, CSV for data imports). Keyed services
  let you resolve the right generator by format name.

- **Background services** — A `HostedService` that syncs cost data from the ERP system
  every 15 minutes must use `IServiceScopeFactory` to create a scope for its `DbContext`.
  This is a common pattern for data engineering pipelines.

- **Extension methods per domain** — Organize DI registrations into
  `AddJobCostServices()`, `AddFieldDataServices()`, `AddReportingServices()` so
  `Program.cs` stays clean across BNBuilders' growing suite of internal tools.

- **Decorator pattern for caching** — Wrap the `SqlProjectRepository` with a
  `CachingProjectRepository`. The job cost dashboard queries the same project data
  repeatedly; caching at the repository level avoids hammering the database.

- **Feature-flagged services** — Use DI to swap implementations based on feature flags.
  For example, register `INotificationService` as either `EmailNotificationService` or
  `NoOpNotificationService` depending on whether notifications are enabled for the
  current environment.

---

## Interview / Senior Dev Questions

1. **Explain the captive dependency problem. How does ASP.NET Core help you detect it?**
   A singleton service captures a scoped service, preventing it from being disposed
   per-request. ASP.NET Core detects this at runtime (in Development) with
   `ValidateScopes = true`, throwing an `InvalidOperationException` when a scoped service
   is resolved from the root provider.

2. **A background service needs `DbContext`. How do you handle the lifetime mismatch?**
   Inject `IServiceScopeFactory`, create a new scope for each unit of work, and resolve
   `DbContext` from that scope. The scope (and its `DbContext`) is disposed when the
   work completes.

3. **You have 12 dependencies in a constructor. What do you do?**
   This signals too many responsibilities. Refactor by:
   - Extracting groups of related dependencies into aggregate/facade services.
   - Applying the Single Responsibility Principle to split the class.
   - Using the Mediator pattern (MediatR) to decouple command/query handling.

4. **What is the difference between `AddScoped<IFoo, Foo>()` and
   `AddScoped<IFoo>(sp => new Foo(sp.GetRequiredService<IBar>()))`?**
   Both register `IFoo` as scoped. The first uses the container's built-in activation
   (faster, supports `ValidateOnBuild`). The second uses a factory delegate, which is
   necessary when you need custom construction logic (e.g., decorators, conditional
   logic) but is opaque to `ValidateOnBuild`.

5. **When would you use a third-party DI container over the built-in one?**
   When you need features the built-in container lacks: property injection, named
   registrations (pre-.NET 8), interception/AOP, convention-based registration,
   child containers, or advanced lifetime management. Autofac and Lamar are popular
   choices. Measure first — the built-in container covers 90% of use cases.

---

## Quiz

**Question 1:** A singleton service depends on `AppDbContext` (registered as scoped).
The app runs fine in production but throws an exception in development. Why?

<details>
<summary>Answer</summary>

In development, `ValidateScopes` is enabled by default. When the singleton tries to
resolve the scoped `AppDbContext` from the root service provider, the framework throws
an `InvalidOperationException` because scoped services should not be resolved from the
root scope. In production, `ValidateScopes` is disabled by default, so the captive
dependency goes undetected — but still causes bugs (stale data, thread-safety issues).
</details>

---

**Question 2:** What is the difference between `AddSingleton`, `AddScoped`, and
`AddTransient` for a service that implements `IDisposable`?

<details>
<summary>Answer</summary>

- **Singleton:** Created once, disposed at application shutdown.
- **Scoped:** Created once per request/scope, disposed at the end of the scope.
- **Transient:** Created every time it is requested, but still tracked by the scope and
  disposed when the scope ends.

Key insight: the container tracks all `IDisposable` instances it creates. Transient
disposables can accumulate within a scope, causing memory pressure if many are created
per request.
</details>

---

**Question 3:** You register two implementations of `INotificationService`:

```csharp
builder.Services.AddScoped<INotificationService, EmailNotificationService>();
builder.Services.AddScoped<INotificationService, SmsNotificationService>();
```

What happens when you inject `INotificationService` (not `IEnumerable`)?

<details>
<summary>Answer</summary>

You get the **last registered** implementation — `SmsNotificationService`. The first
registration is effectively replaced for single-instance resolution.

To get **both** implementations, inject `IEnumerable<INotificationService>`. This gives
you a collection containing both `EmailNotificationService` and `SmsNotificationService`.
</details>

---

**Question 4:** What is `ValidateOnBuild` and why should you enable it?

<details>
<summary>Answer</summary>

`ValidateOnBuild = true` causes the DI container to attempt to resolve every registered
service at application startup. If any service has missing dependencies, the app fails
fast with a clear error instead of failing later when that service is first requested.

This is especially valuable in large applications where a missing registration might only
be hit by a rarely-used endpoint, causing a production error weeks after deployment.
</details>
