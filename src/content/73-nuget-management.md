# NuGet Package Management

NuGet is the package manager for .NET. Every non-trivial C# project depends on NuGet packages. This lesson covers adding, removing, updating, and managing packages using both Visual Studio 2026 and the dotnet CLI, as well as managing package sources and resolving version conflicts.

---

## Adding Packages — CLI

```powershell
# Add the latest stable version
dotnet add package Serilog

# Add a specific version
dotnet add package Serilog --version 4.2.0

# Add a prerelease version
dotnet add package Serilog --prerelease

# Add to a specific project
dotnet add src/MyApp/MyApp.csproj package Serilog
```

Each `dotnet add package` command updates the `.csproj` file:

```xml
<ItemGroup>
  <PackageReference Include="Serilog" Version="4.2.0" />
</ItemGroup>
```

---

## Adding Packages — Visual Studio

1. Right-click your project in Solution Explorer
2. **Manage NuGet Packages...**
3. **Browse** tab — search for the package
4. Select the version and click **Install**
5. Review changes and accept license

### NuGet Package Manager shortcuts

| Action | Where |
|---|---|
| Manage packages for one project | Right-click project > Manage NuGet Packages |
| Manage packages for entire solution | Tools > NuGet Package Manager > Manage NuGet Packages for Solution |
| Package Manager Console (PowerShell) | Tools > NuGet Package Manager > Package Manager Console |

### Package Manager Console commands

```powershell
# These run inside VS's Package Manager Console (PMC)
Install-Package Serilog
Install-Package Serilog -Version 4.2.0
Update-Package Serilog
Uninstall-Package Serilog

# EF Core migrations (PMC-specific)
Add-Migration InitialCreate
Update-Database
```

> **Note:** PMC commands are Visual Studio-specific. In a terminal, use `dotnet add package` and `dotnet ef` instead.

---

## Removing Packages

```powershell
# CLI
dotnet remove package Serilog

# Or manually delete the <PackageReference> line from .csproj
```

In Visual Studio: Manage NuGet Packages > **Installed** tab > select package > **Uninstall**.

---

## Updating Packages

```powershell
# Check for outdated packages
dotnet list package --outdated

# Update a specific package
dotnet add package Serilog  # without --version, gets latest stable

# Update all packages (use dotnet-outdated tool)
dotnet tool install -g dotnet-outdated-tool
dotnet outdated --upgrade
```

In Visual Studio: Manage NuGet Packages > **Updates** tab > **Update All** or update individually.

---

## Listing Packages

```powershell
# List all packages in a project
dotnet list package

# List all packages in the solution
dotnet list package --include-transitive

# Show outdated packages
dotnet list package --outdated

# Show vulnerable packages
dotnet list package --vulnerable
```

---

## Package Sources

By default, NuGet pulls packages from `nuget.org`. You can add private feeds for work packages.

### Viewing configured sources

```powershell
dotnet nuget list source
```

### Adding a private feed

```powershell
# Add an Azure Artifacts feed
dotnet nuget add source "https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json" --name "WorkFeed" --username "user" --password "PAT" --store-password-in-clear-text
```

### NuGet.Config file

You can also configure sources per-solution with a `NuGet.Config` file at the solution root:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    <add key="WorkFeed" value="https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json" />
  </packageSources>
</configuration>
```

> **Tip:** The `<clear />` tag ensures only the sources you define are used, preventing unexpected package resolution.

---

## Central Package Management

For solutions with many projects, **Central Package Management (CPM)** lets you define package versions in one place.

### Setup

Create `Directory.Packages.props` at the solution root:

```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="Serilog" Version="4.2.0" />
    <PackageVersion Include="Dapper" Version="2.1.35" />
    <PackageVersion Include="xunit" Version="2.9.0" />
  </ItemGroup>
</Project>
```

### In each .csproj (no version needed)

```xml
<ItemGroup>
  <PackageReference Include="Serilog" />
  <PackageReference Include="Dapper" />
</ItemGroup>
```

This ensures every project uses the same version of every package.

---

## Resolving Version Conflicts

When two projects reference different versions of the same package, NuGet uses the **nearest-wins** rule: the version closest to the project being built wins.

### Diagnosing conflicts

```powershell
# Show the full dependency tree
dotnet list package --include-transitive

# Build with detailed output to see binding redirects
dotnet build -v detailed
```

### Fixing conflicts

1. **Pin the version** in `Directory.Packages.props` (if using CPM)
2. **Explicitly add** the conflicting package to the project that needs it
3. Use `<PackageReference Update="..." Version="..." />` in `Directory.Build.props` to force a version globally

---

## Package Security

```powershell
# Check for known vulnerabilities
dotnet list package --vulnerable

# Audit all packages
dotnet nuget audit
```

### Lock files

Enable package lock files to ensure reproducible restores:

```xml
<!-- In Directory.Build.props or .csproj -->
<PropertyGroup>
  <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
</PropertyGroup>
```

This generates `packages.lock.json` which should be committed to source control.

---

## Common Packages for Data Engineers

| Package | Purpose |
|---|---|
| `Dapper` | Lightweight ORM / micro-ORM |
| `Microsoft.Data.SqlClient` | SQL Server connectivity |
| `Oracle.ManagedDataAccess.Core` | Oracle connectivity |
| `Serilog` + sinks | Structured logging |
| `CsvHelper` | CSV reading/writing |
| `Parquet.Net` | Parquet file support |
| `Polly` | Retry and resilience |
| `BenchmarkDotNet` | Performance benchmarking |
| `xunit` | Unit testing framework |
