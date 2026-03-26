# NuGet Package Management

NuGet is the package manager for .NET. Every non-trivial C# project depends on NuGet
packages. This lesson covers adding, removing, updating, and publishing packages, as
well as managing package sources and resolving version conflicts.

---

## Adding Packages

```bash
# Add the latest stable version
dotnet add package Serilog

# Add a specific version
dotnet add package Serilog --version 4.2.0

# Add a prerelease version
dotnet add package Serilog --prerelease

# Add to a specific project (from solution root)
dotnet add src/Infrastructure/Infrastructure.csproj package Npgsql.EntityFrameworkCore.PostgreSQL
```

This modifies the `.csproj` file:

```xml
<ItemGroup>
  <PackageReference Include="Serilog" Version="4.2.0" />
</ItemGroup>
```

> **Tip:** You can also edit the `.csproj` directly and run `dotnet restore`. This is
> faster when adding multiple packages at once.

---

## Removing Packages

```bash
dotnet remove package Serilog

# Remove from a specific project
dotnet remove src/Api/Api.csproj package Swashbuckle.AspNetCore
```

---

## Listing Packages

```bash
# List all packages in a project
dotnet list package

# List packages across the entire solution
dotnet list package --include-transitive

# Show only outdated packages
dotnet list package --outdated

# Show only packages with known vulnerabilities
dotnet list package --vulnerable

# Show only deprecated packages
dotnet list package --deprecated

# Combine flags
dotnet list package --outdated --include-transitive
```

### Example Output of --outdated

```
Project 'Api' has the following updates to its packages
   [net9.0]:
   Top-level Package          Requested   Resolved   Latest
   > Serilog                  4.1.0       4.1.0      4.2.0
   > Swashbuckle.AspNetCore   6.5.0       6.5.0      6.9.0
```

> **Note:** `--outdated` checks against all configured NuGet sources. If you use private
> feeds, make sure they are configured in `NuGet.config` or the check will be incomplete.

---

## Restoring Packages

```bash
# Restore all packages for the solution
dotnet restore

# Restore with a lock file (for reproducible builds)
dotnet restore --use-lock-file

# Fail if the lock file is out of date (CI mode)
dotnet restore --locked-mode

# Force re-download of all packages
dotnet restore --force

# Restore from a specific source only
dotnet restore --source https://api.nuget.org/v3/index.json
```

> **Important:** Always commit `packages.lock.json` to source control and use
> `--locked-mode` in CI. This prevents "it works on my machine" issues caused by
> floating dependency resolution.

---

## Package Versioning

NuGet supports several version specification formats in `.csproj`:

| Format | Meaning | Example |
|---|---|---|
| `4.2.0` | Minimum version (inclusive) | >= 4.2.0 |
| `[4.2.0]` | Exact version | == 4.2.0 |
| `[4.1.0, 4.3.0)` | Range (inclusive lower, exclusive upper) | >= 4.1.0 and < 4.3.0 |
| `4.2.*` | Latest patch of 4.2 | >= 4.2.0 and < 4.3.0 |
| `*` | Latest version | Any version |

```xml
<!-- Exact version -->
<PackageReference Include="Newtonsoft.Json" Version="[13.0.3]" />

<!-- Range: any 8.x version -->
<PackageReference Include="AutoMapper" Version="[8.0.0, 9.0.0)" />

<!-- Floating: latest patch -->
<PackageReference Include="Serilog" Version="4.2.*" />
```

> **Warning:** Floating versions (`*`) make builds non-reproducible. Use them during
> development but pin exact versions in `Directory.Packages.props` for production.

---

## NuGet.config — Configuring Sources

Create a `NuGet.config` at the repository root to control where packages come from:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    <add key="company-feed" value="https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json" />
  </packageSources>

  <packageSourceMapping>
    <packageSource key="nuget.org">
      <package pattern="*" />
    </packageSource>
    <packageSource key="company-feed">
      <package pattern="MyCompany.*" />
    </packageSource>
  </packageSourceMapping>

  <packageSourceCredentials>
    <company-feed>
      <add key="Username" value="az" />
      <add key="ClearTextPassword" value="%FEED_PAT%" />
    </company-feed>
  </packageSourceCredentials>
</configuration>
```

### Key Concepts

- **`<clear />`** removes all inherited sources (machine-level, user-level). Always start
  with this for reproducibility.
- **Package Source Mapping** controls which packages come from which feed. This prevents
  dependency confusion attacks.
- **Credentials** can use environment variables for secrets.

> **Caution:** Never commit real passwords or PATs to `NuGet.config`. Use environment
> variables or Azure Artifacts Credential Provider for authentication.

---

## Private Package Feeds

### Azure Artifacts

```bash
# Install the credential provider
dotnet tool install -g artifacts-credprovider

# Restore with interactive auth
dotnet restore --interactive
```

### GitHub Packages

Add to `NuGet.config`:

```xml
<add key="github"
     value="https://nuget.pkg.github.com/OWNER/index.json" />
```

Authenticate with a personal access token via `packageSourceCredentials`.

### Local Folder as a Feed

```bash
# Create a local feed directory
mkdir -p /home/tiger/local-nuget-feed

# Add to NuGet.config
# <add key="local" value="/home/tiger/local-nuget-feed" />

# Push a package to the local feed
dotnet nuget push MyPackage.1.0.0.nupkg --source /home/tiger/local-nuget-feed
```

---

## Transitive Dependencies

When your project references Package A, and Package A depends on Package B, then Package B
is a **transitive dependency** of your project.

```bash
# See the full dependency tree
dotnet list package --include-transitive
```

```
Project 'Api' has the following package references
   [net9.0]:
   Top-level Package                         Requested   Resolved
   > Serilog.AspNetCore                      9.0.0       9.0.0

   Transitive Package                                    Resolved
   > Serilog                                             4.2.0
   > Serilog.Sinks.Console                               6.0.0
   > Serilog.Sinks.File                                  6.0.0
```

### Resolving Version Conflicts

When two packages require different versions of the same transitive dependency, NuGet uses
the **nearest wins** rule: the version closest to your project in the dependency graph wins.

To force a specific version, add a direct `PackageReference`:

```xml
<!-- Force Serilog 4.2.0 even if a transitive dependency wants 4.1.0 -->
<PackageReference Include="Serilog" Version="4.2.0" />
```

> **Tip:** Run `dotnet build` with `-v detailed` to see exactly how NuGet resolves
> conflicting versions. Look for "Resolving conflicts" in the output.

---

## Commonly Used NuGet Packages

| Package | Purpose | Install Command |
|---|---|---|
| `Serilog.AspNetCore` | Structured logging | `dotnet add package Serilog.AspNetCore` |
| `MediatR` | Mediator pattern / CQRS | `dotnet add package MediatR` |
| `FluentValidation` | Validation rules | `dotnet add package FluentValidation` |
| `AutoMapper` | Object mapping | `dotnet add package AutoMapper` |
| `Polly` | Resilience / retry policies | `dotnet add package Polly` |
| `Dapper` | Lightweight ORM | `dotnet add package Dapper` |
| `Npgsql.EntityFrameworkCore.PostgreSQL` | EF Core for PostgreSQL | `dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL` |
| `StackExchange.Redis` | Redis client | `dotnet add package StackExchange.Redis` |
| `Moq` | Mocking framework | `dotnet add package Moq` |
| `Bogus` | Fake data generator | `dotnet add package Bogus` |
| `BenchmarkDotNet` | Performance benchmarking | `dotnet add package BenchmarkDotNet` |
| `xunit` | Test framework | `dotnet add package xunit` |

---

## Creating and Publishing Your Own NuGet Package

### Step 1: Configure the .csproj

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <PackageId>MyCompany.Utilities</PackageId>
    <Version>1.0.0</Version>
    <Authors>Your Name</Authors>
    <Description>Shared utility functions for MyCompany projects</Description>
    <PackageLicenseExpression>MIT</PackageLicenseExpression>
    <PackageReadmeFile>README.md</PackageReadmeFile>
    <GeneratePackageOnBuild>false</GeneratePackageOnBuild>
  </PropertyGroup>

  <ItemGroup>
    <None Include="README.md" Pack="true" PackagePath="\" />
  </ItemGroup>
</Project>
```

### Step 2: Pack

```bash
dotnet pack -c Release

# Output: bin/Release/MyCompany.Utilities.1.0.0.nupkg
```

### Step 3: Publish

```bash
# To nuget.org
dotnet nuget push bin/Release/MyCompany.Utilities.1.0.0.nupkg \
  --api-key YOUR_API_KEY \
  --source https://api.nuget.org/v3/index.json

# To a private feed
dotnet nuget push bin/Release/MyCompany.Utilities.1.0.0.nupkg \
  --source company-feed

# To a local folder
dotnet nuget push bin/Release/MyCompany.Utilities.1.0.0.nupkg \
  --source /home/tiger/local-nuget-feed
```

### Step 4: Verify

```bash
# List packages in a source
dotnet nuget list source

# Search for your package
dotnet package search MyCompany.Utilities
```

> **Important:** Once a package version is published to nuget.org, it cannot be deleted
> or modified. You can only unlist it. Always test with a local feed or a private feed
> before publishing to nuget.org.

---

## Managing NuGet Cache

```bash
# Show cache locations
dotnet nuget locals all --list

# Clear all caches
dotnet nuget locals all --clear

# Clear only the HTTP cache
dotnet nuget locals http-cache --clear

# Clear only the global packages folder
dotnet nuget locals global-packages --clear
```

> **Tip:** If a package restore behaves strangely or uses a stale version, clearing the
> cache with `dotnet nuget locals all --clear` often fixes the problem.

---

## Summary

- Use `dotnet add package` and `dotnet remove package` for daily package management.
- Use `dotnet list package --outdated` regularly to keep dependencies current.
- Configure `NuGet.config` with `<clear />` and package source mapping for security.
- Use `Directory.Packages.props` for centralized version management in multi-project solutions.
- Pin exact versions in production; use `packages.lock.json` with `--locked-mode` in CI.
- Creating your own NuGet package is straightforward: configure `.csproj`, `dotnet pack`, `dotnet nuget push`.
