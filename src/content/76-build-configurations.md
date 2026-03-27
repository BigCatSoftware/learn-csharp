# Build Configurations and Environments

Understanding how Debug and Release builds differ, how to use conditional compilation, and how to manage environment-specific configuration is essential for professional .NET development. This lesson covers the entire configuration story from Visual Studio build settings to runtime environment management.

---

## Debug vs Release Builds

When you click **Start** in Visual Studio or run `dotnet build`, the default configuration is **Debug**. When you publish for production, you use **Release**. The differences are significant.

| Aspect | Debug | Release |
|---|---|---|
| Optimization | Disabled (`/optimize-`) | Enabled (`/optimize+`) |
| Debug symbols | Full PDB | Portable PDB (smaller) |
| `DEBUG` constant | Defined | Not defined |
| `TRACE` constant | Defined | Defined |
| Assertions | Active | Active (via TRACE) |
| JIT behavior | No inlining, extra checks | Full inlining, optimized |
| Performance | Slower (by design) | Production speed |
| Binary size | Larger | Smaller |

### Switching configurations in Visual Studio

- **Toolbar dropdown:** Select Debug or Release from the configuration dropdown next to the Start button
- **Configuration Manager:** Build > Configuration Manager — control per-project settings

### Switching configurations from CLI

```powershell
# Debug build (default)
dotnet build

# Release build
dotnet build -c Release

# Run in Release mode
dotnet run -c Release
```

---

## Conditional Compilation

Use `#if` directives to include or exclude code based on build configuration.

```csharp
public class DataPipeline
{
    public void Execute()
    {
#if DEBUG
        Console.WriteLine("Pipeline starting — debug mode");
        var stopwatch = Stopwatch.StartNew();
#endif

        // Production code runs in both configurations
        ProcessAllBatches();

#if DEBUG
        stopwatch.Stop();
        Console.WriteLine($"Pipeline completed in {stopwatch.ElapsedMilliseconds}ms");
#endif
    }
}
```

### Common conditional symbols

| Symbol | Defined When |
|---|---|
| `DEBUG` | Debug configuration |
| `TRACE` | Both Debug and Release |
| `NET10_0` | Targeting .NET 10 |
| `WINDOWS` | Targeting Windows |

### Defining custom symbols

In your `.csproj`:

```xml
<PropertyGroup Condition="'$(Configuration)' == 'Debug'">
  <DefineConstants>$(DefineConstants);ENABLE_LOGGING;ENABLE_METRICS</DefineConstants>
</PropertyGroup>
```

Or in Visual Studio: Project Properties > Build > General > **Conditional compilation symbols**.

Use in code:

```csharp
#if ENABLE_LOGGING
    logger.LogDebug("Batch {Id} processed {Count} rows", batchId, rowCount);
#endif
```

> **Best practice:** Prefer runtime configuration (appsettings, environment variables) over conditional compilation. Use `#if` only when you need code to be completely absent from the binary.

---

## Custom Build Configurations

Beyond Debug and Release, you can create custom configurations for specific environments.

### Creating in Visual Studio

1. **Build > Configuration Manager**
2. **Active solution configuration** dropdown > **New...**
3. Name it (e.g., `Staging`, `QA`)
4. Copy settings from Release
5. Configure per-project settings as needed

### Defining in .csproj

```xml
<PropertyGroup Condition="'$(Configuration)' == 'Staging'">
  <DefineConstants>$(DefineConstants);STAGING</DefineConstants>
  <Optimize>true</Optimize>
</PropertyGroup>
```

Build with:

```powershell
dotnet build -c Staging
```

---

## MSBuild Properties and Targets

The `.csproj` file is an MSBuild file. Understanding key properties gives you full control over builds.

### Common properties

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <OutputType>Exe</OutputType>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <WarningLevel>7</WarningLevel>
    <AssemblyVersion>1.0.0.0</AssemblyVersion>
    <InformationalVersion>1.0.0-beta.1</InformationalVersion>
  </PropertyGroup>
</Project>
```

### Directory.Build.props

Apply settings to every project in the solution. Place this file at the solution root:

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
```

Every project in or below the directory inherits these settings. Individual `.csproj` files can override them.

### Directory.Build.targets

Runs after individual project files. Useful for post-build actions:

```xml
<Project>
  <Target Name="PrintBuildInfo" AfterTargets="Build">
    <Message Importance="high" Text="Built $(MSBuildProjectName) in $(Configuration) mode" />
  </Target>
</Project>
```

---

## Environment-Specific Configuration

### appsettings.json hierarchy

ASP.NET Core and generic host applications load configuration in layers:

```
appsettings.json                    ← base (always loaded)
appsettings.Development.json        ← overrides for Development
appsettings.Staging.json            ← overrides for Staging
appsettings.Production.json         ← overrides for Production
Environment variables               ← override everything
User secrets                        ← Development only (never committed)
```

Each layer overrides values from the previous one.

### Setting the environment

```powershell
# PowerShell — current session
$env:ASPNETCORE_ENVIRONMENT = "Development"

# PowerShell — persistent for user
[Environment]::SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development", "User")
```

In Visual Studio: Project Properties > Debug > **Environment variables** > Add `ASPNETCORE_ENVIRONMENT` = `Development`.

Or in `launchSettings.json` (automatically created by VS):

```json
{
  "profiles": {
    "MyApp": {
      "commandName": "Project",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development"
      }
    }
  }
}
```

### User Secrets for development

User secrets keep sensitive values out of source control:

```powershell
# Initialize (creates a UserSecretsId in .csproj)
dotnet user-secrets init

# Set a value
dotnet user-secrets set "Database:ConnectionString" "Server=localhost;Database=Dev;Trusted_Connection=true"

# List all secrets
dotnet user-secrets list
```

In Visual Studio: Right-click project > **Manage User Secrets** — opens `secrets.json` directly.

Secrets are stored at `%APPDATA%\Microsoft\UserSecrets\<guid>\secrets.json` and are **only loaded when the environment is Development**.

---

## Launch Profiles in Visual Studio

`launchSettings.json` (in `Properties/`) controls how VS launches your application.

```json
{
  "profiles": {
    "https": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": true,
      "applicationUrl": "https://localhost:7001;http://localhost:5001",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development"
      }
    },
    "Docker": {
      "commandName": "Docker",
      "launchBrowser": true,
      "launchUrl": "{Scheme}://{ServiceHost}:{ServicePort}"
    }
  }
}
```

Switch profiles from the **Start** button dropdown in the toolbar.

> **Note:** `launchSettings.json` is for **local development only**. It is not used in production. Add it to `.gitignore` if it contains machine-specific paths.

---

## Analyzers and Code Quality

### Built-in analyzers

.NET ships with Roslyn analyzers that run during build:

```xml
<PropertyGroup>
  <AnalysisLevel>latest</AnalysisLevel>
  <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
</PropertyGroup>
```

### .editorconfig rules

```ini
# .editorconfig at solution root

[*.cs]
# Prefer var when type is apparent
csharp_style_var_for_built_in_types = false:suggestion
csharp_style_var_when_type_is_apparent = true:suggestion
csharp_style_var_elsewhere = false:suggestion

# Prefer file-scoped namespaces
csharp_style_namespace_declarations = file_scoped:warning

# Naming rules
dotnet_naming_rule.private_fields_should_be_camel_case.severity = warning
dotnet_naming_rule.private_fields_should_be_camel_case.symbols = private_fields
dotnet_naming_rule.private_fields_should_be_camel_case.style = camel_case_style

dotnet_naming_symbols.private_fields.applicable_kinds = field
dotnet_naming_symbols.private_fields.applicable_accessibilities = private

dotnet_naming_style.camel_case_style.capitalization = camel_case
dotnet_naming_style.camel_case_style.required_prefix = _
```

### Severity levels

| Level | Effect |
|---|---|
| `none` | Disabled |
| `silent` | Not shown in editor but still applies |
| `suggestion` | Gray dots in editor |
| `warning` | Green squiggles, appears in Error List |
| `error` | Red squiggles, fails the build |
