# ASP.NET Core Basics

*Building web APIs and applications*

ASP.NET Core is the cross-platform, high-performance framework for building modern web applications and APIs with C#.

## Minimal API

The simplest way to create a web API:

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => "Hello, World!");

app.MapGet("/users/{id}", (int id) => new User(id, "Alice"));

app.MapPost("/users", (User user) =>
    Results.Created($"/users/{user.Id}", user));

app.Run();
```

## Controllers

For larger applications, organize endpoints in controllers:

```csharp
[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _service;

    public ProductsController(IProductService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Product>>> GetAll()
    {
        var products = await _service.GetAllAsync();
        return Ok(products);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Product>> GetById(int id)
    {
        var product = await _service.GetByIdAsync(id);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpPost]
    public async Task<ActionResult<Product>> Create(CreateProductRequest request)
    {
        var product = await _service.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, UpdateProductRequest request)
    {
        await _service.UpdateAsync(id, request);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _service.DeleteAsync(id);
        return NoContent();
    }
}
```

## Middleware Pipeline

```csharp
var app = builder.Build();

// Middleware runs in order
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Custom middleware
app.Use(async (context, next) =>
{
    var stopwatch = Stopwatch.StartNew();
    await next(context);
    stopwatch.Stop();
    context.Response.Headers["X-Response-Time"] = $"{stopwatch.ElapsedMilliseconds}ms";
});

app.MapControllers();
app.Run();
```

> **Note:** Middleware order matters! Authentication must come before Authorization, and exception handling should be one of the first middleware components to catch errors from the entire pipeline.

## Model Binding and Validation

```csharp
public class CreateProductRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; init; } = "";

    [Range(0.01, 99999.99)]
    public decimal Price { get; init; }

    [Required]
    public string Category { get; init; } = "";
}

// Validation is automatic with [ApiController]
[HttpPost]
public ActionResult<Product> Create(CreateProductRequest request)
{
    // If validation fails, 400 is returned automatically
    // This code only runs if the model is valid
    var product = _service.Create(request);
    return Created($"/api/products/{product.Id}", product);
}
```

## Configuration

```csharp
// appsettings.json
{
    "Database": {
        "ConnectionString": "Server=localhost;Database=myapp;",
        "MaxRetries": 3
    },
    "Features": {
        "EnableNewDashboard": true
    }
}

// Strongly-typed configuration
public class DatabaseOptions
{
    public string ConnectionString { get; init; } = "";
    public int MaxRetries { get; init; } = 3;
}

// Register in DI
builder.Services.Configure<DatabaseOptions>(
    builder.Configuration.GetSection("Database"));

// Use in a service
public class DataService
{
    private readonly DatabaseOptions _options;

    public DataService(IOptions<DatabaseOptions> options)
    {
        _options = options.Value;
    }
}
```

> **Important:** Never store secrets (API keys, passwords) in `appsettings.json`. Use environment variables, Azure Key Vault, AWS Secrets Manager, or the Secret Manager tool for development.

## Common HTTP Status Codes

| Code | Method | Meaning |
|------|--------|---------|
| 200 | `Ok()` | Success |
| 201 | `Created()` | Resource created |
| 204 | `NoContent()` | Success, no body |
| 400 | `BadRequest()` | Validation failed |
| 401 | `Unauthorized()` | Not authenticated |
| 403 | `Forbid()` | Not authorized |
| 404 | `NotFound()` | Resource not found |
| 500 | `StatusCode(500)` | Server error |
