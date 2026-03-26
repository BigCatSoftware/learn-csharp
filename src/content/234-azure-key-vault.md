# Azure Key Vault

*Chapter 15.5 — Azure Key Vault*

## Overview

Azure Key Vault is a cloud service for securely storing and accessing secrets, encryption
keys, and certificates. For Data Engineers, it solves the perennial problem of "where do I
put the database password?" — the answer is never in `appsettings.json`, never in source
control, and never in environment variables on shared servers.

At BNBuilders, Key Vault stores:

- **Connection strings** for Azure SQL, Sage 300, and Procore APIs.
- **API keys** for third-party services (Bluebeam, PlanGrid, weather APIs).
- **Certificates** for service-to-service authentication.
- **Encryption keys** for sensitive data at rest (employee SSNs, financial data).

This lesson covers:

- **Storing and retrieving secrets** from C# using `Azure.Security.KeyVault.Secrets`.
- **Managed Identity** — Accessing Key Vault without any credentials in your code.
- **`DefaultAzureCredential`** — The unified authentication approach.
- **Configuration provider** — Integrating Key Vault with `IConfiguration`.
- **Secret rotation** — Updating secrets without redeploying applications.

## Core Concepts

### What Key Vault Stores

| Type | What | Example |
|------|------|---------|
| **Secrets** | Any string value | Connection strings, API keys, passwords |
| **Keys** | Cryptographic keys (RSA, EC) | Data encryption, JWT signing |
| **Certificates** | X.509 certificates | TLS/SSL, client auth |

For Data Engineers, secrets are the most commonly used feature. Keys and certificates are
typically managed by the security or infrastructure team.

### Access Control

Key Vault uses Azure RBAC (Role-Based Access Control):

| Role | Can Do | Assign To |
|------|--------|-----------|
| Key Vault Administrator | Full access to secrets, keys, certs | Infrastructure team |
| Key Vault Secrets User | Read secrets only | Application managed identity |
| Key Vault Secrets Officer | Read + write secrets | Pipeline service principal |
| Key Vault Crypto User | Use keys for encrypt/decrypt | Application needing encryption |

```bash
# Grant your app's managed identity access to secrets
az role assignment create \
    --role "Key Vault Secrets User" \
    --assignee <managed-identity-object-id> \
    --scope /subscriptions/<sub>/resourceGroups/bnbuilders-rg/providers/Microsoft.KeyVault/vaults/bnbuilders-kv
```

### DefaultAzureCredential

`DefaultAzureCredential` tries multiple authentication methods in order:

```
1. Environment variables (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET)
2. Workload Identity (Kubernetes)
3. Managed Identity (Azure VM, App Service, Functions)
4. Azure CLI (az login)
5. Azure PowerShell (Connect-AzAccount)
6. Visual Studio (logged-in user)
7. Azure Developer CLI (azd)
```

This means the same code works locally (using Azure CLI credentials) and in production
(using Managed Identity) without any changes.

## Code Examples

### Basic Secret Operations

```csharp
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;

public class SecretManager
{
    private readonly SecretClient _client;

    public SecretManager(string vaultUri)
    {
        _client = new SecretClient(
            new Uri(vaultUri),
            new DefaultAzureCredential()
        );
    }

    /// <summary>
    /// Get a secret value.
    /// </summary>
    public async Task<string> GetSecretAsync(string secretName, CancellationToken ct = default)
    {
        KeyVaultSecret secret = await _client.GetSecretAsync(secretName, cancellationToken: ct);
        return secret.Value;
    }

    /// <summary>
    /// Set (create or update) a secret.
    /// </summary>
    public async Task SetSecretAsync(
        string secretName, string value, CancellationToken ct = default)
    {
        await _client.SetSecretAsync(secretName, value, ct);
    }

    /// <summary>
    /// Set a secret with metadata.
    /// </summary>
    public async Task SetSecretWithMetadataAsync(
        string secretName,
        string value,
        DateTimeOffset? expiresOn = null,
        Dictionary<string, string>? tags = null,
        CancellationToken ct = default)
    {
        var secret = new KeyVaultSecret(secretName, value);

        if (expiresOn.HasValue)
            secret.Properties.ExpiresOn = expiresOn;

        secret.Properties.ContentType = "text/plain";

        if (tags is not null)
        {
            foreach (var (key, tagValue) in tags)
                secret.Properties.Tags[key] = tagValue;
        }

        await _client.SetSecretAsync(secret, ct);
    }

    /// <summary>
    /// List all secrets (names only — values require individual Get calls).
    /// </summary>
    public async Task<List<string>> ListSecretNamesAsync(CancellationToken ct = default)
    {
        var names = new List<string>();

        await foreach (var properties in _client.GetPropertiesOfSecretsAsync(ct))
        {
            if (properties.Enabled == true)
                names.Add(properties.Name);
        }

        return names;
    }
}

// Usage
var manager = new SecretManager("https://bnbuilders-kv.vault.azure.net/");

// Get a connection string
string connectionString = await manager.GetSecretAsync("AzureSql-ConnectionString");

// Set an API key with expiration
await manager.SetSecretWithMetadataAsync(
    "Procore-ApiKey",
    "pk_live_abc123...",
    expiresOn: DateTimeOffset.UtcNow.AddMonths(6),
    tags: new Dictionary<string, string>
    {
        ["Environment"] = "Production",
        ["ManagedBy"] = "DataEngineering"
    });
```

### Configuration Provider Integration

The most powerful pattern: Key Vault secrets appear as `IConfiguration` values, just like
`appsettings.json` entries.

```csharp
// Program.cs — register Key Vault as a configuration source
using Azure.Identity;

var builder = WebApplication.CreateBuilder(args);

// Add Key Vault to the configuration pipeline
builder.Configuration.AddAzureKeyVault(
    new Uri("https://bnbuilders-kv.vault.azure.net/"),
    new DefaultAzureCredential()
);

// Now secrets are accessible via IConfiguration
builder.Services.AddSingleton(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();

    // Secret name "AzureSql--ConnectionString" maps to "AzureSql:ConnectionString"
    // (Key Vault uses -- as separator, IConfiguration uses :)
    var connectionString = config["AzureSql:ConnectionString"]
        ?? throw new InvalidOperationException("Missing connection string");

    return new SqlConnection(connectionString);
});
```

```csharp
// For console apps / pipeline workers
using Azure.Identity;
using Azure.Extensions.AspNetCore.Configuration.Secrets;

var config = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json", optional: true)
    .AddAzureKeyVault(
        new Uri("https://bnbuilders-kv.vault.azure.net/"),
        new DefaultAzureCredential())
    .Build();

// Access secrets like any other configuration
string sageApiUrl = config["Sage:ApiUrl"] ?? "";
string sageApiKey = config["Sage:ApiKey"] ?? "";

// Or bind to an options class
var options = new PipelineOptions();
config.GetSection("Pipeline").Bind(options);
```

### NuGet Packages Required

```xml
<ItemGroup>
    <!-- Core Key Vault secrets client -->
    <PackageReference Include="Azure.Security.KeyVault.Secrets" Version="4.7.0" />

    <!-- Azure Identity (DefaultAzureCredential) -->
    <PackageReference Include="Azure.Identity" Version="1.13.0" />

    <!-- Configuration provider (maps secrets to IConfiguration) -->
    <PackageReference Include="Azure.Extensions.AspNetCore.Configuration.Secrets"
                      Version="1.4.0" />
</ItemGroup>
```

### Caching Secrets for Performance

```csharp
using Microsoft.Extensions.Caching.Memory;

public class CachedSecretManager
{
    private readonly SecretClient _client;
    private readonly IMemoryCache _cache;
    private readonly TimeSpan _cacheDuration;

    public CachedSecretManager(
        SecretClient client,
        IMemoryCache cache,
        TimeSpan? cacheDuration = null)
    {
        _client = client;
        _cache = cache;
        _cacheDuration = cacheDuration ?? TimeSpan.FromMinutes(15);
    }

    public async Task<string> GetSecretAsync(string secretName, CancellationToken ct = default)
    {
        return await _cache.GetOrCreateAsync(
            $"kv:{secretName}",
            async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = _cacheDuration;

                var secret = await _client.GetSecretAsync(secretName, cancellationToken: ct);
                return secret.Value.Value;
            }) ?? throw new InvalidOperationException($"Secret '{secretName}' not found");
    }
}
```

### Using Key Vault in Dependency Injection

```csharp
// Register services with secrets from Key Vault
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using Microsoft.Extensions.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddBNBuildersServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Register SecretClient
        services.AddSingleton(sp =>
            new SecretClient(
                new Uri(configuration["KeyVault:Uri"]
                    ?? "https://bnbuilders-kv.vault.azure.net/"),
                new DefaultAzureCredential()));

        // Register services that need secrets
        services.AddScoped<ISageClient>(sp =>
        {
            var config = sp.GetRequiredService<IConfiguration>();
            return new SageClient(
                baseUrl: config["Sage:ApiUrl"] ?? throw new InvalidOperationException(),
                apiKey: config["Sage:ApiKey"] ?? throw new InvalidOperationException()
            );
        });

        services.AddScoped<IBlobStorageService>(sp =>
        {
            var config = sp.GetRequiredService<IConfiguration>();
            return new BlobStorageService(
                config["Storage:ConnectionString"]
                    ?? throw new InvalidOperationException()
            );
        });

        return services;
    }
}
```

## Common Patterns

### Secret Naming Conventions

```
Convention: {System}--{Component}--{Property}

Examples:
  AzureSql--ConnectionString          → config["AzureSql:ConnectionString"]
  Sage--ApiKey                        → config["Sage:ApiKey"]
  Sage--ApiUrl                        → config["Sage:ApiUrl"]
  Procore--ClientId                   → config["Procore:ClientId"]
  Procore--ClientSecret               → config["Procore:ClientSecret"]
  ServiceBus--ConnectionString        → config["ServiceBus:ConnectionString"]
  BlobStorage--ConnectionString       → config["BlobStorage:ConnectionString"]
```

Key Vault uses `--` as a separator because `/` is reserved for secret versions.
The configuration provider translates `--` to `:` for `IConfiguration`.

### Secret Rotation Strategy

```
1. Pipeline reads secret "AzureSql--ConnectionString" (version 1)
2. Admin creates a new version of the secret (version 2)
3. Old version remains active (both passwords work at the DB level)
4. Pipeline restarts (or cache expires) → reads version 2
5. After all consumers use version 2, admin disables version 1
6. Old password is removed from the database
```

```csharp
// Automatic reload with configuration provider
builder.Configuration.AddAzureKeyVault(
    new Uri("https://bnbuilders-kv.vault.azure.net/"),
    new DefaultAzureCredential(),
    new AzureKeyVaultConfigurationOptions
    {
        // Reload secrets every 5 minutes
        ReloadInterval = TimeSpan.FromMinutes(5)
    }
);
```

### Local Development Setup

```bash
# Login to Azure CLI (one time)
az login

# DefaultAzureCredential will use your CLI credentials locally
# No need to copy secrets to appsettings.json

# If you need to override locally, use user secrets:
dotnet user-secrets set "AzureSql:ConnectionString" "Server=localhost;..."
```

```csharp
// appsettings.Development.json — override Key Vault URI for dev
{
    "KeyVault": {
        "Uri": "https://bnbuilders-kv-dev.vault.azure.net/"
    }
}
```

## Gotchas and Pitfalls

1. **Secret name restrictions** — Names can only contain alphanumeric characters and hyphens.
   No underscores, dots, or slashes. Use `--` as the section separator (not `.` or `/`).

2. **Network latency** — Each secret retrieval is an HTTPS call. Fetching 20 secrets at
   startup adds seconds. Use the configuration provider (loads all at once) or cache secrets.

3. **Soft-delete is on by default** — Deleted secrets remain recoverable for 7-90 days.
   You cannot create a new secret with the same name until the deleted one is purged:

```bash
# Purge a soft-deleted secret
az keyvault secret purge --vault-name bnbuilders-kv --name old-secret
```

4. **Access policy vs RBAC** — Key Vault supports two authorization models. RBAC is the
   modern approach (uses Azure AD roles). Access policies are legacy. Do not mix them —
   pick one model per vault.

5. **Rate limiting** — Key Vault has throttling limits (typically 2000 transactions per
   10 seconds per vault). Bulk secret retrieval in a loop can hit this. Use the
   configuration provider's batch loading.

6. **Configuration provider does not reload by default** — Without `ReloadInterval`, secrets
   are loaded once at startup. If a secret changes, you must restart the application.

7. **Missing secret throws** — `GetSecretAsync` throws `RequestFailedException` (404) if
   the secret does not exist. Always handle this:

```csharp
try
{
    var secret = await client.GetSecretAsync("may-not-exist");
    return secret.Value.Value;
}
catch (Azure.RequestFailedException ex) when (ex.Status == 404)
{
    return defaultValue;
}
```

8. **Managed Identity takes ~1 second on first call** — The first `DefaultAzureCredential`
   authentication in a cold container adds ~1 second. Subsequent calls use a cached token.

## Performance Considerations

- **Batch load at startup** — The configuration provider loads all enabled secrets in one
  batch, typically in 1-3 seconds regardless of secret count. This is much faster than
  individual `GetSecretAsync` calls.

- **Cache aggressively** — Secrets change rarely (monthly rotation at most). Cache for
  5-15 minutes to avoid repeated network calls.

- **Token caching** — `DefaultAzureCredential` caches the Azure AD token automatically.
  The first call is slow (~1s); subsequent calls reuse the token until it expires (~1 hour).

- **Separate vaults per environment** — Do not mix dev and prod secrets in one vault.
  Separate vaults provide independent access control and rate limits.

- **Connection keep-alive** — The `SecretClient` maintains HTTP connections internally.
  Register it as a singleton (not transient) to reuse connections.

## BNBuilders Context

### Key Vault Layout

```
bnbuilders-kv-dev  (Development)
├── AzureSql--ConnectionString     → localhost or dev Azure SQL
├── Sage--ApiKey                   → sandbox API key
├── BlobStorage--ConnectionString  → dev storage account
└── ServiceBus--ConnectionString   → dev namespace

bnbuilders-kv-prod (Production)
├── AzureSql--ConnectionString     → production Azure SQL
├── Sage--ApiKey                   → production API key
├── Procore--ClientId              → production OAuth client
├── Procore--ClientSecret          → production OAuth secret
├── BlobStorage--ConnectionString  → production storage account
├── ServiceBus--ConnectionString   → production namespace
└── PowerBI--ServicePrincipalKey   → Power BI refresh automation
```

### Pipeline Configuration Flow

```csharp
// BNBuilders pipeline startup — clean, no secrets in code
public class Program
{
    public static async Task Main(string[] args)
    {
        var host = Host.CreateDefaultBuilder(args)
            .ConfigureAppConfiguration((context, config) =>
            {
                var builtConfig = config.Build();
                var vaultUri = builtConfig["KeyVault:Uri"];

                if (!string.IsNullOrEmpty(vaultUri))
                {
                    config.AddAzureKeyVault(
                        new Uri(vaultUri),
                        new DefaultAzureCredential(),
                        new AzureKeyVaultConfigurationOptions
                        {
                            ReloadInterval = TimeSpan.FromMinutes(10)
                        });
                }
            })
            .ConfigureServices((context, services) =>
            {
                services.AddBNBuildersServices(context.Configuration);
                services.AddHostedService<NightlyCostSyncWorker>();
            })
            .Build();

        await host.RunAsync();
    }
}
```

### Azure DevOps Integration

```yaml
# In azure-pipelines.yml — use AzureKeyVault task to inject secrets
steps:
  - task: AzureKeyVault@2
    inputs:
      azureSubscription: 'BNBuilders-Production'
      KeyVaultName: 'bnbuilders-kv-prod'
      SecretsFilter: 'AzureSql--ConnectionString,Sage--ApiKey'
      RunAsPreJob: true

  # Secrets are now available as pipeline variables
  - script: |
      dotnet test --logger trx -- \
        ConnectionStrings:AzureSql="$(AzureSql--ConnectionString)"
    displayName: 'Run integration tests'
```

## Interview / Senior Dev Questions

1. **Q: Why should connection strings be in Key Vault instead of `appsettings.json`?**
   A: `appsettings.json` is checked into source control, visible to all developers, and
   deployed alongside the application. Key Vault provides: (a) centralized secret
   management with audit logging, (b) RBAC access control (not everyone can see production
   secrets), (c) secret rotation without redeployment, (d) integration with Managed
   Identity for passwordless access.

2. **Q: How does `DefaultAzureCredential` work in different environments?**
   A: It tries multiple authentication methods in a chain. Locally, it uses Azure CLI
   or Visual Studio credentials. In Azure, it uses Managed Identity. In CI/CD, it uses
   environment variables or workload identity. This means the same code runs everywhere
   without conditional auth logic.

3. **Q: How would you handle secret rotation for an Azure SQL connection string?**
   A: (a) Create the new password in Azure SQL. (b) Update the Key Vault secret with the
   new connection string (creates a new version). (c) Wait for all applications to pick
   up the new version (via configuration reload or restart). (d) Remove the old password
   from Azure SQL. The key is having both passwords valid simultaneously during the
   transition.

4. **Q: What is the difference between Key Vault secrets and environment variables?**
   A: Environment variables are per-process, visible to anyone with server access, not
   audited, and not rotatable without restarting the process. Key Vault secrets are
   centrally managed, access-controlled with RBAC, fully audited (who accessed what, when),
   versioned, and rotatable without redeployment. Environment variables are acceptable for
   non-sensitive configuration; secrets belong in Key Vault.

## Quiz

**Question 1:** What Azure AD role should a production application's Managed Identity have
on Key Vault?

a) Key Vault Administrator
b) Key Vault Secrets User (read only)
c) Key Vault Contributor
d) Owner

<details>
<summary>Answer</summary>

**b) Key Vault Secrets User.** Applications should have the minimum necessary permissions.
"Secrets User" allows reading secret values, which is all a pipeline needs. "Administrator"
can create, delete, and manage secrets — too powerful for an application identity. Follow
the principle of least privilege.

</details>

**Question 2:** How do you make Key Vault secrets available as `IConfiguration` values?

a) Manually copy secrets to `appsettings.json` at deploy time
b) Use the `Azure.Extensions.AspNetCore.Configuration.Secrets` NuGet package
c) Set secrets as environment variables in the Dockerfile
d) Key Vault does not integrate with `IConfiguration`

<details>
<summary>Answer</summary>

**b) Use the `Azure.Extensions.AspNetCore.Configuration.Secrets` NuGet package.** Call
`config.AddAzureKeyVault(...)` in your configuration setup. All enabled secrets are loaded
and accessible via `IConfiguration["SecretName"]`. Secrets named with `--` separators
map to `:` in the configuration hierarchy.

</details>

**Question 3:** A Key Vault secret named `AzureSql--ConnectionString` maps to what
`IConfiguration` key?

a) `AzureSql--ConnectionString`
b) `AzureSql:ConnectionString`
c) `AzureSql.ConnectionString`
d) `AzureSql/ConnectionString`

<details>
<summary>Answer</summary>

**b) `AzureSql:ConnectionString`.** The Key Vault configuration provider translates `--`
(the Key Vault-safe separator) to `:` (the standard `IConfiguration` section separator).
This allows secrets to map naturally to hierarchical configuration sections.

</details>

**Question 4:** You deploy a new version of a secret in Key Vault, but your running
application still uses the old value. Why?

a) Key Vault has a propagation delay
b) The configuration provider loaded secrets at startup and does not reload by default
c) The old version is cached in Azure AD
d) You must delete the old version first

<details>
<summary>Answer</summary>

**b) The configuration provider loaded secrets at startup and does not reload by default.**
Without setting `ReloadInterval` in `AzureKeyVaultConfigurationOptions`, secrets are loaded
once. Set `ReloadInterval = TimeSpan.FromMinutes(5)` (or similar) to automatically pick up
new secret versions without restarting.

</details>

**Question 5:** What happens when you delete a secret in Key Vault?

a) It is permanently deleted immediately
b) It enters a soft-deleted state and can be recovered (default 90 days)
c) It is archived to Blob Storage
d) All applications using it crash immediately

<details>
<summary>Answer</summary>

**b) It enters a soft-deleted state and can be recovered.** Soft-delete is enabled by default
with a 90-day retention. This prevents accidental data loss but also means you cannot reuse
the secret name until the soft-deleted version is purged with
`az keyvault secret purge --vault-name <name> --name <secret>`.

</details>
