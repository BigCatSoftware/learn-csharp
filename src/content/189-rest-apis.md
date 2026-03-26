# REST APIs with ASP.NET Core

*Chapter 12.10 — ASP.NET Core MVC & Razor Pages*

---

## Overview

ASP.NET Core offers two approaches for building HTTP APIs:

1. **Controller-based APIs** — the traditional approach using classes that inherit from
   `ControllerBase`, decorated with `[ApiController]`. Rich feature set, familiar MVC
   patterns, extensive filter pipeline.

2. **Minimal APIs** — introduced in .NET 6, these use lambda-based endpoint definitions
   with no controllers. Less ceremony, faster startup, ideal for microservices and small
   APIs.

Both approaches share the same underlying infrastructure: routing, model binding,
dependency injection, authentication, and the middleware pipeline. The choice between
them is about code organization, not capability.

This lesson covers both approaches, plus the essential supporting ecosystem: OpenAPI
documentation, API versioning, content negotiation, `ProblemDetails` for errors, and
`TypedResults` for compile-time safety in minimal APIs.

---

## Core Concepts

### [ApiController] Attribute

When applied to a controller, `[ApiController]` enables several conventions:

- **Automatic 400 responses** when `ModelState` is invalid (no manual check needed).
- **Binding source inference** — complex types bind from the request body by default;
  `[FromRoute]`, `[FromQuery]` are inferred for simple types.
- **ProblemDetails responses** for error status codes.
- Requires **attribute routing** (not conventional routing).

### Minimal APIs

Minimal APIs define endpoints directly on `WebApplication`:

```csharp
var app = builder.Build();

app.MapGet("/api/projects/{id}", (int id, IProjectService svc) =>
    svc.GetById(id) is Project p
        ? Results.Ok(p)
        : Results.NotFound());
```

Key features in .NET 8+:
- **Route groups** via `MapGroup()`.
- **TypedResults** for compile-time return type checking.
- **Endpoint filters** (the minimal API equivalent of action filters).
- **Automatic OpenAPI metadata** generation.

### Content Negotiation

ASP.NET Core can return different formats based on the `Accept` header. JSON
(`System.Text.Json`) is the default. XML support is opt-in:

```csharp
builder.Services.AddControllers()
    .AddXmlSerializerFormatters();
```

### API Versioning

The `Asp.Versioning.Http` and `Asp.Versioning.Mvc` packages support multiple strategies:

| Strategy       | Example                                   |
|----------------|-------------------------------------------|
| URL segment    | `/api/v2/projects`                        |
| Query string   | `/api/projects?api-version=2.0`           |
| Header         | `X-Api-Version: 2.0`                      |
| Media type     | `Accept: application/json;v=2.0`          |

### ProblemDetails (RFC 9457)

A standardized JSON format for HTTP API error responses:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "detail": "Project with ID 42 was not found.",
  "instance": "/api/projects/42"
}
```

### TypedResults (Minimal APIs)

`TypedResults` provides static factory methods that return concrete types instead of
`IResult`, enabling compile-time checking of response types and automatic OpenAPI
metadata:

```csharp
app.MapGet("/api/projects/{id}", Results<Ok<Project>, NotFound> (int id) =>
    db.Find(id) is Project p
        ? TypedResults.Ok(p)
        : TypedResults.NotFound());
```

---

## Code Examples

### Controller-Based API

```csharp
[ApiController]
[Route("api/[controller]")]
public class ProjectsController : ControllerBase
{
    private readonly IProjectRepository _repo;
    private readonly ILogger<ProjectsController> _logger;

    public ProjectsController(IProjectRepository repo,
                               ILogger<ProjectsController> logger)
    {
        _repo = repo;
        _logger = logger;
    }

    /// <summary>
    /// Returns all projects, optionally filtered by status.
    /// </summary>
    [HttpGet]
    [ProducesResponseType<IEnumerable<ProjectDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll([FromQuery] string? status = null)
    {
        var projects = await _repo.GetAllAsync(status);
        return Ok(projects.Select(p => p.ToDto()));
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType<ProjectDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id)
    {
        var project = await _repo.GetByIdAsync(id);
        if (project is null)
            return NotFound(new ProblemDetails
            {
                Title = "Project not found",
                Detail = $"No project with ID {id} exists.",
                Status = 404
            });

        return Ok(project.ToDto());
    }

    [HttpPost]
    [ProducesResponseType<ProjectDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateProjectRequest request)
    {
        // ModelState validation is automatic with [ApiController]
        var project = await _repo.CreateAsync(request);
        return CreatedAtAction(nameof(GetById),
            new { id = project.Id },
            project.ToDto());
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateProjectRequest request)
    {
        var existed = await _repo.UpdateAsync(id, request);
        return existed ? NoContent() : NotFound();
    }

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(int id)
    {
        await _repo.DeleteAsync(id);
        return NoContent();
    }
}
```

### Minimal API with Route Groups and TypedResults

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddScoped<IProjectRepository, SqlProjectRepository>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

var api = app.MapGroup("/api/projects")
    .WithTags("Projects")
    .RequireAuthorization();

api.MapGet("/", async (IProjectRepository repo, [AsParameters] ProjectFilter filter) =>
    TypedResults.Ok(await repo.GetAllAsync(filter)));

api.MapGet("/{id:int}", async Task<Results<Ok<ProjectDto>, NotFound>> (
    int id, IProjectRepository repo) =>
    await repo.GetByIdAsync(id) is Project p
        ? TypedResults.Ok(p.ToDto())
        : TypedResults.NotFound());

api.MapPost("/", async (CreateProjectRequest req, IProjectRepository repo) =>
{
    var project = await repo.CreateAsync(req);
    return TypedResults.Created($"/api/projects/{project.Id}", project.ToDto());
});

app.Run();
```

### OpenAPI / Swagger Configuration

```csharp
// Program.cs — Swashbuckle
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "BNBuilders Project API",
        Version = "v1",
        Description = "Internal API for project management and job costing."
    });

    // Include XML comments from the assembly
    var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    options.IncludeXmlComments(xmlPath);

    // JWT bearer auth in Swagger UI
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "Enter 'Bearer {token}'",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer"
    });
});
```

### API Versioning Setup

```csharp
// NuGet: Asp.Versioning.Mvc
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
    options.ApiVersionReader = ApiVersionReader.Combine(
        new UrlSegmentApiVersionReader(),
        new HeaderApiVersionReader("X-Api-Version"));
})
.AddMvc()
.AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});

// Then use [ApiVersion("1.0")] / [ApiVersion("2.0")] on controllers
// with route template: "api/v{version:apiVersion}/[controller]"
```

### ProblemDetails Service (.NET 7+)

```csharp
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Extensions["traceId"] =
            ctx.HttpContext.TraceIdentifier;
        ctx.ProblemDetails.Extensions["environment"] =
            ctx.HttpContext.RequestServices
                .GetRequiredService<IWebHostEnvironment>().EnvironmentName;
    };
});

// In the pipeline:
app.UseExceptionHandler();
app.UseStatusCodePages();
```

---

## Common Patterns

1. **DTO Mapping** — Never expose your EF Core entities directly. Map to DTOs to control
   serialization, avoid circular references, and decouple your API contract from your
   database schema.

2. **CreatedAtAction / CreatedAtRoute** — After a POST, return 201 with a `Location`
   header pointing to the newly created resource. This is idiomatic REST.

3. **Pagination** — Return paged results with metadata:

```csharp
public record PagedResult<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Page,
    int PageSize);
```

4. **Endpoint Filters in Minimal APIs** — The equivalent of action filters:

```csharp
api.MapPost("/", handler)
   .AddEndpointFilter(async (context, next) =>
   {
       var request = context.GetArgument<CreateProjectRequest>(0);
       // custom validation
       return await next(context);
   });
```

5. **Use `Results<T1, T2, ...>` union types** in minimal APIs so OpenAPI knows all
   possible response types at compile time.

---

## Gotchas and Pitfalls

- **Forgetting `[ApiController]`** means you lose automatic model validation, binding
  source inference, and ProblemDetails. Your endpoints will silently accept invalid input.

- **Circular references in JSON serialization.** If your EF entities have navigation
  properties, `System.Text.Json` will throw by default. Use DTOs or configure
  `ReferenceHandler.IgnoreCycles`.

- **Minimal API parameter binding** can be surprising. A complex type in the parameter
  list is bound from the body by default. If you want it from the query string, you need
  `[AsParameters]` or `[FromQuery]`.

- **Swagger not showing endpoints.** You need both `AddEndpointsApiExplorer()` and
  `AddSwaggerGen()`. For minimal APIs, endpoints must have `.WithOpenApi()` or be
  discoverable by the explorer.

- **API versioning with minimal APIs** requires `Asp.Versioning.Http` (not the MVC
  package). The configuration is slightly different.

- **Large file uploads** with `[ApiController]` may hit the default 30MB request size
  limit. Configure `KestrelServerOptions.Limits.MaxRequestBodySize` or use
  `[RequestSizeLimit]`.

---

## Performance Considerations

- **Minimal APIs have less overhead** than controller-based APIs because they skip the
  MVC filter pipeline. For high-throughput microservices, this matters.

- **Use `System.Text.Json` source generators** for AOT-friendly, allocation-free
  serialization:

```csharp
[JsonSerializable(typeof(ProjectDto))]
[JsonSerializable(typeof(List<ProjectDto>))]
internal partial class AppJsonContext : JsonSerializerContext { }

// In Program.cs:
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Add(AppJsonContext.Default));
```

- **Response compression** with `app.UseResponseCompression()` reduces payload size for
  large JSON responses (e.g., full project cost exports).

- **Output caching** (`app.UseOutputCache()`) can cache entire API responses for
  read-heavy endpoints like reference data lookups.

- Avoid returning `IEnumerable<T>` from actions — it defers execution and can hold
  database connections open during serialization. Materialize with `ToListAsync()`.

---

## BNBuilders Context

- **Job Cost API** — A controller-based API serving the job cost dashboard. Versioning
  lets you ship v2 with new cost-code grouping without breaking the Excel add-in that
  still calls v1.

- **Field Data Collection** — Minimal APIs are great for the lightweight endpoints that
  mobile field apps hit from job sites (daily logs, photo uploads, safety checklists).
  Lower overhead means better response times over spotty cellular connections.

- **Swagger for internal documentation** — PMs and estimators who consume your APIs can
  use Swagger UI to explore endpoints without reading code. Include XML doc comments so
  the documentation is always current.

- **ProblemDetails everywhere** — Standardize error responses across all BNBuilders APIs.
  When the accounting system integration fails, return a ProblemDetails with a meaningful
  `detail` field so the support team can diagnose without reading logs.

- **Windows Auth + API keys** — Intranet APIs use Windows Authentication. APIs exposed
  to subcontractor portals or external integrations use API keys or JWT tokens. API
  versioning headers let you evolve the subcontractor API without breaking their builds.

- **ERP integration** — APIs that pull data from Sage, Viewpoint, or Procore often need
  pagination and caching. Use output caching for reference data (cost codes, phases) that
  changes infrequently.

---

## Interview / Senior Dev Questions

1. **When would you choose minimal APIs over controllers?**
   Minimal APIs are best for small, focused microservices or simple CRUD APIs where you
   do not need the full MVC filter pipeline. Controllers are better for large APIs with
   complex cross-cutting concerns, where filters and the structured controller pattern
   aid maintainability.

2. **What does `[ApiController]` actually do? Can you get the same behavior without it?**
   It enables automatic 400 responses for invalid model state, binding source inference,
   and ProblemDetails error responses. You can replicate these manually with action filters
   and explicit `[FromBody]`/`[FromQuery]` attributes, but the attribute is a convenient
   convention pack.

3. **How would you handle breaking changes in a REST API consumed by external partners?**
   Use API versioning (URL segment or header). Maintain the old version while developing
   the new one. Communicate a deprecation timeline. Use the `Sunset` header to signal
   upcoming retirement.

4. **Explain content negotiation. What happens when a client sends
   `Accept: application/xml` but your API only supports JSON?**
   By default, ASP.NET Core returns JSON regardless. If you want to return 406 Not
   Acceptable, set `MvcOptions.ReturnHttpNotAcceptable = true`. Otherwise, add
   `.AddXmlSerializerFormatters()` to support XML.

---

## Quiz

**Question 1:** What is the primary difference between `Results.Ok()` and
`TypedResults.Ok()` in minimal APIs?

<details>
<summary>Answer</summary>

`Results.Ok()` returns `IResult`, which is opaque at compile time. `TypedResults.Ok()`
returns a concrete type (`Ok<T>`), enabling compile-time return type checking and
automatic OpenAPI metadata generation. When you use `Results<Ok<T>, NotFound>` as the
return type with `TypedResults`, the framework can document all possible response types
in the OpenAPI spec automatically.
</details>

---

**Question 2:** You have a controller-based API. A client POSTs invalid JSON. You notice
the action method never executes but the client receives a 400 with validation errors.
What mechanism causes this?

<details>
<summary>Answer</summary>

The `[ApiController]` attribute enables **automatic model validation**. When model binding
fails or `ModelState` is invalid, the framework short-circuits the request and returns a
`400 Bad Request` with a `ValidationProblemDetails` response body before the action method
is ever called.
</details>

---

**Question 3:** You want to support both `/api/v1/projects` and `/api/v2/projects` in
the same ASP.NET Core application. What NuGet package and configuration do you need?

<details>
<summary>Answer</summary>

Install `Asp.Versioning.Mvc` (for controllers) or `Asp.Versioning.Http` (for minimal
APIs). Configure with:

```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ApiVersionReader = new UrlSegmentApiVersionReader();
})
.AddMvc()
.AddApiExplorer(o => o.SubstituteApiVersionInUrl = true);
```

Then use `[ApiVersion("1.0")]` / `[ApiVersion("2.0")]` on controllers with a route
template containing `{version:apiVersion}`.
</details>

---

**Question 4:** Why should you avoid returning EF Core entities directly from API
endpoints?

<details>
<summary>Answer</summary>

1. **Circular references** — Navigation properties cause serialization failures or
   infinite loops.
2. **Over-posting** — Clients could send extra properties that map to sensitive columns.
3. **Tight coupling** — Your API contract becomes tied to your database schema; any
   schema change breaks clients.
4. **Information leakage** — Internal fields (soft-delete flags, audit columns) get
   exposed.

Use DTOs (Data Transfer Objects) to control exactly what is serialized and accepted.
</details>
