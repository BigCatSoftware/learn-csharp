# Build Configurations and Environments

Understanding how Debug and Release builds differ, how to use conditional compilation,
and how to manage environment-specific configuration is essential for professional .NET
development. This lesson covers the entire configuration story from build flags to
runtime settings.

---

## Debug vs Release Builds

When you run `dotnet build`, the default configuration is **Debug**. When you publish
for production, you use **Release**. The differences are significant.

| Aspect | Debug | Release |
|---|---|---|
| Optimization | Disabled (`/optimize-`) | Enabled (`/optimize+`) |
| Debug symbols | Full PDB | Portable PDB (smaller) |
| `DEBUG` constant | Defined | Not defined |
| `TRACE` constant | Defined | Defined |
| Assertions | Active | Removed by optimizer |
| Code inlining | Minimal | Aggressive |
| Dead code elimination | No | Yes |
| Build output size | Larger | Smaller |
| Performance | Slower (for debugging) | Faster (for production) |

```bash
# Build in Debug (default)
dotnet build

# Build in Release
dotnet build -c Release

# Run in Release
dotnet run -c Release

# Publish always uses Release
dotnet publish -c Release
```

> **Warning:** Never deploy Debug builds to production. Debug builds disable optimizations,
> include full debug symbols, and may expose sensitive diagnostic information.

---

## Conditional Compilation

The C# preprocessor lets you include or exclude code based on build configuration.

### Basic #if DEBUG

```csharp
public class OrderService
{
    public void ProcessOrder(Order order)
    {
#if DEBUG
        Console.WriteLine($"Processing order {order.Id} — DEBUG MODE");
        ValidateOrderInvariantsSlowly(order); // expensive validation
#endif

        // Production code runs in both configurations
        _repository.Save(order);
        _eventBus.Publish(new OrderProcessedEvent(order.Id));
    }
}
```

### Defining Custom Compilation Constants

In your `.csproj`:

```xml
<PropertyGroup Condition="'$(Configuration)' == 'Debug'">
  <DefineConstants>$(DefineConstants);ENABLE_DETAILED_LOGGING</DefineConstants>
</PropertyGroup>
```

Usage in code:

```csharp
#if ENABLE_DETAILED_LOGGING
    logger.LogDebug("Request payload: {@Payload}", request);
#endif
```

### Common Preprocessor Directives

```csharp
#if DEBUG
    // Only in Debug builds
#elif RELEASE
    // Only in Release builds (note: RELEASE is not defined by default)
#endif

#if NET9_0_OR_GREATER
    // Code that uses .NET 9+ APIs
#elif NET8_0
    // Fallback for .NET 8
#endif

// Conditional method attribute (cleaner than #if)
[System.Diagnostics.Conditional("DEBUG")]
private static void DebugLog(string message)
{
    Console.WriteLine($"[DEBUG] {message}");
}
```

> **Tip:** Prefer `[Conditional("DEBUG")]` over `#if DEBUG` when possible. It keeps the
> code cleaner and the compiler automatically removes calls to the method in Release builds.

---

## Environment Variables in .NET

.NET uses environment variables to control runtime behavior.

### Key Environment Variables

| Variable | Used By | Values |
|---|---|---|
| `DOTNET_ENVIRONMENT` | Generic .NET Host | `Development`, `Staging`, `Production` |
| `ASPNETCORE_ENVIRONMENT` | ASP.NET Core | `Development`, `Staging`, `Production` |
| `DOTNET_URLS` | Kestrel | `http://localhost:5000` |
| `DOTNET_RUNNING_IN_CONTAINER` | Runtime | `true` (auto-set in Docker) |

```bash
# Set environment for a single run
DOTNET_ENVIRONMENT=Production dotnet run

# Or export for the shell session
export ASPNETCORE_ENVIRONMENT=Staging
dotnet run
```

### Checking the Environment in Code

```csharp
var builder = WebApplication.CreateBuilder(args);

// The environment is determined by ASPNETCORE_ENVIRONMENT (for web apps)
// or DOTNET_ENVIRONMENT (for generic hosts)
if (builder.Environment.IsDevelopment())
{
    // Development-only middleware
    app.UseDeveloperExceptionPage();
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (builder.Environment.IsProduction())
{
    app.UseExceptionHandler("/error");
    app.UseHsts();
}
```

> **Important:** If neither `ASPNETCORE_ENVIRONMENT` nor `DOTNET_ENVIRONMENT` is set,
> the default is **Production**. This is a safe default — you must explicitly opt into
> Development mode.

---

## launchSettings.json

The `Properties/launchSettings.json` file configures how `dotnet run` behaves during
development. It is **not** used in production.

```json
{
  "profiles": {
    "http": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,
      "applicationUrl": "http://localhost:5000",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development"
      }
    },
    "https": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,
      "applicationUrl": "https://localhost:5001;http://localhost:5000",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development"
      }
    },
    "staging": {
      "commandName": "Project",
      "applicationUrl": "http://localhost:5050",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Staging"
      }
    }
  }
}
```

```bash
# Use a specific launch profile
dotnet run --launch-profile staging

# Skip launchSettings.json entirely
dotnet run --no-launch-profile
```

> **Note:** `launchSettings.json` should be committed to source control so the whole team
> uses the same development settings. But never put secrets in it — use User Secrets instead.

---

## appsettings.json Hierarchy

.NET configuration supports a layered file system. Files loaded later override earlier ones.

### Load Order

1. `appsettings.json` (base — always loaded)
2. `appsettings.{Environment}.json` (environment-specific override)
3. User secrets (Development only)
4. Environment variables
5. Command-line arguments

### Example Files

```json
// appsettings.json — shared defaults
{
  "Logging": {
    "LogLevel": {
      "Default": "Information"
    }
  },
  "ConnectionStrings": {
    "Database": "Host=localhost;Database=orders;Username=app"
  },
  "Features": {
    "EnableNewCheckout": false
  }
}
```

```json
// appsettings.Development.json — dev overrides
{
  "Logging": {
    "LogLevel": {
      "Default": "Debug",
      "Microsoft.EntityFrameworkCore": "Information"
    }
  },
  "ConnectionStrings": {
    "Database": "Host=localhost;Database=orders_dev;Username=dev"
  },
  "Features": {
    "EnableNewCheckout": true
  }
}
```

```json
// appsettings.Production.json — production overrides
{
  "Logging": {
    "LogLevel": {
      "Default": "Warning"
    }
  }
}
```

> **Caution:** Never put passwords, API keys, or connection string passwords in
> `appsettings.json` files. These files are committed to source control. Use User Secrets
> for development and environment variables or a vault for production.

---

## User Secrets

User Secrets store sensitive configuration outside of your project directory, in your
home folder. They are only for **Development**.

### Setup

```bash
# Initialize user secrets for a project
dotnet user-secrets init --project src/Api/Api.csproj

# This adds a UserSecretsId to the .csproj:
# <UserSecretsId>a-guid-here</UserSecretsId>
```

### Managing Secrets

```bash
# Set a secret
dotnet user-secrets set "ConnectionStrings:Database" \
  "Host=localhost;Database=orders;Username=dev;Password=secret123" \
  --project src/Api/Api.csproj

# Set a nested value
dotnet user-secrets set "Stripe:ApiKey" "sk_test_abc123" \
  --project src/Api/Api.csproj

# List all secrets
dotnet user-secrets list --project src/Api/Api.csproj

# Remove a secret
dotnet user-secrets remove "Stripe:ApiKey" --project src/Api/Api.csproj

# Clear all secrets
dotnet user-secrets clear --project src/Api/Api.csproj
```

Secrets are stored at `~/.microsoft/usersecrets/<UserSecretsId>/secrets.json`.

### How It Works in Code

No code changes needed. The default `WebApplication.CreateBuilder(args)` automatically
loads user secrets when the environment is `Development`:

```csharp
var builder = WebApplication.CreateBuilder(args);

// This already loads:
// 1. appsettings.json
// 2. appsettings.Development.json
// 3. User secrets (in Development)
// 4. Environment variables
// 5. Command-line args

var connectionString = builder.Configuration.GetConnectionString("Database");
// Returns the value from user secrets, overriding appsettings.json
```

---

## Configuration Binding to Strongly-Typed Classes

Instead of reading configuration strings everywhere, bind them to C# classes.

### Define the Options Class

```csharp
public class StripeOptions
{
    public const string SectionName = "Stripe";

    public string ApiKey { get; set; } = string.Empty;
    public string WebhookSecret { get; set; } = string.Empty;
    public bool EnableTestMode { get; set; }
}
```

### Configuration in appsettings.json

```json
{
  "Stripe": {
    "ApiKey": "pk_live_...",
    "WebhookSecret": "whsec_...",
    "EnableTestMode": false
  }
}
```

### Register in Program.cs

```csharp
var builder = WebApplication.CreateBuilder(args);

// Bind the section to the options class
builder.Services.Configure<StripeOptions>(
    builder.Configuration.GetSection(StripeOptions.SectionName));
```

---

## The IOptions Pattern

.NET provides three interfaces for consuming options:

| Interface | Lifetime | Reloads | Use Case |
|---|---|---|---|
| `IOptions<T>` | Singleton | No | Static configuration |
| `IOptionsSnapshot<T>` | Scoped | Yes (per request) | Web apps with per-request config |
| `IOptionsMonitor<T>` | Singleton | Yes (on change) | Background services |

### Using IOptions

```csharp
public class PaymentService
{
    private readonly StripeOptions _options;

    public PaymentService(IOptions<StripeOptions> options)
    {
        _options = options.Value;
    }

    public async Task ChargeAsync(decimal amount)
    {
        var client = new StripeClient(_options.ApiKey);
        // ...
    }
}
```

### Using IOptionsMonitor (Reacts to Changes)

```csharp
public class FeatureFlagService
{
    private readonly IOptionsMonitor<FeatureOptions> _options;

    public FeatureFlagService(IOptionsMonitor<FeatureOptions> options)
    {
        _options = options;

        // React to configuration changes
        _options.OnChange(updated =>
        {
            Console.WriteLine("Feature flags updated!");
        });
    }

    public bool IsEnabled(string feature)
    {
        return _options.CurrentValue.EnabledFeatures.Contains(feature);
    }
}
```

### Validation with Data Annotations

```csharp
using System.ComponentModel.DataAnnotations;

public class DatabaseOptions
{
    public const string SectionName = "Database";

    [Required]
    public string ConnectionString { get; set; } = string.Empty;

    [Range(1, 100)]
    public int MaxRetryCount { get; set; } = 3;

    [Range(1, 3600)]
    public int CommandTimeoutSeconds { get; set; } = 30;
}
```

Register with validation:

```csharp
builder.Services
    .AddOptionsWithValidateOnStart<DatabaseOptions>()
    .Bind(builder.Configuration.GetSection(DatabaseOptions.SectionName))
    .ValidateDataAnnotations();
```

> **Tip:** `ValidateOnStart` validates options when the application starts, not when they
> are first used. This catches configuration errors immediately instead of at runtime.

---

## Summary

- **Debug** builds are for development: no optimization, full symbols, `DEBUG` constant.
- **Release** builds are for production: optimized, smaller, faster.
- Use `[Conditional("DEBUG")]` for debug-only methods.
- Set `ASPNETCORE_ENVIRONMENT` or `DOTNET_ENVIRONMENT` to control runtime behavior.
- Use `appsettings.{Environment}.json` for environment-specific configuration.
- Use **User Secrets** for sensitive values during development.
- Bind configuration to strongly-typed classes with the **IOptions pattern**.
- Use `ValidateOnStart` to catch configuration errors at application startup.
