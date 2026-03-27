# Solutions and Projects in Visual Studio

In .NET, **solutions** group related **projects** together. Understanding how to structure and manage them — both from Visual Studio 2026 and the command line — is essential for professional C# development. This lesson walks through the entire workflow from creating a blank solution to building a layered multi-project architecture.

---

## What Are .sln Files?

A `.sln` (solution) file is a text-based manifest that lists all the projects in a codebase and their relationships. It is used by:

- **Visual Studio 2026** to display the project tree in Solution Explorer
- `dotnet build` / `dotnet test` to know which projects to compile
- CI pipelines to build everything in one command

### Anatomy of a .sln file

```
Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
VisualStudioVersion = 17.12.0
MinimumVisualStudioVersion = 10.0.40219.1
Project("{FAE04EC0-...}") = "MyApp", "src\MyApp\MyApp.csproj", "{GUID}"
EndProject
Project("{FAE04EC0-...}") = "MyApp.Tests", "tests\MyApp.Tests\MyApp.Tests.csproj", "{GUID}"
EndProject
```

You rarely edit this file by hand — Visual Studio and `dotnet sln` manage it for you.

---

## Creating Solutions and Projects in Visual Studio

### From the Start Window

1. Open Visual Studio 2026
2. Click **Create a new project**
3. Search or filter by language (C#), platform (Windows), or project type
4. Select a template (e.g., Console App, ASP.NET Core Web API)
5. Configure: project name, location, solution name
6. Choose framework (.NET 10) and click **Create**

### Adding Projects to an Existing Solution

1. Right-click the **Solution** node in Solution Explorer
2. **Add > New Project...** or **Add > Existing Project...**
3. Choose template, configure, and create

### Adding Project References

1. Right-click the project that needs the reference
2. **Add > Project Reference...**
3. Check the project(s) you want to reference
4. Click **OK**

---

## Creating Solutions and Projects from the CLI

The CLI approach is faster for experienced developers and essential for scripting.

```powershell
# Create a solution
dotnet new sln -n DataPipeline

# Create projects
dotnet new console -n DataPipeline.Cli -o src/DataPipeline.Cli
dotnet new classlib -n DataPipeline.Core -o src/DataPipeline.Core
dotnet new classlib -n DataPipeline.Data -o src/DataPipeline.Data
dotnet new xunit -n DataPipeline.Tests -o tests/DataPipeline.Tests

# Add projects to the solution with folder organization
dotnet sln add src/DataPipeline.Cli --solution-folder src
dotnet sln add src/DataPipeline.Core --solution-folder src
dotnet sln add src/DataPipeline.Data --solution-folder src
dotnet sln add tests/DataPipeline.Tests --solution-folder tests

# Add project references
dotnet add src/DataPipeline.Cli reference src/DataPipeline.Core
dotnet add src/DataPipeline.Cli reference src/DataPipeline.Data
dotnet add src/DataPipeline.Data reference src/DataPipeline.Core
dotnet add tests/DataPipeline.Tests reference src/DataPipeline.Core
```

After running these commands, open the `.sln` file in Visual Studio — it will display the full project tree.

---

## Recommended Directory Structure

```
DataPipeline/
├── DataPipeline.sln
├── global.json
├── .editorconfig
├── Directory.Build.props          # shared MSBuild properties
├── src/
│   ├── DataPipeline.Cli/
│   │   ├── DataPipeline.Cli.csproj
│   │   └── Program.cs
│   ├── DataPipeline.Core/
│   │   ├── DataPipeline.Core.csproj
│   │   ├── Models/
│   │   └── Interfaces/
│   └── DataPipeline.Data/
│       ├── DataPipeline.Data.csproj
│       └── Repositories/
└── tests/
    └── DataPipeline.Tests/
        ├── DataPipeline.Tests.csproj
        └── CoreTests/
```

### Why this layout works

- **src/ and tests/** separate production code from test code
- **One project per concern** (CLI entry point, core logic, data access)
- **Solution folders** in VS match the file system folders
- The solution file sits at the root, so `dotnet build` from root builds everything

---

## Understanding .csproj Files

The `.csproj` file defines a project's target framework, dependencies, and build settings.

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\DataPipeline.Core\DataPipeline.Core.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Serilog" Version="4.2.0" />
  </ItemGroup>

</Project>
```

### Key elements

| Element | Purpose |
|---|---|
| `Sdk` | Which SDK to use (`Microsoft.NET.Sdk`, `Microsoft.NET.Sdk.Web`, etc.) |
| `TargetFramework` | .NET version to compile against |
| `OutputType` | `Exe` for runnable apps, omit for libraries |
| `Nullable` | Enable nullable reference types |
| `ImplicitUsings` | Auto-import common namespaces |
| `ProjectReference` | Dependency on another project in the solution |
| `PackageReference` | NuGet dependency |

### Editing .csproj in Visual Studio

Double-click any project in Solution Explorer to open its `.csproj` directly in the editor. VS 2026 provides IntelliSense for MSBuild properties.

---

## Directory.Build.props — Shared Settings

Place a `Directory.Build.props` file at the solution root to apply settings to every project automatically.

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

With this in place, individual `.csproj` files can be much shorter — they inherit these defaults.

---

## Solution Explorer Tips in Visual Studio

| Action | How |
|---|---|
| Search files | Ctrl+; in Solution Explorer |
| Toggle file nesting | Solution Explorer toolbar > Nesting icon |
| View file on disk | Right-click > Open Folder in File Explorer |
| Scope to project | Double-click a project node |
| Unload a project | Right-click > Unload Project (speeds up builds) |
| Edit .csproj | Double-click the project node |
| Manage NuGet | Right-click project > Manage NuGet Packages |
| Add solution folder | Right-click solution > Add > New Solution Folder |

---

## Multi-Targeting

A single project can target multiple frameworks:

```xml
<PropertyGroup>
  <TargetFrameworks>net10.0;net8.0</TargetFrameworks>
</PropertyGroup>
```

This is common for libraries that need to support older consumers.

---

## Build the Whole Solution

```powershell
# From the solution root
dotnet build

# Or explicitly specify the solution
dotnet build DataPipeline.sln

# Build in Release mode
dotnet build -c Release
```

In Visual Studio: **Build > Build Solution** (Ctrl+Shift+B).
