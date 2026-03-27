# The dotnet CLI — Complete Reference

The `dotnet` command-line interface is the primary tool for creating, building, testing, and publishing .NET applications. Even when using Visual Studio 2026, understanding the CLI is essential — it powers the IDE under the hood and is indispensable for automation, CI/CD, and quick tasks.

---

## Quick-Reference Table

| Command | Purpose | Example |
|---|---|---|
| `dotnet new` | Scaffold from a template | `dotnet new console -n MyApp` |
| `dotnet build` | Compile the project | `dotnet build -c Release` |
| `dotnet run` | Build and execute | `dotnet run -- --port 8080` |
| `dotnet test` | Run unit tests | `dotnet test --filter "Category=Unit"` |
| `dotnet publish` | Package for deployment | `dotnet publish -c Release` |
| `dotnet add` | Add package or reference | `dotnet add package Serilog` |
| `dotnet remove` | Remove package or reference | `dotnet remove package Serilog` |
| `dotnet restore` | Restore NuGet packages | `dotnet restore` |
| `dotnet clean` | Delete build outputs | `dotnet clean` |
| `dotnet watch` | Hot-reload on file changes | `dotnet watch run` |
| `dotnet tool` | Manage global/local tools | `dotnet tool install -g dotnet-ef` |
| `dotnet sln` | Manage solution files | `dotnet sln add src/MyApp` |
| `dotnet format` | Apply code style rules | `dotnet format` |

---

## Creating Projects — `dotnet new`

### Common templates

```powershell
# Console application
dotnet new console -n MyApp

# Class library
dotnet new classlib -n MyLib

# ASP.NET Core Web API
dotnet new webapi -n MyApi

# ASP.NET Core MVC
dotnet new mvc -n MyWebApp

# xUnit test project
dotnet new xunit -n MyApp.Tests

# Solution file
dotnet new sln -n MySolution

# Worker service (background jobs)
dotnet new worker -n MyWorker

# Blazor Server
dotnet new blazorserver -n MyBlazorApp
```

### Listing all available templates

```powershell
dotnet new list
```

### Template options

```powershell
# Create without top-level statements
dotnet new console -n MyApp --use-program-main

# Target a specific framework
dotnet new console -n MyApp --framework net10.0

# Create in the current directory
dotnet new console --output .
```

---

## Building — `dotnet build`

```powershell
# Default (Debug configuration)
dotnet build

# Release configuration
dotnet build -c Release

# Build a specific project
dotnet build src/MyApp/MyApp.csproj

# Build the entire solution
dotnet build MySolution.sln

# Show detailed build output
dotnet build -v detailed

# Build without restoring (if you already restored)
dotnet build --no-restore
```

### Verbosity levels

| Flag | Level | Shows |
|---|---|---|
| `-v q` | Quiet | Errors only |
| `-v m` | Minimal | Errors + warnings + summary |
| `-v n` | Normal | Default |
| `-v d` | Detailed | All build steps |
| `-v diag` | Diagnostic | Everything (huge output) |

---

## Running — `dotnet run`

```powershell
# Build and run the project in the current directory
dotnet run

# Run a specific project
dotnet run --project src/MyApp

# Pass arguments to your app (note the --)
dotnet run -- --port 8080 --verbose

# Run in Release mode
dotnet run -c Release

# Run without rebuilding
dotnet run --no-build
```

---

## Testing — `dotnet test`

```powershell
# Run all tests in the solution
dotnet test

# Run tests in a specific project
dotnet test tests/MyApp.Tests

# Filter by test name
dotnet test --filter "FullyQualifiedName~PaymentTests"

# Filter by trait / category
dotnet test --filter "Category=Integration"

# Run with detailed output
dotnet test -v detailed

# Generate code coverage (with Coverlet)
dotnet test --collect:"XPlat Code Coverage"

# Stop on first failure
dotnet test -- RunConfiguration.StopOnFirstFailure=true
```

---

## Publishing — `dotnet publish`

```powershell
# Framework-dependent (requires .NET installed on target)
dotnet publish -c Release

# Self-contained for Windows x64
dotnet publish -c Release -r win-x64 --self-contained

# Single-file executable
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true

# Trimmed (remove unused code)
dotnet publish -c Release -r win-x64 --self-contained -p:PublishTrimmed=true

# Native AOT (ahead-of-time compilation)
dotnet publish -c Release -r win-x64 -p:PublishAot=true
```

---

## Package Management — `dotnet add/remove`

```powershell
# Add a NuGet package
dotnet add package Serilog

# Add a specific version
dotnet add package Serilog --version 4.2.0

# Add a project reference
dotnet add reference ../MyLib/MyLib.csproj

# Remove a package
dotnet remove package Serilog

# Remove a project reference
dotnet remove reference ../MyLib/MyLib.csproj

# List all packages in a project
dotnet list package

# Check for outdated packages
dotnet list package --outdated
```

---

## Solution Management — `dotnet sln`

```powershell
# Create a solution
dotnet new sln -n MySolution

# Add a project to the solution
dotnet sln add src/MyApp/MyApp.csproj

# Add with a solution folder
dotnet sln add src/MyApp/MyApp.csproj --solution-folder src

# List projects in the solution
dotnet sln list

# Remove a project
dotnet sln remove src/MyApp/MyApp.csproj
```

---

## Watching for Changes — `dotnet watch`

`dotnet watch` monitors your source files and automatically rebuilds and restarts when you save changes. This is invaluable during development.

```powershell
# Watch and run
dotnet watch run

# Watch and run tests
dotnet watch test

# Watch a specific project
dotnet watch --project src/MyApi run

# Hot reload is enabled by default in .NET 10
# Supported changes are applied without restarting
```

### What hot reload supports

| Change Type | Hot Reload | Restart Required |
|---|---|---|
| Method body edits | Yes | No |
| Add static method | Yes | No |
| Add new class | Yes | No |
| Change method signature | No | Yes |
| Change inheritance | No | Yes |

---

## Global and Local Tools — `dotnet tool`

Tools are CLI extensions distributed via NuGet.

```powershell
# Install a global tool
dotnet tool install -g dotnet-ef
dotnet tool install -g dotnet-outdated-tool

# Update a global tool
dotnet tool update -g dotnet-ef

# List global tools
dotnet tool list -g

# Install a local tool (project-scoped)
dotnet new tool-manifest   # creates .config/dotnet-tools.json
dotnet tool install dotnet-ef

# Restore local tools (e.g., after cloning)
dotnet tool restore
```

### Useful global tools

| Tool | Command | Purpose |
|---|---|---|
| EF Core CLI | `dotnet-ef` | Database migrations |
| Outdated checker | `dotnet-outdated-tool` | Find outdated packages |
| Format | built-in | Code formatting |
| User secrets | built-in | Manage dev secrets |

---

## Code Formatting — `dotnet format`

```powershell
# Format the entire solution
dotnet format

# Check formatting without making changes
dotnet format --verify-no-changes

# Format only whitespace
dotnet format whitespace

# Format only style rules
dotnet format style

# Format only analyzer rules
dotnet format analyzers
```

Configure formatting rules in `.editorconfig` at your solution root.

---

## User Secrets — `dotnet user-secrets`

User secrets store sensitive configuration (connection strings, API keys) outside your project files during development.

```powershell
# Initialize secrets for a project
dotnet user-secrets init

# Set a secret
dotnet user-secrets set "ConnectionStrings:Default" "Server=localhost;Database=MyDb;Trusted_Connection=true"

# List all secrets
dotnet user-secrets list

# Remove a secret
dotnet user-secrets remove "ConnectionStrings:Default"

# Clear all secrets
dotnet user-secrets clear
```

Secrets are stored at `%APPDATA%\Microsoft\UserSecrets\<UserSecretsId>\secrets.json` and are automatically loaded in `Development` environment by the host builder.

---

## Useful Compound Commands

```powershell
# Clean rebuild
dotnet clean && dotnet build

# Restore, build, test in one go
dotnet restore && dotnet build --no-restore && dotnet test --no-build

# Create a project, add to solution, and add a test project
dotnet new sln -n MyProject
dotnet new webapi -n MyProject.Api -o src/MyProject.Api
dotnet new xunit -n MyProject.Tests -o tests/MyProject.Tests
dotnet sln add src/MyProject.Api tests/MyProject.Tests
dotnet add tests/MyProject.Tests reference src/MyProject.Api
```
