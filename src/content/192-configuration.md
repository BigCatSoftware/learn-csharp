# Configuration in ASP.NET Core

*Chapter 12.13 — ASP.NET Core MVC & Razor Pages*

---

## Overview

ASP.NET Core's configuration system is a layered, provider-based architecture that
replaces the old `web.config` / `ConfigurationManager` approach from .NET Framework.
Configuration values can come from multiple sources — JSON files, environment variables,
command-line arguments, Azure Key Vault, user secrets — and they are merged into a single
`IConfiguration` object using a **last-wins** priority model.

The **Options pattern** builds on top of `IConfiguration` to provide strongly-typed
access to configuration sections, with built-in support for validation, reloading, and
dependency injection.

For a data engineer at a construction company, configuration management is critical:
database connection strings, ERP API endpoints, report output paths, feature flags, and
secrets like API keys must all be managed correctly across development, staging, and
production environments.

---

## Core Concepts

### Configuration Providers (Default Order)

`WebApplication.CreateBuilder()` registers providers in this order (later providers
override earlier ones):

1. `appsettings.json`
2. `appsettings.{Environment}.json` (e.g., `appsettings.Production.json`)
3. **User Secrets** (Development only)
4. **Environment variables**
5. **Command-line arguments**

This means environment variables override JSON files, and command-line arguments override
everything.

### The Options Pattern

Instead of reading raw strings from `IConfiguration`, you bind configuration sections
to strongly-typed POCOs:

| Interface              | Behavior                                          |
|------------------------|---------------------------------------------------|
| `IOptions<T>`          | Singleton. Read once at startup. Never changes.    |
| `IOptionsSnapshot<T>`  | Scoped. Re-reads on each request. Supports reload. |
| `IOptionsMonitor<T>`   | Singleton. Pushes change notifications. Has `OnChange` callback. |

### Configuration Validation

You can validate options at startup using Data Annotations or custom validation logic,
ensuring the app fails fast if required configuration is missing or invalid.

---

## Code Examples

### appsettings.json Structure

```json
{
  "ConnectionStrings": {
    "Default": "Server=sql-prod;Database=BNBuilders;Trusted_Connection=True;",
    "Sage": "Server=sage-server;Database=Sage300;User Id=readonly;Password=***;"
  },
  "ErpIntegration": {
    "BaseUrl": "https://erp.bnbuilders.com/api",
    "TimeoutSeconds": 30,
    "MaxRetries": 3,
    "Enabled": true
  },
  "Reporting": {
    "OutputPath": "\\\\file-server\\reports\\",
    "DefaultFormat": "pdf",
    "MaxRowsPerExport": 50000
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```

### Environment-Specific Override

```json
// appsettings.Development.json
{
  "ConnectionStrings": {
    "Default": "Server=(localdb)\\mssqllocaldb;Database=BNBuilders_Dev;Trusted_Connection=True;"
  },
  "ErpIntegration": {
    "BaseUrl": "https://erp-sandbox.bnbuilders.com/api",
    "Enabled": false
  }
}
```

### Reading Configuration Directly

```csharp
public class ErpSyncService
{
    private readonly IConfiguration _config;

    public ErpSyncService(IConfiguration config)
    {
        _config = config;
    }

    public void Sync()
    {
        // Direct key access (not recommended for repeated use)
        string baseUrl = _config["ErpIntegration:BaseUrl"]!;
        int timeout = _config.GetValue<int>("ErpIntegration:TimeoutSeconds");
        bool enabled = _config.GetValue<bool>("ErpIntegration:Enabled");

        // Connection strings have a dedicated method
        string connStr = _config.GetConnectionString("Default")!;
    }
}
```

### Options Pattern (Recommended)

```csharp
// 1. Define the POCO
public class ErpIntegrationOptions
{
    public const string SectionName = "ErpIntegration";

    public string BaseUrl { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 30;
    public int MaxRetries { get; set; } = 3;
    public bool Enabled { get; set; } = true;
}

// 2. Register in Program.cs
builder.Services.Configure<ErpIntegrationOptions>(
    builder.Configuration.GetSection(ErpIntegrationOptions.SectionName));

// 3. Inject and use
public class ErpSyncService
{
    private readonly ErpIntegrationOptions _options;

    public ErpSyncService(IOptions<ErpIntegrationOptions> options)
    {
        _options = options.Value;
    }

    public async Task SyncAsync()
    {
        if (!_options.Enabled) return;

        using var client = new HttpClient
        {
            BaseAddress = new Uri(_options.BaseUrl),
            Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds)
        };

        // Use _options.MaxRetries for retry logic...
    }
}
```

### IOptionsSnapshot vs IOptionsMonitor

```csharp
// IOptionsSnapshot — scoped, re-reads per request (good for web apps)
public class ReportController : Controller
{
    private readonly ReportingOptions _options;

    public ReportController(IOptionsSnapshot<ReportingOptions> options)
    {
        _options = options.Value; // fresh per request
    }
}

// IOptionsMonitor — singleton, notifies on change (good for background services)
public class CostSyncBackgroundService : BackgroundService
{
    private ErpIntegrationOptions _options;

    public CostSyncBackgroundService(IOptionsMonitor<ErpIntegrationOptions> monitor)
    {
        _options = monitor.CurrentValue;
        monitor.OnChange(newOptions =>
        {
            _options = newOptions;
            // Log the change, adjust behavior, etc.
        });
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            if (_options.Enabled)
            {
                // Sync using current options...
            }
            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
        }
    }
}
```

### Configuration Validation with Data Annotations

```csharp
using System.ComponentModel.DataAnnotations;

public class ErpIntegrationOptions
{
    public const string SectionName = "ErpIntegration";

    [Required]
    [Url]
    public string BaseUrl { get; set; } = string.Empty;

    [Range(1, 300)]
    public int TimeoutSeconds { get; set; } = 30;

    [Range(0, 10)]
    public int MaxRetries { get; set; } = 3;

    public bool Enabled { get; set; } = true;
}

// Program.cs — validate on startup
builder.Services.AddOptions<ErpIntegrationOptions>()
    .Bind(builder.Configuration.GetSection(ErpIntegrationOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart(); // Fail fast at startup if invalid
```

### Custom Validation

```csharp
builder.Services.AddOptions<ErpIntegrationOptions>()
    .Bind(builder.Configuration.GetSection(ErpIntegrationOptions.SectionName))
    .ValidateDataAnnotations()
    .Validate(options =>
    {
        if (options.Enabled && string.IsNullOrWhiteSpace(options.BaseUrl))
            return false; // If enabled, BaseUrl is required
        return true;
    }, "BaseUrl is required when ERP integration is enabled.")
    .ValidateOnStart();
```

### User Secrets (Development Only)

```bash
# Initialize user secrets for a project
dotnet user-secrets init

# Set a secret
dotnet user-secrets set "ConnectionStrings:Sage" "Server=sage;Database=Sage300;User Id=admin;Password=RealPassword123;"

# Set a nested value
dotnet user-secrets set "ErpIntegration:ApiKey" "sk-abc123xyz"

# List secrets
dotnet user-secrets list
```

User secrets are stored outside the project directory:
- **Windows:** `%APPDATA%\Microsoft\UserSecrets\<guid>\secrets.json`
- **Linux:** `~/.microsoft/usersecrets/<guid>/secrets.json`

### Azure Key Vault Integration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    var keyVaultUri = builder.Configuration["KeyVault:Uri"]!;
    builder.Configuration.AddAzureKeyVault(
        new Uri(keyVaultUri),
        new DefaultAzureCredential());
}

// Secrets in Key Vault are accessed with the same IConfiguration API:
// Key Vault secret named "ConnectionStrings--Sage" maps to
// Configuration["ConnectionStrings:Sage"]
// (Azure Key Vault uses -- as the section separator)
```

### Environment Variables

```bash
# Environment variables use __ (double underscore) as section separator
export ConnectionStrings__Default="Server=prod-sql;Database=BNBuilders;..."
export ErpIntegration__BaseUrl="https://erp.bnbuilders.com/api"
export ErpIntegration__Enabled="true"
```

---

## Common Patterns

1. **One Options class per configuration section.** Do not create a giant
   `AppSettings` class. Keep options focused: `ErpIntegrationOptions`,
   `ReportingOptions`, `EmailOptions`.

2. **Extension method for registration:**

```csharp
public static class ErpServiceExtensions
{
    public static IServiceCollection AddErpIntegration(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<ErpIntegrationOptions>()
            .Bind(configuration.GetSection(ErpIntegrationOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddScoped<IErpSyncService, ErpSyncService>();
        return services;
    }
}
```

3. **Named options** for multiple instances of the same configuration shape:

```csharp
builder.Services.Configure<DatabaseOptions>("Sage",
    builder.Configuration.GetSection("Databases:Sage"));
builder.Services.Configure<DatabaseOptions>("Viewpoint",
    builder.Configuration.GetSection("Databases:Viewpoint"));

// Resolve with IOptionsSnapshot<DatabaseOptions>:
var sage = optionsSnapshot.Get("Sage");
```

4. **Post-configure** for defaults that depend on other configuration using
   `PostConfigure<T>()` — runs after all `Configure<T>` calls.

---

## Gotchas and Pitfalls

- **Secrets in appsettings.json.** Never commit connection strings with passwords, API
  keys, or tokens to source control. Use User Secrets for development, environment
  variables or Key Vault for production.

- **`IOptions<T>` never updates.** If you change `appsettings.json` at runtime,
  `IOptions<T>` still returns the startup value. Use `IOptionsSnapshot<T>` (scoped) or
  `IOptionsMonitor<T>` (singleton) for hot reload.

- **Environment variable naming.** Use `__` (double underscore) as the hierarchy
  separator, not `:`. The colon works on Linux but not in all shells. Double underscore
  is universally safe.

- **Missing `ValidateOnStart()`.** Without this, invalid configuration is only discovered
  when the options are first resolved — potentially long after the app starts. Always
  validate on start for critical settings.

- **Case sensitivity.** JSON keys in `appsettings.json` are case-insensitive. Environment
  variables are case-sensitive on Linux but insensitive on Windows. Be consistent.

- **Array binding.** Binding arrays from environment variables uses index-based keys:
  `AllowedHosts__0=host1`, `AllowedHosts__1=host2`. This is non-obvious and error-prone.

- **Configuration reload and singletons.** If a singleton reads `IOptions<T>` at
  construction time and caches the value, it will never see updates. Use
  `IOptionsMonitor<T>` for singletons that need live configuration.

---

## Performance Considerations

- **`IOptions<T>`** is a singleton and the fastest — no per-request overhead. Use it
  when configuration does not change at runtime.

- **`IOptionsSnapshot<T>`** re-reads configuration on each scope creation (each HTTP
  request). This adds minor overhead but is necessary for hot-reload scenarios.

- **`IOptionsMonitor<T>`** uses a callback model, so it only does work when
  configuration actually changes. Good for singletons and background services.

- **Configuration providers** are read once at startup (or on file change). There is no
  per-request I/O cost for reading configuration values.

- **Azure Key Vault** has rate limits and network latency. Use the
  `AzureKeyVaultConfigurationOptions.ReloadInterval` to control how often secrets are
  refreshed (default: no automatic reload).

- Avoid calling `IConfiguration.GetSection()` in hot paths. Resolve the section once
  and bind to an options object.

---

## BNBuilders Context

- **Connection strings** — BNBuilders likely connects to multiple databases: the main
  app database, Sage or Viewpoint ERP, and possibly Procore's API. Each gets its own
  connection string, managed per environment.

- **User Secrets for development** — Developers should never have production database
  credentials on their machines. User Secrets keeps dev-environment credentials out of
  source control.

- **Azure Key Vault for production** — Store the Sage database password, JWT signing key,
  and any API keys in Key Vault. The app pulls them at startup using Managed Identity.

- **Feature flags via configuration** — Toggle ERP sync on/off per environment. The
  sandbox environment runs with `ErpIntegration:Enabled = false` so developers do not
  accidentally sync test data to production.

- **Reporting options** — Different environments write reports to different file shares.
  `appsettings.Production.json` points to the production file server;
  `appsettings.Development.json` points to a local folder.

- **Named options for multiple ERPs** — If BNBuilders has different ERP systems per
  region or division, named options let you configure each separately while using the
  same `ErpIntegrationOptions` class.

---

## Interview / Senior Dev Questions

1. **What is the order of precedence for configuration providers, and why does it
   matter?**
   Later providers override earlier ones. The default order is: `appsettings.json` ->
   `appsettings.{env}.json` -> User Secrets -> Environment Variables -> Command Line.
   This lets you set defaults in JSON and override with environment variables in
   production without changing files.

2. **Explain the difference between `IOptions<T>`, `IOptionsSnapshot<T>`, and
   `IOptionsMonitor<T>`.**
   `IOptions<T>` is singleton, read once. `IOptionsSnapshot<T>` is scoped, re-reads per
   request. `IOptionsMonitor<T>` is singleton with change callbacks. Use `IOptions` for
   static config, `IOptionsSnapshot` for web request scopes, `IOptionsMonitor` for
   background services that need live updates.

3. **How do you prevent the app from starting if a required configuration value is
   missing?**
   Use `ValidateDataAnnotations()` with `[Required]` on the options property, combined
   with `ValidateOnStart()`. The app throws `OptionsValidationException` at startup if
   the value is missing.

4. **Why should you never inject `IConfiguration` directly into business logic?**
   It couples your code to the configuration shape, makes testing harder (you need to
   mock the entire configuration tree), and provides no compile-time safety. The Options
   pattern gives you strongly-typed, validated, testable configuration access.

---

## Quiz

**Question 1:** You change a value in `appsettings.json` while the app is running.
Which options interface will reflect the new value on the next HTTP request?

<details>
<summary>Answer</summary>

**`IOptionsSnapshot<T>`** and **`IOptionsMonitor<T>`** will reflect the change.
`IOptions<T>` will not — it reads the value once at startup and never updates.

`IOptionsSnapshot<T>` re-reads on each new scope (HTTP request).
`IOptionsMonitor<T>` detects the file change and fires `OnChange`.
</details>

---

**Question 2:** What is the environment variable equivalent of the JSON configuration
key `ConnectionStrings:Sage`?

<details>
<summary>Answer</summary>

`ConnectionStrings__Sage`

Use double underscore (`__`) as the hierarchy separator for environment variables. The
colon (`:`) works on some platforms but not all. Double underscore is universally safe.
</details>

---

**Question 3:** You add `[Required]` to an options property and call
`.ValidateDataAnnotations()`, but the app starts fine even when the value is missing.
What did you forget?

<details>
<summary>Answer</summary>

You forgot to call **`.ValidateOnStart()`**. Without it, validation only runs when the
options are first resolved from DI — which might be long after startup. Adding
`ValidateOnStart()` forces validation during application startup, failing fast if the
configuration is invalid.

```csharp
builder.Services.AddOptions<MyOptions>()
    .Bind(builder.Configuration.GetSection("MySection"))
    .ValidateDataAnnotations()
    .ValidateOnStart();  // <-- this is required for startup validation
```
</details>

---

**Question 4:** Why is Azure Key Vault preferred over environment variables for storing
secrets in production?

<details>
<summary>Answer</summary>

1. **Access control** — Key Vault supports fine-grained RBAC and audit logging.
2. **Rotation** — Secrets can be rotated without redeploying or restarting the app
   (with `IOptionsMonitor` and reload interval).
3. **Encryption** — Secrets are encrypted at rest and in transit.
4. **No exposure risk** — Environment variables can leak in diagnostic dumps, crash
   reports, and process listings. Key Vault secrets are only accessible through
   authenticated API calls.
5. **Centralized management** — One Key Vault serves multiple apps and environments.
</details>
