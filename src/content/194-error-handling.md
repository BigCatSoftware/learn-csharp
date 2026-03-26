# Error Handling in ASP.NET Core

*Chapter 12.15 — ASP.NET Core MVC & Razor Pages*

---

## Overview

Every application encounters errors. The question is whether those errors are handled
gracefully or whether they leak stack traces to users, crash background processes, or
silently corrupt data. ASP.NET Core provides multiple layers of error handling — from
middleware-level exception catching to structured error response formats.

This lesson covers the full error-handling toolkit: the `UseExceptionHandler` middleware,
developer exception pages, ProblemDetails (RFC 7807/9457), global exception middleware,
exception filters vs middleware, status code pages, logging integration, and the circuit
breaker pattern for downstream service resilience.

The goal is a consistent, debuggable, production-safe error strategy.

---

## Core Concepts

### Error Handling Layers

ASP.NET Core handles errors at multiple levels, from outermost to innermost:

```
Middleware Pipeline (outermost)
  -> UseExceptionHandler / UseStatusCodePages
    -> MVC Filter Pipeline
      -> Exception Filters (IExceptionFilter)
        -> Action Method (try/catch)
```

Each layer catches what slips through the layer below it.

### UseExceptionHandler Middleware

The primary production error handler. It catches exceptions from all downstream
middleware and re-executes the pipeline to an error-handling path:

```csharp
app.UseExceptionHandler("/Error");
```

When an exception occurs:
1. The response is cleared.
2. The pipeline re-executes with the request path set to `/Error`.
3. The original exception is available via `IExceptionHandlerFeature`.

### Developer Exception Page

For development only — shows detailed exception information including stack trace,
query strings, cookies, and headers:

```csharp
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
```

**Never** enable this in production. It leaks implementation details.

### ProblemDetails (RFC 7807 / RFC 9457)

A standardized JSON format for API error responses:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "detail": "Project with ID 999 does not exist.",
  "instance": "/api/projects/999",
  "traceId": "00-abc123-def456-01"
}
```

### Exception Filters vs Middleware

| Feature                    | Exception Filter              | Middleware                     |
|----------------------------|-------------------------------|--------------------------------|
| MVC-aware                  | Yes (knows action, model)     | No (raw HttpContext)           |
| Catches exceptions from    | Action methods, action filters| Entire pipeline                |
| Catches result execution errors | No                       | Yes                            |
| Can short-circuit to specific result | Yes (set context.Result) | Yes (write response directly) |
| Scope                      | Global, controller, or action | All requests                   |

**Rule of thumb:** Use middleware for API-wide error handling. Use exception filters when
you need MVC context (e.g., returning different error views per controller).

---

## Code Examples

### Standard Production Error Handling Setup

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
builder.Services.AddProblemDetails(); // .NET 7+

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseStatusCodePagesWithReExecute("/Home/StatusCode", "?code={0}");
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
```

### Error Controller for MVC Apps

```csharp
public class HomeController : Controller
{
    [Route("/Home/Error")]
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        var feature = HttpContext.Features.Get<IExceptionHandlerPathFeature>();
        return View(new ErrorViewModel
        {
            RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier,
            ExceptionMessage = feature?.Error.Message,
            Path = feature?.Path
        });
    }
}
```

### Global Exception Middleware for APIs

```csharp
public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(
        RequestDelegate next,
        ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Unhandled exception processing {Method} {Path}",
                context.Request.Method,
                context.Request.Path);

            await HandleExceptionAsync(context, ex);
        }
    }

    private static async Task HandleExceptionAsync(HttpContext context, Exception ex)
    {
        context.Response.ContentType = "application/problem+json";

        var (statusCode, title) = ex switch
        {
            ArgumentException => (StatusCodes.Status400BadRequest, "Bad Request"),
            KeyNotFoundException => (StatusCodes.Status404NotFound, "Not Found"),
            UnauthorizedAccessException => (StatusCodes.Status403Forbidden, "Forbidden"),
            OperationCanceledException => (StatusCodes.Status499ClientClosedRequest,
                                           "Client Closed Request"),
            _ => (StatusCodes.Status500InternalServerError, "Internal Server Error")
        };

        context.Response.StatusCode = statusCode;

        var problemDetails = new ProblemDetails
        {
            Type = $"https://httpstatuses.com/{statusCode}",
            Title = title,
            Status = statusCode,
            Detail = statusCode < 500 ? ex.Message : "An unexpected error occurred.",
            Instance = context.Request.Path,
            Extensions =
            {
                ["traceId"] = context.TraceIdentifier
            }
        };

        await context.Response.WriteAsJsonAsync(problemDetails);
    }
}

// Registration (early in the pipeline)
app.UseMiddleware<GlobalExceptionMiddleware>();
```

### Exception Filter for Specific Exception Types

```csharp
public class DomainExceptionFilter : IExceptionFilter
{
    private readonly ILogger<DomainExceptionFilter> _logger;

    public DomainExceptionFilter(ILogger<DomainExceptionFilter> logger)
    {
        _logger = logger;
    }

    public void OnException(ExceptionContext context)
    {
        if (context.Exception is DomainException domainEx)
        {
            _logger.LogWarning(domainEx,
                "Domain exception in {Action}: {Message}",
                context.ActionDescriptor.DisplayName,
                domainEx.Message);

            context.Result = new ObjectResult(new ProblemDetails
            {
                Title = "Business Rule Violation",
                Detail = domainEx.Message,
                Status = StatusCodes.Status422UnprocessableEntity,
                Type = "https://bnbuilders.com/errors/domain-rule"
            })
            {
                StatusCode = StatusCodes.Status422UnprocessableEntity
            };

            context.ExceptionHandled = true;
        }
    }
}

// Custom domain exception
public class DomainException(string message, string errorCode = "DOMAIN_ERROR")
    : Exception(message)
{
    public string ErrorCode { get; } = errorCode;
}
```

### Status Code Pages

```csharp
// Re-execute the pipeline with a different path for non-exception status codes
app.UseStatusCodePagesWithReExecute("/errors/{0}");
```

### Circuit Breaker for Downstream Services

```csharp
// Using Polly via Microsoft.Extensions.Http.Resilience
builder.Services.AddHttpClient("ErpApi", client =>
{
    client.BaseAddress = new Uri("https://erp.bnbuilders.com/api");
    client.Timeout = TimeSpan.FromSeconds(30);
})
.AddStandardResilienceHandler(); // Includes retry, circuit breaker, timeout

// Or configure explicitly:
builder.Services.AddHttpClient("ErpApi")
    .AddResilienceHandler("erp-pipeline", builder =>
    {
        builder.AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            Delay = TimeSpan.FromSeconds(1),
            BackoffType = DelayBackoffType.Exponential
        });
        builder.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            MinimumThroughput = 10,
            BreakDuration = TimeSpan.FromSeconds(15)
        });
        builder.AddTimeout(TimeSpan.FromSeconds(45));
    });
```

### Logging Exceptions Effectively

```csharp
// DO: Pass the exception as the first parameter (preserves stack trace)
_logger.LogError(ex, "Failed to sync project {ProjectId}", projectId);

// DON'T: Log just the message string (loses stack trace and inner exceptions)
_logger.LogError("Failed: {Error}", ex.Message);
```

---

## Common Patterns

1. **Layered error handling** — Middleware catches everything. Exception filters catch
   domain-specific exceptions and return appropriate responses. Action methods handle
   expected business cases with normal control flow.

2. **Domain exceptions** — Define custom exception types for business rule violations
   (`InsufficientBudgetException`, `DuplicatePurchaseOrderException`). Map them to
   appropriate HTTP status codes (422, 409) in filters or middleware.

3. **Never throw for expected conditions.** If "project not found" is a normal case,
   return null from the service and handle it with a 404 response. Reserve exceptions
   for unexpected failures.

4. **Result pattern** — Use `Result<T>` with success/failure instead of exceptions for
   business operations where failure is expected.

5. **Health checks** — Expose `/health` endpoints that check downstream service
   availability, so load balancers can route around unhealthy instances.

---

## Gotchas and Pitfalls

- **Exposing stack traces in production.** The developer exception page and detailed
  error messages leak implementation details. Always use environment checks to switch
  between detailed (dev) and generic (prod) error responses.

- **Exception filters do not catch everything.** They miss exceptions thrown during
  result execution (serialization), middleware exceptions, and exceptions in Razor view
  rendering. Middleware catches all of these.

- **Swallowing exceptions silently.** An empty `catch {}` block hides bugs. Always log,
  even if you handle the error gracefully.

- **Not setting `ExceptionHandled = true`** in exception filters. Without this, the
  exception propagates to the next handler (middleware). If you set `context.Result` but
  forget `ExceptionHandled`, the middleware may overwrite your response.

- **`UseStatusCodePages` not working for APIs.** It only triggers when the response body
  is empty. If your action writes a body before returning 404, it will not activate.

- **Circuit breaker state is per-client instance.** Use `IHttpClientFactory` so all
  requests to the same downstream share circuit state.

- **OperationCanceledException on client disconnect.** Not a bug — do not log it as
  `Error`. Log at `Information` or `Debug`.

---

## Performance Considerations

- **Exceptions are expensive.** Throwing and catching exceptions involves stack unwinding
  and is significantly slower than normal control flow. Do not use exceptions for
  validation or expected business conditions. Use the Result pattern or return null.

- **Exception middleware should be first.** Place `UseExceptionHandler()` early in the
  pipeline so it catches exceptions from all downstream middleware.

- **ProblemDetails serialization** is lightweight. The `AddProblemDetails()` service uses
  `System.Text.Json` and adds negligible overhead.

- **Circuit breakers protect against cascade failures.** When the ERP API is down,
  the circuit breaker fails fast instead of waiting for timeouts on every request. This
  preserves thread pool threads and keeps the rest of the app responsive.

- **Retry with exponential backoff** prevents thundering herd problems. When a downstream
  service recovers, gradual retry prevents immediately overwhelming it again.

- **Health checks with caching** — Do not hit the database on every health check request.
  Cache the result for 10-30 seconds.

---

## BNBuilders Context

- **ERP integration resilience** — The Sage or Viewpoint API goes down during month-end
  close? The circuit breaker prevents your job cost dashboard from hanging. Users see a
  "Cost data temporarily unavailable" message instead of a timeout error.

- **Domain exceptions for construction business rules:**
  - `BudgetExceededException` — cost line exceeds approved budget.
  - `DuplicatePurchaseOrderException` — PO number already exists.
  - `ProjectLockedException` — project is closed for the billing period.
  These map to 422 (Unprocessable Entity) or 409 (Conflict) responses.

- **Field app error handling** — Mobile apps on job sites have unreliable connectivity.
  Return meaningful error codes so the app can retry intelligently. Include the `traceId`
  in error responses so field support can reference specific failures.

- **Status code pages for the intranet** — When a PM hits a page they are not authorized
  for, a friendly 403 page saying "Contact IT to request access" is more helpful than
  a generic error.

- **Logging integration** — Every unhandled exception should include the user's identity,
  the request path, and a correlation ID. When accounting reports "the cost report broke,"
  you need to find that specific request in the logs quickly.

- **Health checks for dashboards** — The CFO's job cost dashboard should show a clear
  status indicator when the ERP connection is degraded, not a cryptic error page.

---

## Interview / Senior Dev Questions

1. **When should you use exception filters vs exception-handling middleware?**
   Use middleware for application-wide error handling — it catches exceptions from
   everywhere in the pipeline. Use exception filters when you need MVC-specific context
   (action descriptor, model state) or when different controllers need different error
   handling strategies.

2. **What is ProblemDetails and why should you use it?**
   ProblemDetails (RFC 7807/9457) is a standardized JSON format for HTTP API errors. It
   provides consistent structure (`type`, `title`, `status`, `detail`, `instance`) that
   clients can parse programmatically. Without it, every API invents its own error format,
   making client error handling fragile.

3. **How would you implement a circuit breaker for an external API dependency?**
   Use `IHttpClientFactory` with Polly resilience handlers
   (`Microsoft.Extensions.Http.Resilience`). Configure a circuit breaker with failure
   thresholds and break duration. When open, calls fail immediately with a known error
   instead of waiting for timeouts.

4. **An `OperationCanceledException` keeps appearing in your error logs. Is it a bug?**
   Usually no. ASP.NET Core cancels the request's `CancellationToken` when the client
   disconnects. Log it at `Information`, not `Error`. Filter it in your exception
   middleware to avoid alert noise.

---

## Quiz

**Question 1:** What is the difference between `UseExceptionHandler` and
`UseDeveloperExceptionPage`?

<details>
<summary>Answer</summary>

- **`UseDeveloperExceptionPage`** shows detailed exception information (stack trace,
  source code, request details) in the browser. It is for **development only** and
  should never be enabled in production.

- **`UseExceptionHandler`** catches exceptions and re-executes the pipeline to an error
  handling path (e.g., `/Error`). It produces a **user-friendly** error page or
  ProblemDetails response suitable for production.

Typical pattern:
```csharp
if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();
else
    app.UseExceptionHandler("/Error");
```
</details>

---

**Question 2:** You have a global exception middleware that returns ProblemDetails for
all exceptions. You also have an `IExceptionFilter` that handles `DomainException`.
In what order do they execute, and what happens when a `DomainException` is thrown?

<details>
<summary>Answer</summary>

The **exception filter** runs first (inside the MVC pipeline). If it sets
`context.ExceptionHandled = true` and sets `context.Result`, the exception is handled
within MVC and the middleware never sees it.

If the filter does NOT handle the exception (or no filter matches), the exception
propagates out to the **middleware**, which catches it and returns a ProblemDetails
response.

Order: Action -> Exception Filter -> (if unhandled) -> Exception Middleware
</details>

---

**Question 3:** What HTTP status code should you use for a business rule violation like
"Budget exceeded"?

<details>
<summary>Answer</summary>

**422 Unprocessable Entity** is the most appropriate. The request was syntactically valid
(not a 400), the resource exists (not a 404), but the server cannot process it due to
a business rule.

Alternatively, **409 Conflict** is appropriate when the violation is due to a state
conflict (e.g., "Purchase order already exists").

Do **not** use 500 — that implies an unexpected server error, not a known business
constraint.
</details>

---

**Question 4:** What is the circuit breaker pattern and why is it important for
downstream service calls?

<details>
<summary>Answer</summary>

A circuit breaker monitors failures to a downstream service. When failures exceed a
threshold, the circuit **opens** and all subsequent calls fail immediately without
attempting the request. After a cooldown period, the circuit enters **half-open** state
and allows a test request through. If it succeeds, the circuit closes; if it fails, the
circuit opens again.

This is important because:
1. **Prevents cascade failures** — a failing downstream service does not bring down your
   app by exhausting thread pool threads with pending timeouts.
2. **Allows recovery** — the downstream service gets breathing room to recover instead
   of being hammered with retry storms.
3. **Fast feedback** — users get an immediate "service unavailable" error instead of
   waiting 30+ seconds for a timeout.
</details>

---

**Question 5:** Why should `OperationCanceledException` be handled differently from
other exceptions?

<details>
<summary>Answer</summary>

It typically means the **client disconnected** — not a bug. Log at `Information` level,
not `Error`. Return 499 or skip the response (the client is gone). Do not trigger alerts.
</details>
