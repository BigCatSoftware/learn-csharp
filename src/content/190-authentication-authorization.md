# Authentication and Authorization

*Chapter 12.11 — ASP.NET Core MVC & Razor Pages*

---

## Overview

**Authentication** answers "Who are you?" — it establishes a user's identity.
**Authorization** answers "What can you do?" — it determines what an authenticated user
is allowed to access.

ASP.NET Core treats these as distinct middleware steps in the request pipeline:

```
Request -> Authentication Middleware -> Authorization Middleware -> Endpoint
```

The framework is **scheme-based**: you register one or more authentication schemes
(cookies, JWT bearer, Windows, OpenID Connect), and the authorization system evaluates
policies, roles, and claims against the authenticated identity.

For a construction company running a Microsoft shop, this is especially relevant because
you will encounter:
- **Windows Authentication** for intranet apps (everyone has an AD account).
- **Cookie authentication** for web apps accessible from the field.
- **JWT bearer tokens** for APIs consumed by mobile apps and third-party integrations.
- **Azure AD / Entra ID** for cloud-hosted apps with SSO.

---

## Core Concepts

### Authentication Schemes

A scheme consists of:
- A **handler** (e.g., `CookieAuthenticationHandler`, `JwtBearerHandler`).
- **Options** that configure the handler.
- A **name** (string identifier).

You can have multiple schemes. One is the **default**.

### Claims-Based Identity

After authentication, the user is represented by a `ClaimsPrincipal` containing one or
more `ClaimsIdentity` objects. Each identity has a collection of `Claim` objects:

```
ClaimsPrincipal
  -> ClaimsIdentity (scheme: "Cookies")
       -> Claim(ClaimTypes.Name, "jsmith")
       -> Claim(ClaimTypes.Email, "jsmith@bnbuilders.com")
       -> Claim(ClaimTypes.Role, "ProjectManager")
       -> Claim("Division", "Northwest")
```

### Authorization Approaches

| Approach         | How It Works                                      |
|------------------|---------------------------------------------------|
| **Simple**       | `[Authorize]` — just requires authentication      |
| **Role-based**   | `[Authorize(Roles = "Admin,PM")]`                 |
| **Policy-based** | `[Authorize(Policy = "CanEditJobCosts")]`         |
| **Resource-based** | `IAuthorizationService.AuthorizeAsync(user, resource, requirement)` |

Policy-based authorization is the recommended approach for anything beyond simple role
checks.

---

## Code Examples

### Cookie Authentication Setup

```csharp
// Program.cs
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Account/Login";
        options.LogoutPath = "/Account/Logout";
        options.AccessDeniedPath = "/Account/AccessDenied";
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Strict;
    });

builder.Services.AddAuthorization();

var app = builder.Build();

// ORDER MATTERS: Authentication before Authorization
app.UseAuthentication();
app.UseAuthorization();
```

### Signing In with Cookies

```csharp
[AllowAnonymous]
[HttpPost("login")]
public async Task<IActionResult> Login(LoginRequest request)
{
    var user = await _userService.ValidateCredentialsAsync(
        request.Username, request.Password);

    if (user is null)
        return Unauthorized();

    var claims = new List<Claim>
    {
        new(ClaimTypes.Name, user.Username),
        new(ClaimTypes.Email, user.Email),
        new(ClaimTypes.Role, user.Role),
        new("EmployeeId", user.EmployeeId.ToString()),
        new("Division", user.Division)
    };

    var identity = new ClaimsIdentity(claims,
        CookieAuthenticationDefaults.AuthenticationScheme);
    var principal = new ClaimsPrincipal(identity);

    await HttpContext.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        principal,
        new AuthenticationProperties
        {
            IsPersistent = request.RememberMe,
            ExpiresUtc = DateTimeOffset.UtcNow.AddHours(8)
        });

    return RedirectToAction("Index", "Dashboard");
}
```

### JWT Bearer Authentication

```csharp
// Program.cs
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
```

### Generating a JWT Token

```csharp
public class TokenService : ITokenService
{
    private readonly IConfiguration _config;

    public TokenService(IConfiguration config) => _config = config;

    public string GenerateToken(ApplicationUser user)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("division", user.Division),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(4),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
```

### Windows Authentication (Intranet)

```csharp
// Program.cs
builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();

builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = options.DefaultPolicy; // require auth everywhere
});
```

```json
// launchSettings.json
{
  "iisSettings": {
    "windowsAuthentication": true,
    "anonymousAuthentication": false
  }
}
```

### Role-Based Authorization

```csharp
[Authorize(Roles = "Admin,FinanceTeam")]
public class JobCostController : Controller
{
    [Authorize(Roles = "Admin")]  // further restricts to Admin only
    public IActionResult DeleteCostEntry(int id) { ... }
}
```

### Policy-Based Authorization

```csharp
// Program.cs — Define policies
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanEditJobCosts", policy =>
        policy.RequireRole("Admin", "ProjectManager", "CostEngineer")
              .RequireClaim("Division"));

    options.AddPolicy("NorthwestDivisionOnly", policy =>
        policy.RequireClaim("Division", "Northwest"));

    options.AddPolicy("MinimumClearance", policy =>
        policy.Requirements.Add(new MinimumClearanceRequirement(3)));
});
```

### Custom Authorization Requirement and Handler

```csharp
// Requirement
public class MinimumClearanceRequirement : IAuthorizationRequirement
{
    public int RequiredLevel { get; }
    public MinimumClearanceRequirement(int level) => RequiredLevel = level;
}

// Handler
public class MinimumClearanceHandler
    : AuthorizationHandler<MinimumClearanceRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        MinimumClearanceRequirement requirement)
    {
        var clearanceClaim = context.User.FindFirst("ClearanceLevel");

        if (clearanceClaim is not null
            && int.TryParse(clearanceClaim.Value, out int level)
            && level >= requirement.RequiredLevel)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}

// Registration
builder.Services.AddSingleton<IAuthorizationHandler, MinimumClearanceHandler>();
```

### Resource-Based Authorization

```csharp
public class ProjectAuthorizationHandler
    : AuthorizationHandler<ProjectOperationRequirement, Project>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ProjectOperationRequirement requirement,
        Project project)
    {
        var userDivision = context.User.FindFirst("Division")?.Value;

        if (requirement.OperationName == "Edit"
            && project.Division == userDivision)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}

// Usage in a controller:
public async Task<IActionResult> Edit(int id)
{
    var project = await _repo.GetByIdAsync(id);
    var authResult = await _authService.AuthorizeAsync(
        User, project, new ProjectOperationRequirement("Edit"));

    if (!authResult.Succeeded)
        return Forbid();

    return View(project);
}
```

---

## Common Patterns

1. **Dual scheme** — Use cookies for the web UI and JWT for the API, both in the same
   app. Set the default scheme per-endpoint with `[Authorize(AuthenticationSchemes = "Bearer")]`.

2. **Claims transformation** — Enrich the identity after authentication (e.g., look up
   the user's division from a database) using `IClaimsTransformation`.

3. **Fallback policy** — Set `options.FallbackPolicy = options.DefaultPolicy` to require
   authentication on all endpoints by default. Opt out with `[AllowAnonymous]`.

4. **Token refresh** — For JWT-based APIs, implement a `/refresh` endpoint that accepts
   a refresh token and returns a new access token without re-authenticating.

5. **Azure AD / Entra ID** — Use `Microsoft.Identity.Web` for SSO with Azure AD.

---

## Gotchas and Pitfalls

- **Middleware order matters.** `UseAuthentication()` must come before
  `UseAuthorization()`, which must come before `MapControllers()` / endpoint mapping.
  Wrong order = authorization silently skipped.

- **`[Authorize]` on a controller + `[AllowAnonymous]` on an action** — this works.
  But `[Authorize]` on an action + `[AllowAnonymous]` on the controller does NOT make
  the action anonymous. `[Authorize]` at the more specific level wins.

  Actually, in ASP.NET Core, `[AllowAnonymous]` takes precedence over `[Authorize]`
  when applied at the action level. The key rule: `[AllowAnonymous]` overrides
  `[Authorize]` when they are at the same or more specific level.

- **Role-based auth is string-based.** Typos in role names (`"Admim"` vs `"Admin"`) fail
  silently. Policy-based authorization with constants is safer.

- **JWT `ClockSkew` defaults to 5 minutes.** A token that expired 4 minutes ago is still
  valid by default. Set `ClockSkew = TimeSpan.Zero` if you need strict expiration.

- **Storing secrets in appsettings.json.** Never put JWT signing keys or connection
  strings in source control. Use User Secrets in development and Azure Key Vault or
  environment variables in production.

- **Windows Auth does not work with Kestrel standalone** in all scenarios. It works best
  behind IIS or with the Negotiate handler. Test your deployment model early.

---

## Performance Considerations

- **JWT validation** is CPU-bound (signature verification). For high-throughput APIs,
  consider caching validated tokens or using reference tokens with introspection.

- **Claims transformation** runs on every request. If it queries a database, cache the
  result (e.g., in `IMemoryCache` keyed by user ID with a short TTL).

- **Cookie size** — Every claim you add increases the cookie size, which is sent with
  every request. Keep claims minimal; look up additional data from the database when
  needed.

- **Policy evaluation** is fast for simple requirement checks. Custom handlers that hit
  external services (database, HTTP) should use caching.

- For Windows Authentication, Kerberos ticket validation involves domain controller
  communication. Ensure DCs are network-adjacent to your app servers.

---

## BNBuilders Context

- **Intranet apps (timecards, daily reports, cost dashboards):** Use Windows
  Authentication. Everyone has an AD account. Map AD groups to roles:
  `ProjectManager`, `Superintendent`, `Accounting`, `Executive`.

- **Field apps (mobile-friendly daily logs, safety checklists):** Use cookie auth or
  JWT. Field workers may not be on the domain. Provide a simple login page backed by
  the company directory.

- **Subcontractor portal:** JWT bearer tokens issued after login. Subcontractors should
  only see their own projects. Use resource-based authorization keyed on the project's
  subcontractor ID.

- **Job cost data:** Policy-based authorization enforces that only users in the correct
  division can view sensitive financial data. A PM in the Northwest division cannot see
  Southeast division job costs.

- **Azure AD / Entra ID:** If BNBuilders uses Microsoft 365 (likely for a Microsoft
  shop), `Microsoft.Identity.Web` gives you SSO across internal web apps with minimal
  configuration. Users sign in once and access all BNBuilders tools.

- **Audit trail:** Combine the `ClaimsPrincipal` with an action filter to log who
  accessed what. Essential for change order approvals, budget modifications, and
  compliance reporting.

---

## Interview / Senior Dev Questions

1. **Explain the difference between authentication and authorization. Give a concrete
   example from a construction company context.**
   Authentication: validating that the user is John Smith (via AD credentials).
   Authorization: verifying John Smith (a Superintendent) can approve daily reports
   but cannot modify job cost budgets (which requires the PM or Accounting role).

2. **You have an app that needs both cookie auth for the web UI and JWT for the API.
   How do you configure this?**
   Register both schemes, set the default scheme, and use `AuthenticationSchemes` on
   the `[Authorize]` attribute or configure a policy per endpoint/area. Alternatively,
   use `ForwardDefaultSelector` to dynamically pick the scheme based on the request path.

3. **What is the captive dependency risk with `IClaimsTransformation`?**
   `IClaimsTransformation` is resolved from DI. If it depends on a scoped service (like
   `DbContext`) but is inadvertently registered as singleton, you get a captive
   dependency. Register the transformation as scoped.

4. **When would you use resource-based authorization instead of policy-based?**
   When the authorization decision depends on the specific resource being accessed. For
   example, "Can this user edit THIS project?" requires knowing the project's division,
   owner, or status. You cannot encode that into a static policy; you need to pass the
   resource to `IAuthorizationService.AuthorizeAsync`.

---

## Quiz

**Question 1:** What is the correct middleware order for authentication and authorization
in `Program.cs`?

<details>
<summary>Answer</summary>

```csharp
app.UseAuthentication();  // FIRST
app.UseAuthorization();   // SECOND
```

Authentication must run before authorization. If reversed, the authorization middleware
has no identity to evaluate and will treat all requests as unauthenticated.
</details>

---

**Question 2:** You set `[Authorize(Roles = "Admin")]` on a controller. A user with
the role `"ProjectManager"` tries to access an action. What HTTP status code do they
receive?

<details>
<summary>Answer</summary>

**403 Forbidden** (if they are authenticated). The user is authenticated (known identity)
but not authorized (lacks the `Admin` role). If they were not authenticated at all, they
would receive **401 Unauthorized** (or be redirected to the login page for cookie auth).
</details>

---

**Question 3:** What is the default `ClockSkew` for JWT bearer token validation, and why
does it exist?

<details>
<summary>Answer</summary>

The default `ClockSkew` is **5 minutes**. It exists to account for clock drift between
the token issuer and the token validator. A token that expired up to 5 minutes ago will
still be accepted. Set `ClockSkew = TimeSpan.Zero` for strict expiration, but be aware
this can cause spurious rejections if server clocks are not perfectly synchronized.
</details>

---

**Question 4:** In a BNBuilders intranet app using Windows Authentication, how would you
restrict access to the finance dashboard to only the Accounting AD group?

<details>
<summary>Answer</summary>

Option A — Role-based:
```csharp
[Authorize(Roles = @"BNBUILDERS\Accounting")]
public class FinanceDashboardController : Controller { ... }
```

Option B — Policy-based (preferred for maintainability):
```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("FinanceAccess", policy =>
        policy.RequireRole(@"BNBUILDERS\Accounting", @"BNBUILDERS\Executives"));
});

[Authorize(Policy = "FinanceAccess")]
public class FinanceDashboardController : Controller { ... }
```

With Windows Authentication, AD group memberships are automatically mapped to role
claims.
</details>
