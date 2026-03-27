# Solutions and Projects Workflow

In .NET, **solutions** group related **projects** together. Understanding how to structure
and manage them from the command line is essential for professional C# development. This
lesson walks through the entire workflow, from creating a blank solution to building a
layered multi-project architecture.

---

## What Are .sln Files?

A `.sln` (solution) file is a text-based manifest that lists all the projects in a
codebase and their relationships. It is used by:

- `dotnet build` / `dotnet test` to know which projects to compile
- IDEs (Visual Studio, Rider, VS Code) to display the project tree
- CI pipelines to build everything in one command

> **Note:** A `.sln` file does not contain code. It is metadata — a table of contents
> for your projects.

### Anatomy of a .sln File

```
Microsoft Visual Studio Solution File, Format Version 12.00
Project("{FAE04EC0-...}") = "Api", "src\Api\Api.csproj", "{GUID}"
EndProject
Project("{FAE04EC0-...}") = "Domain", "src\Domain\Domain.csproj", "{GUID}"
EndProject
Global
  GlobalSection(SolutionConfigurationPlatforms) = preSolution
    Debug|Any CPU = Debug|Any CPU
    Release|Any CPU = Release|Any CPU
  EndGlobalSection
EndGlobal
```

You should never edit this file by hand. Use `dotnet sln` commands instead.

---

## Creating a Solution

```bash
# Create a solution named after the current directory
dotnet new sln

# Create a solution with a specific name
dotnet new sln -n MyCompany.OrderSystem

# Create in a specific directory
dotnet new sln -n MyApp -o /path/to/project
```

---

## Creating Projects

### Project Types

| Type | Template | Use Case |
|---|---|---|
| Console App | `console` | CLI tools, background jobs |
| Class Library | `classlib` | Shared logic, domain models |
| Web API | `webapi` | REST APIs |
| Worker Service | `worker` | Background services, message consumers |
| xUnit Tests | `xunit` | Unit and integration tests |
| NUnit Tests | `nunit` | Alternative test framework |
| Blazor | `blazor` | Web UI |

```bash
# Create projects in a conventional directory structure
dotnet new classlib -n Domain -o src/Domain
dotnet new classlib -n Application -o src/Application
dotnet new classlib -n Infrastructure -o src/Infrastructure
dotnet new webapi -n Api -o src/Api
dotnet new xunit -n Domain.Tests -o tests/Domain.Tests
dotnet new xunit -n Application.Tests -o tests/Application.Tests
dotnet new xunit -n Api.Tests -o tests/Api.Tests
```

> **Tip:** The `-o` flag controls the output directory. The `-n` flag controls the
> project name and root namespace. Always use both for a clean folder structure.

---

## Adding and Removing Projects from the Solution

```bash
# Add a single project
dotnet sln add src/Domain/Domain.csproj

# Add multiple projects at once
dotnet sln add src/Application/Application.csproj src/Infrastructure/Infrastructure.csproj

# Add all projects using a glob (bash)
dotnet sln add src/**/*.csproj tests/**/*.csproj

# Remove a project
dotnet sln remove src/OldProject/OldProject.csproj

# List all projects in the solution
dotnet sln list
```

Example output of `dotnet sln list`:

```
Project(s)
----------
src/Domain/Domain.csproj
src/Application/Application.csproj
src/Infrastructure/Infrastructure.csproj
src/Api/Api.csproj
tests/Domain.Tests/Domain.Tests.csproj
tests/Application.Tests/Application.Tests.csproj
tests/Api.Tests/Api.Tests.csproj
```

---

## Project References

Project references tell the build system that one project depends on another.

```bash
# Application depends on Domain
dotnet add src/Application/Application.csproj reference src/Domain/Domain.csproj

# Infrastructure depends on Application (which transitively includes Domain)
dotnet add src/Infrastructure/Infrastructure.csproj reference src/Application/Application.csproj

# Api depends on Infrastructure
dotnet add src/Api/Api.csproj reference src/Infrastructure/Infrastructure.csproj

# Test projects reference what they test
dotnet add tests/Domain.Tests/Domain.Tests.csproj reference src/Domain/Domain.csproj
dotnet add tests/Application.Tests/Application.Tests.csproj reference src/Application/Application.csproj

# List references for a project
dotnet list src/Api/Api.csproj reference

# Remove a reference
dotnet remove src/Api/Api.csproj reference src/OldProject/OldProject.csproj
```

This generates `<ProjectReference>` entries in the `.csproj`:

```xml
<ItemGroup>
  <ProjectReference Include="..\Domain\Domain.csproj" />
</ItemGroup>
```

> **Important:** Project references are transitive. If `Api -> Infrastructure -> Application -> Domain`,
> then `Api` can use types from all three. However, you should only reference what you
> directly use to keep dependencies explicit.

---

## Directory.Build.props — Shared Build Settings

Place a `Directory.Build.props` file at the repository root to apply settings to every
project in the tree. MSBuild automatically picks it up.

```xml
<!-- Directory.Build.props -->
<Project>
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>

  <PropertyGroup>
    <Company>MyCompany</Company>
    <Authors>Engineering Team</Authors>
  </PropertyGroup>
</Project>
```

Now you can simplify each `.csproj` to just:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- TargetFramework, Nullable, etc. are inherited from Directory.Build.props -->
</Project>
```

> **Tip:** If a project needs to override a setting, it can redeclare the property in its
> own `.csproj`. The project-level value wins.

---

## Directory.Packages.props — Centralized Package Versioning

Central Package Management (CPM) lets you define all NuGet package versions in one place.

### Enable CPM

Create `Directory.Packages.props` at the repository root:

```xml
<!-- Directory.Packages.props -->
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>

  <ItemGroup>
    <PackageVersion Include="Microsoft.EntityFrameworkCore" Version="9.0.0" />
    <PackageVersion Include="Serilog" Version="4.2.0" />
    <PackageVersion Include="Serilog.Sinks.Console" Version="6.0.0" />
    <PackageVersion Include="FluentValidation" Version="11.11.0" />
    <PackageVersion Include="Moq" Version="4.20.72" />
    <PackageVersion Include="xunit" Version="2.9.3" />
    <PackageVersion Include="xunit.runner.visualstudio" Version="2.8.2" />
  </ItemGroup>
</Project>
```

### Reference packages without versions in .csproj

```xml
<ItemGroup>
  <PackageReference Include="Serilog" />
  <PackageReference Include="FluentValidation" />
</ItemGroup>
```

> **Warning:** With CPM enabled, specifying a `Version` attribute directly in a
> `<PackageReference>` will cause a build error unless you also set
> `VersionOverride="..."` explicitly. This is by design — it forces all versions
> through the central file.

---

## Practical Workflow: Building a Multi-Project Solution from Scratch

Here is a complete shell session that creates a Clean Architecture solution.

```bash
# Create the root directory
mkdir -p OrderSystem && cd OrderSystem

# Initialize the solution
dotnet new sln -n OrderSystem

# Scaffold supporting files
dotnet new gitignore
dotnet new editorconfig

# Create source projects
dotnet new classlib -n OrderSystem.Domain -o src/Domain
dotnet new classlib -n OrderSystem.Application -o src/Application
dotnet new classlib -n OrderSystem.Infrastructure -o src/Infrastructure
dotnet new webapi -n OrderSystem.Api -o src/Api

# Create test projects
dotnet new xunit -n OrderSystem.Domain.Tests -o tests/Domain.Tests
dotnet new xunit -n OrderSystem.Application.Tests -o tests/Application.Tests
dotnet new xunit -n OrderSystem.Api.Tests -o tests/Api.Tests

# Add all projects to the solution
dotnet sln add src/Domain/OrderSystem.Domain.csproj
dotnet sln add src/Application/OrderSystem.Application.csproj
dotnet sln add src/Infrastructure/OrderSystem.Infrastructure.csproj
dotnet sln add src/Api/OrderSystem.Api.csproj
dotnet sln add tests/Domain.Tests/OrderSystem.Domain.Tests.csproj
dotnet sln add tests/Application.Tests/OrderSystem.Application.Tests.csproj
dotnet sln add tests/Api.Tests/OrderSystem.Api.Tests.csproj

# Set up project references (Clean Architecture layers)
dotnet add src/Application/OrderSystem.Application.csproj \
  reference src/Domain/OrderSystem.Domain.csproj

dotnet add src/Infrastructure/OrderSystem.Infrastructure.csproj \
  reference src/Application/OrderSystem.Application.csproj

dotnet add src/Api/OrderSystem.Api.csproj \
  reference src/Infrastructure/OrderSystem.Infrastructure.csproj

# Test project references
dotnet add tests/Domain.Tests/OrderSystem.Domain.Tests.csproj \
  reference src/Domain/OrderSystem.Domain.csproj

dotnet add tests/Application.Tests/OrderSystem.Application.Tests.csproj \
  reference src/Application/OrderSystem.Application.csproj

dotnet add tests/Api.Tests/OrderSystem.Api.Tests.csproj \
  reference src/Api/OrderSystem.Api.csproj

# Verify the solution
dotnet sln list

# Build everything
dotnet build

# Run all tests
dotnet test
```

### Resulting Directory Structure

```
OrderSystem/
├── OrderSystem.sln
├── .gitignore
├── .editorconfig
├── Directory.Build.props          (create manually)
├── Directory.Packages.props       (create manually)
├── src/
│   ├── Domain/
│   │   └── OrderSystem.Domain.csproj
│   ├── Application/
│   │   └── OrderSystem.Application.csproj
│   ├── Infrastructure/
│   │   └── OrderSystem.Infrastructure.csproj
│   └── Api/
│       └── OrderSystem.Api.csproj
└── tests/
    ├── Domain.Tests/
    │   └── OrderSystem.Domain.Tests.csproj
    ├── Application.Tests/
    │   └── OrderSystem.Application.Tests.csproj
    └── Api.Tests/
        └── OrderSystem.Api.Tests.csproj
```

> **Note:** The dependency flow is: `Api -> Infrastructure -> Application -> Domain`.
> Domain has no outward dependencies — it is the core of the system.

---

## Common Operations

### Build only one project (and its dependencies)

```bash
dotnet build src/Api/OrderSystem.Api.csproj
```

### Run only the API project

```bash
dotnet run --project src/Api/OrderSystem.Api.csproj
```

### Run only domain tests

```bash
dotnet test tests/Domain.Tests/OrderSystem.Domain.Tests.csproj
```

### Add a NuGet package to a specific project

```bash
dotnet add src/Infrastructure/OrderSystem.Infrastructure.csproj \
  package Microsoft.EntityFrameworkCore.Sqlite
```

---

## Summary

- Every real-world .NET codebase uses a `.sln` file to group projects.
- Use `dotnet sln add/remove/list` to manage the solution from the CLI.
- Use `dotnet add reference` to wire up project dependencies.
- Use `Directory.Build.props` to share build settings across all projects.
- Use `Directory.Packages.props` to centralize NuGet versions.
- Follow a layered folder structure (`src/` and `tests/`) for clarity.
