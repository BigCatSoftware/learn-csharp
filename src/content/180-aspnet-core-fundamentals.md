# ASP.NET Core Fundamentals

*Chapter 12.1 --- ASP.NET Core MVC & Razor Pages*

## Overview

ASP.NET Core is a cross-platform, high-performance framework for building modern web applications.
At its heart lies a **middleware pipeline** configured in `Program.cs`, a built-in
**dependency injection container**, and a layered **configuration system** that adapts to
different environments. Understanding these fundamentals is essential before writing a single
controller or Razor Page --- they determine how every HTTP request is received, processed,
and returned.

This lesson covers the minimal hosting model introduced in .NET 6, the middleware pipeline
and its ordering rules, the DI container, and the configuration/environment system.

## Core Concepts

### Program.cs and the Minimal Hosting Model

Before .NET 6, ASP.NET Core apps had both `Program.cs` and `Startup.cs`. The minimal hosting
model collapses everything into a single `Program.cs` file using `WebApplication.CreateBuilder`
and `WebApplication`.

Key objects:

| Object | Purpose |
|---|---|
| `WebApplicationBuilder` | Configure services, configuration, logging **before** the app is built |
| `WebApplication` | Configure the middleware pipeline **after** building |
| `builder.Services` | The `IServiceCollection` --- register DI services here |
| `builder.Configuration` | The `IConfiguration` root --- access config values here |
| `app` | The built `WebApplication` --- add middleware, map endpoints |

### The Middleware Pipeline

Middleware components form a **pipeline**. Each component can:

1. Handle the request and short-circuit (stop the pipeline).
2. Pass the request to the **next** middleware via `next()`.
3. Do work **before** and **after** calling `next()`.

Three extension methods build the pipeline:

- **`Use`** --- adds middleware that calls `next()` (can short-circuit).
- **`Map`** --- branches the pipeline based on a request path.
- **`Run`** --- terminal middleware; never calls `next()`.

**Order matters.** Middleware executes top-to-bottom on the request, bottom-to-top on the response.

### Built-in Middleware (Typical Order)

1. `ExceptionHandler` / `DeveloperExceptionPage`
2. `HSTS`
3. `HttpsRedirection`
4. `StaticFiles`
5. `Routing`
6. `CORS`
7. `Authentication`
8. `Authorization`
9. Endpoint execution (controllers / Razor Pages)

### Dependency Injection (IServiceCollection)

ASP.NET Core has a first-class DI container. Services are registered on
`builder.Services` with one of three lifetimes:

| Lifetime | Method | Behavior |
|---|---|---|
| **Transient** | `AddTransient<T>()` | New instance every time it is requested |
| **Scoped** | `AddScoped<T>()` | One instance per HTTP request |
| **Singleton** | `AddSingleton<T>()` | One instance for the app lifetime |

### IConfiguration and Environments

Configuration sources are layered (last wins):

1. `appsettings.json`
2. `appsettings.{Environment}.json`
3. Environment variables
4. Command-line arguments
5. User secrets (Development only)

The environment is set via `ASPNETCORE_ENVIRONMENT`. The three conventional values are
`Development`, `Staging`, and `Production`.

## Code Examples

### Minimal Program.cs

```csharp
var builder = WebApplication.CreateBuilder(args);

// --- Service Registration ---
builder.Services.AddControllersWithViews();
builder.Services.AddScoped<IJobCostService, JobCostService>();
builder.Services.AddDbContext<BNBuildersDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

var app = builder.Build();

// --- Middleware Pipeline ---
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
```

### Custom Middleware with Use, Map, Run

```csharp
// Use --- passes to next middleware
app.Use(async (context, next) =>
{
    var stopwatch = Stopwatch.StartNew();
    await next();                       // call the next middleware
    stopwatch.Stop();
    context.Response.Headers["X-Elapsed-Ms"] = stopwatch.ElapsedMilliseconds.ToString();
});

// Map --- branch on path
app.Map("/health", healthApp =>
{
    healthApp.Run(async context =>
    {
        await context.Response.WriteAsync("Healthy");
    });
});

// Run --- terminal, no next()
app.Run(async context =>
{
    await context.Response.WriteAsync("Catch-all terminal middleware");
});
```

### appsettings.json Layering

```json
// appsettings.json (base)
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=PROD-SQL;Database=BNBuilders;Trusted_Connection=True;"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Warning"
    }
  }
}
```

```json
// appsettings.Development.json (overrides base in Development)
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=BNBuilders_Dev;Trusted_Connection=True;"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Debug"
    }
  }
}
```

### Reading Configuration with Options Pattern

```csharp
// In appsettings.json
// "ReportSettings": { "MaxExportRows": 10000, "DefaultCurrency": "USD" }

public class ReportSettings
{
    public int MaxExportRows { get; set; }
    public string DefaultCurrency { get; set; } = "USD";
}

// Program.cs
builder.Services.Configure<ReportSettings>(
    builder.Configuration.GetSection("ReportSettings"));

// In a controller or service
public class ReportController : Controller
{
    private readonly ReportSettings _settings;

    public ReportController(IOptions<ReportSettings> options)
    {
        _settings = options.Value;
    }
}
```

### Registering Services with DI

```csharp
// Interface
public interface IJobCostService
{
    Task<JobCostSummary> GetSummaryAsync(int projectId);
}

// Implementation
public class JobCostService : IJobCostService
{
    private readonly BNBuildersDbContext _db;

    public JobCostService(BNBuildersDbContext db) => _db = db;

    public async Task<JobCostSummary> GetSummaryAsync(int projectId)
    {
        return await _db.JobCosts
            .Where(jc => jc.ProjectId == projectId)
            .GroupBy(jc => jc.CostCode)
            .Select(g => new JobCostSummary
            {
                CostCode = g.Key,
                Total = g.Sum(x => x.Amount)
            })
            .ToListAsync();
    }
}

// Registration
builder.Services.AddScoped<IJobCostService, JobCostService>();
```

## Common Patterns

1. **Options pattern** --- Bind configuration sections to strongly-typed classes with
   `IOptions<T>`, `IOptionsSnapshot<T>` (scoped, reloads), or `IOptionsMonitor<T>` (singleton, reloads).
2. **Environment-based branching** --- Use `app.Environment.IsDevelopment()` to toggle
   developer exception pages, seed data, or verbose logging.
3. **Extension methods for service registration** --- Group related DI registrations in
   static extension methods to keep `Program.cs` clean:
   ```csharp
   public static class ServiceCollectionExtensions
   {
       public static IServiceCollection AddBNBuildersServices(this IServiceCollection services)
       {
           services.AddScoped<IJobCostService, JobCostService>();
           services.AddScoped<IFieldReportService, FieldReportService>();
           return services;
       }
   }
   // Program.cs
   builder.Services.AddBNBuildersServices();
   ```
4. **Health check endpoints** --- Use `builder.Services.AddHealthChecks()` and
   `app.MapHealthChecks("/health")` for load balancer probes.

## Gotchas and Pitfalls

- **Middleware order is critical.** Placing `UseAuthentication()` after `UseAuthorization()`
  means authorization runs without a user --- every request is denied.
- **Captive dependency problem.** A singleton that depends on a scoped service will hold a
  stale scoped instance for the app lifetime. ASP.NET Core throws in Development but silently
  allows it in Production by default. Enable `ValidateScopes` in Production too.
- **`appsettings.Development.json` is not secret.** It ships with publish output unless
  excluded. Use User Secrets or Azure Key Vault for credentials.
- **`UseStaticFiles()` before `UseRouting()`** --- Static files should be served without
  hitting the routing/auth pipeline for performance.
- **Forgetting `await` in middleware** --- Calling `next()` without `await` causes the
  response to start writing before downstream middleware finishes.

## Performance Considerations

- **Static files middleware early** prevents unnecessary routing/auth overhead for CSS, JS,
  images.
- **Response compression middleware** (`UseResponseCompression`) significantly reduces
  payload size for dashboards with large HTML tables.
- Use `IOptionsMonitor<T>` instead of re-reading `IConfiguration` in hot paths ---
  it caches and only reloads on change.
- Avoid registering heavy services as **Transient** if they can be **Scoped** --- reduces
  allocations per request.
- In Production, always use `UseExceptionHandler` instead of `UseDeveloperExceptionPage` ---
  the developer page serializes the full stack and is expensive.

## BNBuilders Context

At BNBuilders, the middleware pipeline and DI container underpin every internal tool:

- **Job Cost Dashboard** --- `IJobCostService` is registered as Scoped and injected into
  controllers. The `appsettings.Production.json` points to the production SQL Server instance
  while `appsettings.Development.json` uses a local copy for safe testing.
- **Field Data Entry App** --- The `UseAuthentication` / `UseAuthorization` middleware
  enforces Azure AD login so only authenticated field staff can submit daily reports.
- **Reporting Apps** --- The Options pattern binds `ReportSettings` (max export rows,
  default date ranges) from config, making it easy for admins to tweak without redeploying.
- **CORS middleware** --- Needed when a separate front-end SPA calls the internal API.
  Configured per-environment so Development is permissive, Production is locked down.
- **Health checks** --- Azure App Service pings `/health` to verify the app is running and
  the database connection is alive before routing traffic.

## Interview / Senior Dev Questions

1. **Explain the difference between `Use`, `Map`, and `Run` in the middleware pipeline.**
   Expected: `Use` passes to next, `Map` branches on path, `Run` is terminal.
2. **What happens if you register a Scoped service and inject it into a Singleton?**
   Expected: Captive dependency. The scoped instance lives as long as the singleton.
   `ValidateScopes` catches this in Development.
3. **How does configuration layering work? Which source wins?**
   Expected: Last-added source wins. Typical order: appsettings.json, environment-specific
   JSON, environment variables, command line, user secrets (dev only).
4. **When would you use `IOptionsSnapshot<T>` vs `IOptionsMonitor<T>`?**
   Expected: Snapshot is scoped (re-reads per request), Monitor is singleton (push-based
   change notifications).
5. **Why must `UseRouting` come before `UseAuthorization`?**
   Expected: Authorization needs the matched endpoint metadata (e.g., `[Authorize]`) which
   is only available after routing selects an endpoint.

## Quiz

**Q1: Which middleware method is terminal and never calls `next()`?**

a) `Use`
b) `Map`
c) `Run`
d) `MapWhen`

<details><summary>Answer</summary>

**c) `Run`** --- `Run` adds terminal middleware. It handles the request and does not invoke
the next delegate. `Use` calls `next()`, `Map` branches but continues within the branch,
and `MapWhen` is a conditional branch.

</details>

**Q2: You register a service like this: `builder.Services.AddScoped<IReportService, ReportService>();`. How many instances are created if a single HTTP request resolves `IReportService` in three different places?**

a) 3
b) 1
c) 0 --- it is lazy and never created
d) It depends on the controller lifetime

<details><summary>Answer</summary>

**b) 1** --- Scoped lifetime means one instance per HTTP request (per DI scope). No matter
how many times it is resolved within the same request, the same instance is returned.

</details>

**Q3: Your `appsettings.json` sets `"MaxExportRows": 5000` and `appsettings.Development.json` sets `"MaxExportRows": 50000`. You are running in the Development environment. What value does `IOptions<ReportSettings>.Value.MaxExportRows` return?**

a) 5000
b) 50000
c) 0 --- default int
d) It throws because of a conflict

<details><summary>Answer</summary>

**b) 50000** --- Environment-specific config files override the base `appsettings.json`.
Since the environment is Development, `appsettings.Development.json` is loaded after and
its values win.

</details>

**Q4: Where should `UseStaticFiles()` be placed relative to `UseRouting()` and why?**

a) After `UseRouting()` so routes are matched first
b) Before `UseRouting()` so static files are served without routing overhead
c) It does not matter
d) Inside a `Map` branch

<details><summary>Answer</summary>

**b) Before `UseRouting()`** --- Static file requests (CSS, JS, images) should be served as
early as possible without incurring the cost of routing, authentication, or authorization
middleware. This improves performance for every static asset request.

</details>

**Q5: What is the captive dependency problem?**

a) A Transient service that depends on a Singleton
b) A Singleton service that depends on a Scoped service, holding the scoped instance for the app lifetime
c) A Scoped service that depends on a Transient service
d) Circular dependency between two Singletons

<details><summary>Answer</summary>

**b) A Singleton service that depends on a Scoped service.** The singleton lives for the
entire application lifetime, so the scoped service it captured is never disposed and
replaced. This leads to stale data and potential concurrency bugs. ASP.NET Core's
`ValidateScopes` option (enabled by default in Development) throws an exception when this
is detected.

</details>
