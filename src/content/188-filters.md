# Filters in ASP.NET Core

*Chapter 12.9 — ASP.NET Core MVC & Razor Pages*

---

## Overview

Filters in ASP.NET Core are components that run code **before or after** specific stages
of the request-processing pipeline within MVC and Razor Pages. They let you extract
cross-cutting concerns — authorization checks, logging, caching, exception handling,
input validation — out of individual action methods and into reusable, composable units.

Think of filters as **middleware that knows about MVC**. While middleware operates on raw
`HttpContext`, filters have access to MVC-specific constructs like `ActionExecutingContext`,
model binding results, and action descriptors. This makes them the right tool when your
logic depends on controllers, actions, or model state.

ASP.NET Core defines **five filter types**, each corresponding to a stage in the MVC
pipeline:

| Filter Type       | Interface(s)                              | Runs...                              |
|-------------------|-------------------------------------------|--------------------------------------|
| Authorization     | `IAuthorizationFilter`                    | First — before model binding         |
| Resource          | `IResourceFilter`, `IAsyncResourceFilter` | After authorization, before binding  |
| Action            | `IActionFilter`, `IAsyncActionFilter`     | Immediately before/after the action  |
| Exception         | `IExceptionFilter`                        | When an unhandled exception occurs   |
| Result            | `IResultFilter`, `IAsyncResultFilter`     | Before/after action result execution |

---

## Core Concepts

### Filter Pipeline Order of Execution

The execution order follows a well-defined **onion model**:

```
Request
  -> Authorization Filters
    -> Resource Filters (OnResourceExecuting)
      -> Model Binding
        -> Action Filters (OnActionExecuting)
          -> ACTION METHOD
        -> Action Filters (OnActionExecuted)
      -> Result Filters (OnResultExecuting)
        -> IActionResult Execution
      -> Result Filters (OnResultExecuted)
    -> Resource Filters (OnResourceExecuted)
Response
```

Exception filters fire when an unhandled exception propagates out of the action or
action filters.

### Scope: Global vs Controller vs Action

Filters can be registered at three scopes:

1. **Global** — applies to every action in the app.
2. **Controller** — applies to every action in one controller.
3. **Action** — applies to a single action method.

Within the same filter type, execution order is: **Global -> Controller -> Action** on the
way in, and **Action -> Controller -> Global** on the way out.

### Filter Interfaces

**Synchronous:**

```csharp
public interface IActionFilter
{
    void OnActionExecuting(ActionExecutingContext context);
    void OnActionExecuted(ActionExecutedContext context);
}
```

**Asynchronous:**

```csharp
public interface IAsyncActionFilter
{
    Task OnActionExecutionAsync(ActionExecutingContext context,
                                ActionExecutionDelegate next);
}
```

Implement **one or the other** — not both. If both are implemented, only the async
version runs.

### ServiceFilterAttribute vs TypeFilterAttribute

Both allow you to apply filters that require DI-injected dependencies.

- **`[ServiceFilter(typeof(MyFilter))]`** — Resolves the filter from the DI container.
  You must register `MyFilter` as a service.
- **`[TypeFilter(typeof(MyFilter))]`** — Creates the filter via `ObjectFactory`, resolving
  constructor dependencies from DI automatically. No explicit registration needed.

---

## Code Examples

### A Simple Action Filter (Logging Execution Time)

```csharp
public class ExecutionTimingFilter : IAsyncActionFilter
{
    private readonly ILogger<ExecutionTimingFilter> _logger;

    public ExecutionTimingFilter(ILogger<ExecutionTimingFilter> logger)
    {
        _logger = logger;
    }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        var stopwatch = Stopwatch.StartNew();
        var actionName = context.ActionDescriptor.DisplayName;

        _logger.LogInformation("Executing action {Action}", actionName);

        var resultContext = await next(); // runs the action

        stopwatch.Stop();
        _logger.LogInformation(
            "Action {Action} completed in {ElapsedMs}ms. Exception: {HasException}",
            actionName,
            stopwatch.ElapsedMilliseconds,
            resultContext.Exception != null);
    }
}
```

### Registering a Global Filter

```csharp
// Program.cs
builder.Services.AddControllersWithViews(options =>
{
    // Global scope — every action runs through this filter
    options.Filters.Add<ExecutionTimingFilter>();
});

// Required for ServiceFilter usage:
builder.Services.AddScoped<ExecutionTimingFilter>();
```

### An Exception Filter

```csharp
public class GlobalExceptionFilter : IExceptionFilter
{
    private readonly ILogger<GlobalExceptionFilter> _logger;

    public GlobalExceptionFilter(ILogger<GlobalExceptionFilter> logger)
    {
        _logger = logger;
    }

    public void OnException(ExceptionContext context)
    {
        _logger.LogError(context.Exception, "Unhandled exception in {Action}",
            context.ActionDescriptor.DisplayName);

        context.Result = new ObjectResult(new ProblemDetails
        {
            Title = "An unexpected error occurred",
            Status = StatusCodes.Status500InternalServerError
        })
        {
            StatusCode = StatusCodes.Status500InternalServerError
        };

        context.ExceptionHandled = true;
    }
}
```

### A Resource Filter for Response Caching

```csharp
public class CacheResourceFilter : IAsyncResourceFilter
{
    private readonly IMemoryCache _cache;

    public CacheResourceFilter(IMemoryCache cache)
    {
        _cache = cache;
    }

    public async Task OnResourceExecutionAsync(
        ResourceExecutingContext context,
        ResourceExecutionDelegate next)
    {
        var cacheKey = context.HttpContext.Request.Path.ToString();

        if (_cache.TryGetValue(cacheKey, out IActionResult? cached))
        {
            context.Result = cached!;   // short-circuits the pipeline
            return;
        }

        var executedContext = await next();

        if (executedContext.Result is ObjectResult result)
        {
            _cache.Set(cacheKey, result, TimeSpan.FromMinutes(5));
        }
    }
}
```

### Authorization Filter

```csharp
public class ApiKeyAuthorizationFilter : IAuthorizationFilter
{
    private const string ApiKeyHeader = "X-Api-Key";
    private readonly IConfiguration _config;

    public ApiKeyAuthorizationFilter(IConfiguration config)
    {
        _config = config;
    }

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        if (!context.HttpContext.Request.Headers
                .TryGetValue(ApiKeyHeader, out var providedKey))
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        var expectedKey = _config["ApiKeys:Internal"];
        if (!string.Equals(providedKey, expectedKey, StringComparison.Ordinal))
        {
            context.Result = new ForbidResult();
        }
    }
}
```

### Applying Filters with Attributes

```csharp
[ServiceFilter(typeof(ExecutionTimingFilter))]
public class JobCostController : Controller
{
    // All actions get timing logged

    [TypeFilter(typeof(CacheResourceFilter))]
    public IActionResult Summary(int projectId)
    {
        // This specific action also gets resource caching
        return View();
    }
}
```

### Controlling Filter Order Explicitly

```csharp
// Lower Order value = runs first
[ServiceFilter(typeof(AuditFilter), Order = 1)]
[ServiceFilter(typeof(ValidationFilter), Order = 2)]
public IActionResult SubmitTimecard(TimecardDto dto) { ... }
```

---

## Common Patterns

1. **Validation Filter** — Check `ModelState.IsValid` in an action filter so you never
   repeat that boilerplate in every action.

```csharp
public class ValidateModelFilter : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
        if (!context.ModelState.IsValid)
        {
            context.Result = new BadRequestObjectResult(
                new ValidationProblemDetails(context.ModelState));
        }
    }

    public void OnActionExecuted(ActionExecutedContext context) { }
}
```

2. **Transaction Filter** — Wrap the action in a database transaction; commit on success,
   rollback on exception.

3. **Audit Trail Filter** — Log who called which action with what parameters. Ideal for
   construction apps where regulatory compliance matters.

4. **Feature Flag Filter** — Return 404 or redirect when a feature is toggled off,
   without modifying action code.

---

## Gotchas and Pitfalls

- **Implementing both sync and async interfaces.** If you implement `IActionFilter` *and*
  `IAsyncActionFilter`, only the async one runs. Pick one.

- **Short-circuiting incorrectly.** Setting `context.Result` in `OnActionExecuting`
  prevents the action from running, but `OnActionExecuted` on the *same* filter does NOT
  run. Filters at a broader scope still get their `Executed` callback.

- **ServiceFilter requires registration.** Forgetting to register the filter in DI gives
  you a runtime `InvalidOperationException`. `TypeFilter` avoids this.

- **Filter order surprises.** Without explicit `Order`, filters of the same type at the
  same scope run in the order they are listed — but this is fragile across refactors.
  Always set `Order` when sequence matters.

- **Captive dependency in global filters.** A global filter added via
  `options.Filters.Add(new MyFilter(...))` is a singleton instance. If it holds a scoped
  service (like `DbContext`), you get a captive dependency. Use `Add<T>()` instead so the
  framework resolves per-request.

- **Exception filters do not catch exceptions in result execution.** If your `IActionResult`
  throws during serialization, exception filters will not see it. Use middleware for that.

---

## Performance Considerations

- **Resource filters for caching** short-circuit the entire model binding and action
  execution pipeline, saving significant CPU on read-heavy endpoints.

- **Avoid allocations in hot-path filters.** A global filter runs on every single request.
  Use `LoggerMessage.Define` instead of string interpolation for logging.

- **Prefer async filters** when you need I/O (database, HTTP calls) — synchronous I/O
  blocks the thread pool thread.

- **Filter instances from DI** respect lifetimes. A scoped filter is created once per
  request, which is usually correct. Singleton filters must be thread-safe.

- If a filter only applies to a few actions, do not register it globally — the framework
  still invokes the filter pipeline for every request even if the filter is a no-op.

---

## BNBuilders Context

At BNBuilders, filters are especially useful for internal tools and dashboards:

- **Audit filters** on the job cost dashboard endpoints can automatically log which PM
  or superintendent viewed or edited cost data, providing a compliance trail.

- **Authorization filters** can enforce project-level access control: "User X can only
  see projects assigned to their division." This is cleaner than sprinkling checks in
  every action.

- **Validation filters** eliminate boilerplate across the many form-heavy endpoints in
  field data collection apps (daily reports, RFIs, change orders).

- **Exception filters** can catch data-integrity exceptions from SQL Server and return
  user-friendly messages — e.g., translating a unique-constraint violation on a PO number
  into "This Purchase Order already exists."

- **Performance timing filters** help identify slow endpoints in internal reporting tools
  that query large datasets from the ERP system. When the CFO complains the cost report
  is slow, you have data ready.

- Since BNBuilders is a Microsoft shop with Windows Authentication on the intranet,
  an authorization filter can validate that the Windows identity belongs to the correct
  AD group before granting access to sensitive financial dashboards.

---

## Interview / Senior Dev Questions

1. **Explain the difference between middleware and filters. When would you choose one
   over the other?**
   Middleware operates on raw `HttpContext` and runs for all requests. Filters are
   MVC-aware and can inspect action arguments, model state, and action descriptors.
   Use middleware for concerns that apply to all requests (CORS, static files). Use
   filters when you need MVC context (validation, action-level authorization).

2. **A singleton global filter depends on `DbContext`. What happens and how do you fix
   it?**
   `DbContext` is scoped; injecting it into a singleton causes a captive dependency —
   the same `DbContext` is reused across requests, leading to stale data and threading
   issues. Fix: register the filter as scoped and use `Add<T>()`, or inject
   `IServiceScopeFactory` and create a scope manually.

3. **You have a filter that needs to run before all other action filters. How do you
   guarantee ordering?**
   Implement `IOrderedFilter` and return a low `Order` value, or set the `Order` property
   when applying `[ServiceFilter]` or `[TypeFilter]`. Filters with lower `Order` values
   run first.

4. **How would you write a filter that wraps each action in a database transaction?**
   Implement `IAsyncActionFilter`. In `OnActionExecutionAsync`, begin a transaction before
   calling `next()`. If `resultContext.Exception` is null, commit; otherwise roll back.

---

## Quiz

**Question 1:** In what order do the five filter types execute during a request?

<details>
<summary>Answer</summary>

Authorization -> Resource -> Action -> (Exception if needed) -> Result.

On the way out, the order reverses within each type (onion model).
</details>

---

**Question 2:** You apply `[ServiceFilter(typeof(MyFilter))]` but get an
`InvalidOperationException` at runtime. What is the most likely cause?

<details>
<summary>Answer</summary>

`MyFilter` has not been registered in the DI container. `ServiceFilter` resolves the
filter from DI, so you need something like
`builder.Services.AddScoped<MyFilter>();` in `Program.cs`.

`TypeFilter` does not require explicit registration — it creates the filter via
`ObjectFactory` and resolves constructor dependencies automatically.
</details>

---

**Question 3:** You register a filter globally using
`options.Filters.Add(new MyFilter(someService))`. The filter accesses a scoped
`DbContext`. What problem will you encounter?

<details>
<summary>Answer</summary>

This creates a **captive dependency**. The filter instance is effectively a singleton
(created once at startup), but it holds a reference to a scoped `DbContext`. The
`DbContext` will not be disposed per-request, leading to stale data, memory leaks, and
potential threading exceptions.

Fix: use `options.Filters.Add<MyFilter>()` (generic form) so the framework resolves the
filter from DI per request, respecting its intended scoped lifetime.
</details>

---

**Question 4:** An action filter sets `context.Result = new BadRequestResult()` in
`OnActionExecuting`. Does `OnActionExecuted` on the same filter instance run?

<details>
<summary>Answer</summary>

**No.** When you short-circuit by setting `context.Result` in `OnActionExecuting`, the
action does not execute and `OnActionExecuted` on that same filter does **not** run.
However, filters at a broader scope (global or controller level) still get their
`OnActionExecuted` callback so they can observe the short-circuit.
</details>
