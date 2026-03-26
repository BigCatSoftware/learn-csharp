# Project 4: RESTful API with ASP.NET Core

*Difficulty: Medium — Estimated: 4-6 days — Category: Web Development*

---

## Project Overview

Build a production-quality REST API for a **task management system** using ASP.NET Core.
This is the kind of project you would build at work — a real backend with authentication,
authorization, validation, structured logging, and automated tests. The domain is simple
(users, projects, tasks, comments) so you can focus on engineering quality rather than
business logic complexity.

**Features to implement:**

| Feature | Technology |
|---|---|
| API framework | ASP.NET Core Web API, controller-based routing |
| Database | SQL Server with Entity Framework Core (Code First) |
| Authentication | JWT bearer tokens (issue + validate) |
| Authorization | Role-based (Admin, User) + resource-based (own tasks) |
| CRUD | Full create/read/update/delete for Users, Projects, Tasks, Comments |
| Query | Pagination, filtering (status, assignee, date range), sorting |
| Validation | FluentValidation with ProblemDetails error responses |
| API docs | OpenAPI/Swagger via Swashbuckle |
| Rate limiting | ASP.NET Core rate limiting middleware |
| Logging | Serilog with structured JSON logging |
| Health checks | Liveness + readiness (DB connectivity) |
| Testing | Integration tests with WebApplicationFactory + TestContainers |
| Deployment | Dockerfile with multi-stage build |

This project demonstrates that you can build a complete backend — the kind of thing a
hiring manager at a Microsoft shop wants to see. It also directly applies to building
internal tools and APIs for BNBuilders.

---

## Learning Objectives

- **ASP.NET Core pipeline**: Understand middleware ordering (auth before controllers), dependency injection lifetime scopes, and the request/response pipeline.
- **Entity Framework Core**: Code First migrations, relationships (one-to-many, many-to-many), query optimization (eager vs. lazy loading, projection).
- **JWT authentication**: Token generation, claims, validation, refresh tokens. Understand why JWTs are stateless and the tradeoffs.
- **RESTful design**: Resource naming, HTTP verbs, status codes, HATEOAS (stretch), content negotiation, idempotency.
- **Validation and error handling**: Input validation with FluentValidation, global exception handling, ProblemDetails RFC 7807.
- **Testing web APIs**: Integration tests that spin up a real server in-process, use a real database (TestContainers), and make HTTP requests.
- **Production concerns**: Rate limiting, health checks, structured logging, CORS, Docker packaging.

---

## Prerequisites

| Lesson | Why |
|---|---|
| [ASP.NET Core Fundamentals (180)](180-aspnet-core-fundamentals.md) | Middleware, DI, configuration |
| [Controllers and Routing (182)](182-controllers.md) | Attribute routing, action results |
| [REST APIs (189)](189-rest-apis.md) | RESTful conventions, status codes |
| [Authentication and Authorization (190)](190-authentication-authorization.md) | JWT, policies, claims |
| [Dependency Injection (191)](191-dependency-injection.md) | Service lifetimes, registration |
| [EF Core (21)](21-entity-framework.md) | DbContext, migrations, LINQ queries |
| [Validation (185)](185-validation.md) | Model validation, FluentValidation |
| [Error Handling in ASP.NET Core (194)](194-error-handling.md) | ProblemDetails, exception middleware |
| [Logging (193)](193-logging.md) | Serilog, structured logging |

---

## Architecture

```
TaskManager/
├── TaskManager.sln
├── src/
│   ├── TaskApi.Api/
│   │   ├── TaskApi.Api.csproj
│   │   ├── Program.cs                     # Host builder, service registration
│   │   ├── appsettings.json               # Config (connection strings, JWT settings)
│   │   ├── appsettings.Development.json
│   │   ├── Controllers/
│   │   │   ├── AuthController.cs          # POST /api/auth/login, /register, /refresh
│   │   │   ├── ProjectsController.cs      # CRUD /api/projects
│   │   │   ├── TasksController.cs         # CRUD /api/projects/{id}/tasks
│   │   │   ├── CommentsController.cs      # CRUD /api/tasks/{id}/comments
│   │   │   └── UsersController.cs         # GET /api/users (admin only)
│   │   ├── Middleware/
│   │   │   └── GlobalExceptionHandler.cs  # Catches unhandled exceptions → ProblemDetails
│   │   ├── Filters/
│   │   │   └── ValidationFilter.cs        # FluentValidation action filter
│   │   └── Dockerfile
│   ├── TaskApi.Core/
│   │   ├── TaskApi.Core.csproj
│   │   ├── Entities/
│   │   │   ├── User.cs
│   │   │   ├── Project.cs
│   │   │   ├── TaskItem.cs
│   │   │   └── Comment.cs
│   │   ├── DTOs/
│   │   │   ├── Auth/
│   │   │   │   ├── LoginRequest.cs
│   │   │   │   ├── RegisterRequest.cs
│   │   │   │   └── TokenResponse.cs
│   │   │   ├── Projects/
│   │   │   │   ├── ProjectDto.cs
│   │   │   │   ├── CreateProjectRequest.cs
│   │   │   │   └── UpdateProjectRequest.cs
│   │   │   ├── Tasks/
│   │   │   │   ├── TaskDto.cs
│   │   │   │   ├── CreateTaskRequest.cs
│   │   │   │   └── UpdateTaskRequest.cs
│   │   │   └── Common/
│   │   │       ├── PagedResult.cs
│   │   │       └── QueryParameters.cs
│   │   ├── Interfaces/
│   │   │   ├── IAuthService.cs
│   │   │   ├── IProjectService.cs
│   │   │   ├── ITaskService.cs
│   │   │   └── ITokenService.cs
│   │   ├── Services/
│   │   │   ├── AuthService.cs
│   │   │   ├── ProjectService.cs
│   │   │   ├── TaskService.cs
│   │   │   └── TokenService.cs
│   │   └── Validators/
│   │       ├── CreateProjectValidator.cs
│   │       ├── CreateTaskValidator.cs
│   │       └── LoginRequestValidator.cs
│   └── TaskApi.Data/
│       ├── TaskApi.Data.csproj
│       ├── AppDbContext.cs
│       ├── Configurations/
│       │   ├── UserConfiguration.cs
│       │   ├── ProjectConfiguration.cs
│       │   ├── TaskItemConfiguration.cs
│       │   └── CommentConfiguration.cs
│       └── Migrations/
└── tests/
    └── TaskApi.Tests/
        ├── TaskApi.Tests.csproj
        ├── IntegrationTests/
        │   ├── CustomWebApplicationFactory.cs
        │   ├── AuthControllerTests.cs
        │   ├── ProjectsControllerTests.cs
        │   └── TasksControllerTests.cs
        └── UnitTests/
            ├── TokenServiceTests.cs
            └── ProjectServiceTests.cs
```

**Layer responsibilities:**
- **TaskApi.Api** — HTTP concerns only: controllers, middleware, filters, Program.cs. No business logic.
- **TaskApi.Core** — Domain entities, DTOs, service interfaces and implementations, validators. No HTTP or database dependencies.
- **TaskApi.Data** — EF Core DbContext, entity configurations, migrations. Only referenced by Api for DI registration.
- **TaskApi.Tests** — Integration tests using the real API + database.

---

## Requirements

### Core (Must Have)

1. **Entity model**: User (Id, Email, PasswordHash, Name, Role), Project (Id, Name, Description, OwnerId, CreatedAt), TaskItem (Id, Title, Description, Status, Priority, ProjectId, AssigneeId, DueDate, CreatedAt, UpdatedAt), Comment (Id, Content, TaskId, AuthorId, CreatedAt).
2. **Authentication**: POST `/api/auth/register` creates user with hashed password (BCrypt). POST `/api/auth/login` validates credentials, returns JWT access token + refresh token. Token contains user ID, email, role claims.
3. **Authorization**: All endpoints except auth require valid JWT. Admin role can view all users, delete any resource. User role can only CRUD their own projects/tasks.
4. **Projects CRUD**: GET (list with pagination), GET by ID, POST (create), PUT (update), DELETE. Only the project owner or admin can modify/delete.
5. **Tasks CRUD**: Nested under projects: GET `/api/projects/{projectId}/tasks`, POST, PUT, DELETE. Filter by status (todo/inProgress/done), assignee, due date range. Sort by dueDate, priority, createdAt.
6. **Comments CRUD**: Nested under tasks: GET `/api/tasks/{taskId}/comments`, POST, DELETE.
7. **Pagination**: All list endpoints return `PagedResult<T>` with items, page, pageSize, totalCount, totalPages.
8. **Validation**: FluentValidation on all request DTOs. Missing/invalid fields return 400 with ProblemDetails.
9. **Global error handling**: Unhandled exceptions return 500 with ProblemDetails (no stack traces in production).
10. **Swagger**: OpenAPI spec generated at `/swagger`. All endpoints documented with response types.

### Extended (Should Have)

11. **Rate limiting**: Fixed window (100 requests/minute per IP). Returns 429 Too Many Requests.
12. **Serilog**: Structured JSON logging to console and file. Log request/response, auth events, errors.
13. **Health checks**: `/health/live` (always 200), `/health/ready` (checks DB connectivity).
14. **Refresh tokens**: Stored in DB, used to get new access tokens without re-login.
15. **EF Core optimizations**: Use `.AsNoTracking()` for reads, `.Select()` for projections, avoid N+1 queries.

### Stretch (Nice to Have)

16. Docker Compose with SQL Server + API containers.
17. HATEOAS links in responses.
18. API versioning (v1/v2 URL prefix).
19. Background job for overdue task notifications (with `IHostedService`).
20. Audit trail — log who changed what and when using EF Core interceptors.

---

## Technical Guidance

### JWT Setup

Register JWT bearer authentication in `Program.cs`. The `TokenService` generates tokens
using `System.IdentityModel.Tokens.Jwt`. Store the secret key in configuration (not
hardcoded). Set reasonable expiry (15 min for access, 7 days for refresh).

Think about: Why short-lived access tokens + refresh tokens? What happens if a JWT is
stolen? How would you revoke access?

### Entity Framework Code First

Define entities as POCOs with navigation properties. Use the Fluent API in
`IEntityTypeConfiguration<T>` classes (not data annotations) for full control:

```csharp
builder.HasMany(p => p.Tasks)
       .WithOne(t => t.Project)
       .HasForeignKey(t => t.ProjectId)
       .OnDelete(DeleteBehavior.Cascade);
```

Think about: When do you use `Include()` vs. projection with `Select()`? Why is
`AsNoTracking()` important for read-only queries?

### Pagination Pattern

Accept `page` and `pageSize` query parameters. Use EF Core's `Skip()` and `Take()`:

```csharp
var query = context.Tasks.Where(t => t.ProjectId == projectId);
var totalCount = await query.CountAsync();
var items = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
return new PagedResult<TaskDto>(items, page, pageSize, totalCount);
```

### FluentValidation

Register validators via DI and use a custom `ValidationFilter` (or the
`FluentValidation.AspNetCore` auto-validation package). Return validation errors as
ProblemDetails with a `errors` dictionary mapping field names to error messages.

### Integration Testing with WebApplicationFactory

`WebApplicationFactory<Program>` spins up the entire ASP.NET Core pipeline in-process.
Override `ConfigureWebHost` to replace the real database with TestContainers (a real SQL
Server in Docker) or an in-memory SQLite database for speed.

---

## Step by Step Milestones

### Milestone 1: Project Setup and EF Core (2-3 hours)
Create solution with all projects. Define entities. Configure EF Core with SQL Server
connection string. Run `dotnet ef migrations add InitialCreate`. Verify database is created
and seeded with an admin user.

### Milestone 2: Authentication (3-4 hours)
Implement `TokenService` (JWT generation/validation). Implement `AuthService`
(register + login with BCrypt password hashing). Create `AuthController`. Write integration
tests: register, login, access protected endpoint with token, access without token (401).

### Milestone 3: Projects CRUD (3-4 hours)
Implement `ProjectService` and `ProjectsController`. Full CRUD with authorization
(owner or admin). Pagination on GET list. Write integration tests for all operations
including unauthorized access attempts.

### Milestone 4: Tasks CRUD with Filtering (3-4 hours)
Implement `TaskService` and `TasksController`. Nested under projects. Add filtering by
status, assignee, date range. Add sorting. Write tests for filtering and pagination.

### Milestone 5: Comments and Validation (2-3 hours)
Implement comments (simpler — no filtering needed). Add FluentValidation for all request
DTOs. Add the `ValidationFilter`. Test validation error responses.

### Milestone 6: Error Handling and Logging (2 hours)
Implement `GlobalExceptionHandler` middleware. Configure Serilog with structured logging.
Add request logging middleware. Verify error responses are ProblemDetails in all cases.

### Milestone 7: Rate Limiting and Health Checks (1-2 hours)
Add ASP.NET Core rate limiting middleware. Add health check endpoints. Test rate limiting
(send 101 requests, verify 429 on the 101st).

### Milestone 8: Docker and Polish (2-3 hours)
Write Dockerfile (multi-stage: build with SDK image, run with runtime image). Write
Docker Compose with SQL Server. Add Swagger annotations. Final README with API docs.

---

## Testing Requirements

### Unit Tests

- **TokenService**: Generate token, decode it, verify claims are correct. Test expired token detection.
- **ProjectService**: Mock the DbContext. Test CRUD logic, authorization checks, pagination math.
- **Validators**: Test each validation rule in isolation. Empty name, name too long, invalid email format.

### Integration Tests

Use `WebApplicationFactory<Program>` with a real database (TestContainers SQL Server or SQLite):

```csharp
public class ProjectsControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly CustomWebApplicationFactory _factory;

    // Test: Create project, get project, update project, delete project
    // Test: Unauthorized access returns 401
    // Test: Access other user's project returns 403
    // Test: Pagination returns correct page/total
    // Test: Invalid input returns 400 with ProblemDetails
}
```

### Test Scenarios

- **Auth flow**: Register -> Login -> Use token -> Token expires -> Refresh -> New token works.
- **CRUD lifecycle**: Create resource -> Read it back -> Update it -> Read updated -> Delete -> 404 on read.
- **Authorization matrix**: Admin can do everything. User can only CRUD own resources. Unauthenticated gets 401. Unauthorized gets 403.
- **Pagination**: 25 items, page size 10 -> page 1 has 10, page 2 has 10, page 3 has 5, page 4 has 0.
- **Filtering**: Create tasks with various statuses -> filter by "InProgress" -> only matching returned.
- **Validation**: Every required field missing -> all errors reported. Invalid email format. Negative page number.
- **Rate limiting**: Exceed limit -> 429 response with Retry-After header.
- **Error handling**: Force a 500 (e.g., DB down) -> ProblemDetails response, no stack trace.

---

## Reference Solution

<details>
<summary>Show Solution</summary>

### Program.cs — Full Service Registration

```csharp
using System.Text;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using TaskApi.Api.Middleware;
using TaskApi.Core.Interfaces;
using TaskApi.Core.Services;
using TaskApi.Core.Validators;
using TaskApi.Data;

var builder = WebApplication.CreateBuilder(args);

// --- Serilog ---
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate:
        "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} " +
        "{Properties:j}{NewLine}{Exception}")
    .WriteTo.File("logs/taskapi-.log", rollingInterval: RollingInterval.Day)
    .CreateLogger();

builder.Host.UseSerilog();

// --- Database ---
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

// --- Authentication ---
var jwtSettings = builder.Configuration.GetSection("Jwt");
var key = Encoding.UTF8.GetBytes(jwtSettings["Secret"]!);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings["Issuer"],
            ValidAudience = jwtSettings["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
});

// --- Services ---
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IProjectService, ProjectService>();
builder.Services.AddScoped<ITaskService, TaskService>();

// --- Validation ---
builder.Services.AddValidatorsFromAssemblyContaining<CreateProjectValidator>();

// --- Rate Limiting ---
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("fixed", config =>
    {
        config.PermitLimit = 100;
        config.Window = TimeSpan.FromMinutes(1);
        config.QueueLimit = 0;
    });
});

// --- Health Checks ---
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>("database");

// --- Swagger ---
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Task Manager API",
        Version = "v1",
        Description = "A production-quality task management REST API"
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer"
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// --- Middleware Pipeline (order matters!) ---
app.UseSerilogRequestLogging();
app.UseMiddleware<GlobalExceptionHandler>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health/live", new() { Predicate = _ => false }); // always 200
app.MapHealthChecks("/health/ready");

// Apply migrations on startup (dev only)
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

await app.RunAsync();

// Make Program accessible for WebApplicationFactory
public partial class Program { }
```

### Entities

```csharp
namespace TaskApi.Core.Entities;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "User"; // "User" or "Admin"
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Project> OwnedProjects { get; set; } = new List<Project>();
    public ICollection<TaskItem> AssignedTasks { get; set; } = new List<TaskItem>();
    public ICollection<Comment> Comments { get; set; } = new List<Comment>();
}

public class Project
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int OwnerId { get; set; }
    public User Owner { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
}

public enum TaskStatus { Todo, InProgress, Done }
public enum TaskPriority { Low, Medium, High, Critical }

public class TaskItem
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public TaskStatus Status { get; set; } = TaskStatus.Todo;
    public TaskPriority Priority { get; set; } = TaskPriority.Medium;
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public int? AssigneeId { get; set; }
    public User? Assignee { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Comment> Comments { get; set; } = new List<Comment>();
}

public class Comment
{
    public int Id { get; set; }
    public string Content { get; set; } = string.Empty;
    public int TaskId { get; set; }
    public TaskItem Task { get; set; } = null!;
    public int AuthorId { get; set; }
    public User Author { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

### TokenService.cs — JWT Generation

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using TaskApi.Core.Entities;
using TaskApi.Core.Interfaces;

namespace TaskApi.Core.Services;

public interface ITokenService
{
    string GenerateAccessToken(User user);
    ClaimsPrincipal? ValidateToken(string token);
}

public sealed class TokenService : ITokenService
{
    private readonly IConfiguration _config;
    private readonly SymmetricSecurityKey _key;

    public TokenService(IConfiguration config)
    {
        _config = config;
        _key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));
    }

    public string GenerateAccessToken(User user)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.Role),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var credentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddMinutes(
            int.Parse(_config["Jwt:AccessTokenExpiryMinutes"] ?? "15"));

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: expires,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public ClaimsPrincipal? ValidateToken(string token)
    {
        var handler = new JwtSecurityTokenHandler();
        try
        {
            return handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = _config["Jwt:Issuer"],
                ValidAudience = _config["Jwt:Audience"],
                IssuerSigningKey = _key,
                ClockSkew = TimeSpan.Zero
            }, out _);
        }
        catch
        {
            return null;
        }
    }
}
```

### ProjectsController.cs — Full CRUD Controller

```csharp
using System.Security.Claims;
using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskApi.Core.DTOs.Common;
using TaskApi.Core.DTOs.Projects;
using TaskApi.Core.Interfaces;

namespace TaskApi.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProjectsController : ControllerBase
{
    private readonly IProjectService _projectService;
    private readonly IValidator<CreateProjectRequest> _createValidator;
    private readonly IValidator<UpdateProjectRequest> _updateValidator;

    public ProjectsController(
        IProjectService projectService,
        IValidator<CreateProjectRequest> createValidator,
        IValidator<UpdateProjectRequest> updateValidator)
    {
        _projectService = projectService;
        _createValidator = createValidator;
        _updateValidator = updateValidator;
    }

    /// <summary>Get all projects for the current user (admins see all).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<ProjectDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll([FromQuery] QueryParameters query)
    {
        var userId = GetUserId();
        var isAdmin = User.IsInRole("Admin");
        var result = await _projectService.GetAllAsync(userId, isAdmin, query);
        return Ok(result);
    }

    /// <summary>Get a project by ID.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ProjectDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetById(int id)
    {
        var project = await _projectService.GetByIdAsync(id);
        if (project == null)
            return NotFound();

        if (project.OwnerId != GetUserId() && !User.IsInRole("Admin"))
            return Forbid();

        return Ok(project);
    }

    /// <summary>Create a new project.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(ProjectDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateProjectRequest request)
    {
        var validation = await _createValidator.ValidateAsync(request);
        if (!validation.IsValid)
            return ValidationProblem(new ValidationProblemDetails(
                validation.ToDictionary()));

        var project = await _projectService.CreateAsync(request, GetUserId());
        return CreatedAtAction(nameof(GetById), new { id = project.Id }, project);
    }

    /// <summary>Update an existing project.</summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ProjectDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateProjectRequest request)
    {
        var validation = await _updateValidator.ValidateAsync(request);
        if (!validation.IsValid)
            return ValidationProblem(new ValidationProblemDetails(
                validation.ToDictionary()));

        var existing = await _projectService.GetByIdAsync(id);
        if (existing == null) return NotFound();
        if (existing.OwnerId != GetUserId() && !User.IsInRole("Admin"))
            return Forbid();

        var updated = await _projectService.UpdateAsync(id, request);
        return Ok(updated);
    }

    /// <summary>Delete a project and all its tasks.</summary>
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Delete(int id)
    {
        var existing = await _projectService.GetByIdAsync(id);
        if (existing == null) return NotFound();
        if (existing.OwnerId != GetUserId() && !User.IsInRole("Admin"))
            return Forbid();

        await _projectService.DeleteAsync(id);
        return NoContent();
    }

    private int GetUserId() =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
```

### ProjectService.cs — Business Logic Layer

```csharp
using Microsoft.EntityFrameworkCore;
using TaskApi.Core.DTOs.Common;
using TaskApi.Core.DTOs.Projects;
using TaskApi.Core.Entities;
using TaskApi.Core.Interfaces;
using TaskApi.Data;

namespace TaskApi.Core.Services;

public sealed class ProjectService : IProjectService
{
    private readonly AppDbContext _db;

    public ProjectService(AppDbContext db) => _db = db;

    public async Task<PagedResult<ProjectDto>> GetAllAsync(
        int userId, bool isAdmin, QueryParameters query)
    {
        var baseQuery = _db.Projects
            .AsNoTracking()
            .Where(p => isAdmin || p.OwnerId == userId);

        // Search by name
        if (!string.IsNullOrWhiteSpace(query.Search))
            baseQuery = baseQuery.Where(p =>
                p.Name.Contains(query.Search));

        // Sorting
        baseQuery = query.SortBy?.ToLower() switch
        {
            "name" => query.SortDesc
                ? baseQuery.OrderByDescending(p => p.Name)
                : baseQuery.OrderBy(p => p.Name),
            "created" => query.SortDesc
                ? baseQuery.OrderByDescending(p => p.CreatedAt)
                : baseQuery.OrderBy(p => p.CreatedAt),
            _ => baseQuery.OrderByDescending(p => p.CreatedAt)
        };

        var totalCount = await baseQuery.CountAsync();
        var items = await baseQuery
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(p => new ProjectDto(
                p.Id, p.Name, p.Description, p.OwnerId,
                p.Owner.Name, p.CreatedAt, p.Tasks.Count))
            .ToListAsync();

        return new PagedResult<ProjectDto>(
            items, query.Page, query.PageSize, totalCount);
    }

    public async Task<ProjectDto?> GetByIdAsync(int id)
    {
        return await _db.Projects
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new ProjectDto(
                p.Id, p.Name, p.Description, p.OwnerId,
                p.Owner.Name, p.CreatedAt, p.Tasks.Count))
            .FirstOrDefaultAsync();
    }

    public async Task<ProjectDto> CreateAsync(CreateProjectRequest request, int ownerId)
    {
        var project = new Project
        {
            Name = request.Name,
            Description = request.Description,
            OwnerId = ownerId
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        return (await GetByIdAsync(project.Id))!;
    }

    public async Task<ProjectDto> UpdateAsync(int id, UpdateProjectRequest request)
    {
        var project = await _db.Projects.FindAsync(id)
            ?? throw new KeyNotFoundException($"Project {id} not found.");

        if (request.Name != null) project.Name = request.Name;
        if (request.Description != null) project.Description = request.Description;

        await _db.SaveChangesAsync();
        return (await GetByIdAsync(id))!;
    }

    public async Task DeleteAsync(int id)
    {
        var project = await _db.Projects.FindAsync(id)
            ?? throw new KeyNotFoundException($"Project {id} not found.");
        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
    }
}
```

### GlobalExceptionHandler.cs

```csharp
using System.Net;
using Microsoft.AspNetCore.Mvc;

namespace TaskApi.Api.Middleware;

/// <summary>
/// Catches all unhandled exceptions and returns a ProblemDetails response.
/// Never leaks stack traces in production.
/// </summary>
public sealed class GlobalExceptionHandler : IMiddleware
{
    private readonly ILogger<GlobalExceptionHandler> _logger;
    private readonly IHostEnvironment _env;

    public GlobalExceptionHandler(
        ILogger<GlobalExceptionHandler> logger,
        IHostEnvironment env)
    {
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        try
        {
            await next(context);
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Resource not found: {Message}", ex.Message);
            await WriteProblemDetails(context, HttpStatusCode.NotFound, ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogWarning(ex, "Unauthorized: {Message}", ex.Message);
            await WriteProblemDetails(context, HttpStatusCode.Forbidden, ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
            var detail = _env.IsDevelopment()
                ? ex.ToString()
                : "An unexpected error occurred. Please try again later.";
            await WriteProblemDetails(context,
                HttpStatusCode.InternalServerError, detail);
        }
    }

    private static async Task WriteProblemDetails(
        HttpContext context, HttpStatusCode status, string detail)
    {
        context.Response.StatusCode = (int)status;
        context.Response.ContentType = "application/problem+json";

        var problem = new ProblemDetails
        {
            Status = (int)status,
            Title = status.ToString(),
            Detail = detail,
            Instance = context.Request.Path
        };

        await context.Response.WriteAsJsonAsync(problem);
    }
}
```

### DTOs and Validators

```csharp
// --- DTOs ---
namespace TaskApi.Core.DTOs.Projects;

public sealed record ProjectDto(
    int Id, string Name, string? Description,
    int OwnerId, string OwnerName,
    DateTime CreatedAt, int TaskCount);

public sealed record CreateProjectRequest(
    string Name, string? Description);

public sealed record UpdateProjectRequest(
    string? Name, string? Description);

namespace TaskApi.Core.DTOs.Common;

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount)
{
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
    public bool HasPreviousPage => Page > 1;
    public bool HasNextPage => Page < TotalPages;
}

public sealed record QueryParameters
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 10;
    public string? Search { get; init; }
    public string? SortBy { get; init; }
    public bool SortDesc { get; init; }
}

// --- Validators ---
namespace TaskApi.Core.Validators;

using FluentValidation;
using TaskApi.Core.DTOs.Projects;

public sealed class CreateProjectValidator : AbstractValidator<CreateProjectRequest>
{
    public CreateProjectValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Project name is required.")
            .MaximumLength(200).WithMessage("Project name must be 200 chars or fewer.");

        RuleFor(x => x.Description)
            .MaximumLength(2000).WithMessage("Description must be 2000 chars or fewer.");
    }
}

public sealed class UpdateProjectValidator : AbstractValidator<UpdateProjectRequest>
{
    public UpdateProjectValidator()
    {
        RuleFor(x => x.Name)
            .MaximumLength(200).WithMessage("Project name must be 200 chars or fewer.")
            .When(x => x.Name != null);

        RuleFor(x => x.Description)
            .MaximumLength(2000).WithMessage("Description must be 2000 chars or fewer.")
            .When(x => x.Description != null);
    }
}
```

### Integration Test Setup

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskApi.Data;

namespace TaskApi.Tests.IntegrationTests;

public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Remove the real DbContext registration
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            if (descriptor != null)
                services.Remove(descriptor);

            // Use SQLite in-memory for fast tests
            services.AddDbContext<AppDbContext>(options =>
                options.UseSqlite("DataSource=:memory:"));

            // Ensure DB is created
            var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Database.OpenConnection();
            db.Database.EnsureCreated();
        });
    }
}

public class ProjectsControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public ProjectsControllerTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    private async Task<string> GetAuthToken()
    {
        // Register a test user
        var registerResponse = await _client.PostAsJsonAsync("/api/auth/register",
            new { Email = "test@test.com", Password = "Test123!", Name = "Test User" });
        registerResponse.EnsureSuccessStatusCode();

        // Login
        var loginResponse = await _client.PostAsJsonAsync("/api/auth/login",
            new { Email = "test@test.com", Password = "Test123!" });
        var token = await loginResponse.Content
            .ReadFromJsonAsync<TokenResponse>();
        return token!.AccessToken;
    }

    [Fact]
    public async Task CreateProject_ValidInput_Returns201()
    {
        var token = await GetAuthToken();
        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        var response = await _client.PostAsJsonAsync("/api/projects",
            new { Name = "Test Project", Description = "A test" });

        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        var project = await response.Content.ReadFromJsonAsync<ProjectDto>();
        Assert.Equal("Test Project", project!.Name);
    }

    [Fact]
    public async Task GetProjects_NoAuth_Returns401()
    {
        var response = await _client.GetAsync("/api/projects");
        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateProject_EmptyName_Returns400()
    {
        var token = await GetAuthToken();
        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        var response = await _client.PostAsJsonAsync("/api/projects",
            new { Name = "", Description = "A test" });

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
    }
}

// Simple record for deserialization in tests
file record TokenResponse(string AccessToken, string RefreshToken);
file record ProjectDto(
    int Id, string Name, string? Description,
    int OwnerId, string OwnerName, DateTime CreatedAt, int TaskCount);
```

</details>

---

## What to Show Off

### In Your Portfolio

- **Swagger screenshot** — Show the auto-generated API docs with all endpoints.
- **Architecture diagram** — Show the layered architecture: Controller -> Service -> Repository/DbContext.
- **Postman/Bruno collection** — Export an API collection so reviewers can test your API.
- **Docker** — Show `docker compose up` spinning up both SQL Server and the API.

### In Interviews

- **"Walk me through a request lifecycle"** — HTTP request hits Kestrel, middleware pipeline runs (logging, rate limiting, auth, exception handler), routing resolves to controller action, model binding deserializes body, FluentValidation runs, service layer processes, EF Core generates SQL, response serialized to JSON.
- **"How does your auth work?"** — BCrypt hashes passwords. Login returns a short-lived JWT (15 min). Refresh token stored in DB (7 days). Access token is stateless — no DB lookup per request. Refresh token is revocable.
- **"How do you handle N+1 queries?"** — Use `.Select()` projections to generate a single SQL query. Show the EF Core-generated SQL. Use `.Include()` only when you need the full entity graph.
- **"What would you do differently in production?"** — Use Azure Key Vault for secrets, Azure Application Insights for monitoring, Redis for rate limiting state, Azure SQL for the database, deploy to Azure App Service or AKS.

### Key Talking Points for a DE Role

- "This API could serve as the backend for a BNBuilders internal tool — project tracking, task assignment, reporting."
- "The pagination and filtering patterns are the same ones I use when building data APIs that front large datasets."
- "Structured logging with Serilog feeds into the same observability pipeline I would use for monitoring data pipelines."
- "The integration testing approach (real DB, real HTTP) gives me confidence that the system works end-to-end — same philosophy I apply to data pipeline testing."

---

## Stretch Goals

1. **SignalR real-time updates** — Push task updates to connected clients using WebSockets. When a task is created or updated, notify all users on that project.
2. **GraphQL alternative endpoint** — Add HotChocolate GraphQL alongside REST. Let clients query exactly what they need (great for dashboards).
3. **Background job processing** — Use Hangfire or `IHostedService` to send email notifications when tasks are due. Process in the background so API stays fast.
4. **Multi-tenant support** — Add a `TenantId` to every entity. Use EF Core global query filters to ensure data isolation between tenants (companies).
5. **CI/CD pipeline** — GitHub Actions workflow: build, test, Docker build, push to container registry. Show you can automate the full delivery pipeline.
