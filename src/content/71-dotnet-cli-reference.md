# The dotnet CLI — Complete Reference

The `dotnet` command-line interface is the primary tool for creating, building, testing,
and publishing .NET applications. This lesson is a comprehensive reference for every
major command you will use daily.

---

## Quick-Reference Table

| Command | Purpose | Example |
|---|---|---|
| `dotnet new` | Scaffold from a template | `dotnet new console -n MyApp` |
| `dotnet build` | Compile the project | `dotnet build -c Release` |
| `dotnet run` | Build and execute | `dotnet run -- --port 8080` |
| `dotnet test` | Run unit tests | `dotnet test --filter "Category=Unit"` |
| `dotnet publish` | Package for deployment | `dotnet publish -c Release -r linux-x64` |
| `dotnet watch` | Rebuild on file changes | `dotnet watch run` |
| `dotnet format` | Auto-format code | `dotnet format --verify-no-changes` |
| `dotnet clean` | Remove build artifacts | `dotnet clean -c Release` |
| `dotnet restore` | Restore NuGet packages | `dotnet restore --locked-mode` |
| `dotnet add` | Add package or reference | `dotnet add package Serilog` |
| `dotnet sln` | Manage solution files | `dotnet sln add src/Api/Api.csproj` |
| `dotnet tool` | Manage .NET tools | `dotnet tool install -g dotnet-ef` |

---

## dotnet new — Scaffolding Projects

### Common Templates

| Template | Short Name | Command |
|---|---|---|
| Console Application | `console` | `dotnet new console -n MyApp` |
| Class Library | `classlib` | `dotnet new classlib -n MyLib` |
| ASP.NET Core Web API | `webapi` | `dotnet new webapi -n MyApi` |
| ASP.NET Core MVC | `mvc` | `dotnet new mvc -n MyWeb` |
| Worker Service | `worker` | `dotnet new worker -n MyWorker` |
| xUnit Test Project | `xunit` | `dotnet new xunit -n MyTests` |
| NUnit Test Project | `nunit` | `dotnet new nunit -n MyTests` |
| Solution File | `sln` | `dotnet new sln -n MySolution` |
| gitignore | `gitignore` | `dotnet new gitignore` |
| EditorConfig | `editorconfig` | `dotnet new editorconfig` |
| global.json | `globaljson` | `dotnet new globaljson --sdk-version 9.0.100` |

### Useful Flags

```bash
# List all available templates
dotnet new list

# Search for templates
dotnet new search worker

# Create without top-level statements
dotnet new console -n MyApp --use-program-main

# Target a specific framework
dotnet new classlib -n MyLib --framework net8.0

# Force overwrite existing files
dotnet new console -n MyApp --force

# Create in a specific output directory
dotnet new webapi -n Api -o src/Api
```

> **Tip:** Run `dotnet new <template> --help` to see all options for a specific template.
> For example, `dotnet new webapi --help` shows options for authentication, controllers vs
> minimal APIs, and more.

---

## dotnet build — Compiling

```bash
# Build the current project or solution
dotnet build

# Build in Release configuration
dotnet build -c Release

# Build with detailed output
dotnet build -v detailed

# Build a specific project
dotnet build src/Api/Api.csproj

# Set output directory
dotnet build -o ./artifacts

# Build without restoring (if already restored)
dotnet build --no-restore

# Treat warnings as errors
dotnet build -warnaserror
```

### Verbosity Levels

| Level | Flag | Shows |
|---|---|---|
| Quiet | `-v q` | Errors only |
| Minimal | `-v m` | Errors, warnings, summary |
| Normal | `-v n` | Default output |
| Detailed | `-v d` | Detailed build steps |
| Diagnostic | `-v diag` | Everything (for debugging MSBuild) |

> **Note:** `dotnet build` implicitly runs `dotnet restore` first. Pass `--no-restore`
> to skip restoration when you know packages are already up to date.

---

## dotnet run — Build and Execute

```bash
# Run the current project
dotnet run

# Run a specific project
dotnet run --project src/Api/Api.csproj

# Pass arguments to your application (everything after --)
dotnet run -- --urls "http://localhost:5000"

# Run in Release mode
dotnet run -c Release

# Run without building (use existing build output)
dotnet run --no-build

# Set environment variables inline
DOTNET_ENVIRONMENT=Production dotnet run
```

> **Important:** Arguments before `--` are for `dotnet run` itself. Arguments after `--`
> are passed to your application. This distinction matters:
> ```bash
> # -c Release is for dotnet run; --seed is for your app
> dotnet run -c Release -- --seed
> ```

---

## dotnet publish — Packaging for Deployment

```bash
# Framework-dependent publish (requires .NET runtime on target)
dotnet publish -c Release

# Self-contained for Linux x64
dotnet publish -c Release -r linux-x64 --self-contained

# Single-file executable
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishSingleFile=true

# Single file with compression
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishSingleFile=true \
  -p:EnableCompressionInSingleFile=true

# AOT compilation (.NET 8+)
dotnet publish -c Release -r linux-x64 \
  -p:PublishAot=true

# Trimmed and ready-to-run
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishTrimmed=true \
  -p:PublishReadyToRun=true
```

### Common Runtime Identifiers (RIDs)

| RID | Platform |
|---|---|
| `linux-x64` | Linux on x86-64 |
| `linux-arm64` | Linux on ARM64 |
| `win-x64` | Windows on x86-64 |
| `osx-x64` | macOS on Intel |
| `osx-arm64` | macOS on Apple Silicon |

> **Warning:** Self-contained publishes produce large binaries (60+ MB) because they
> bundle the entire .NET runtime. Use trimming to reduce size.

---

## dotnet test — Running Tests

```bash
# Run all tests in the solution
dotnet test

# Run tests in a specific project
dotnet test tests/UnitTests/UnitTests.csproj

# Filter by test name
dotnet test --filter "FullyQualifiedName~OrderService"

# Filter by category/trait
dotnet test --filter "Category=Integration"

# Run with detailed output
dotnet test -v detailed

# Run with code coverage (requires coverlet)
dotnet test --collect:"XPlat Code Coverage"

# Stop on first failure
dotnet test --blame --blame-hang-timeout 60s

# Run in Release configuration
dotnet test -c Release --no-build

# Generate a test results file
dotnet test --logger "trx;LogFileName=results.trx"
```

### Filter Expressions

```bash
# By method name
dotnet test --filter "Method=Should_Return_Ok"

# By class
dotnet test --filter "ClassName=OrderServiceTests"

# By namespace
dotnet test --filter "Namespace=MyApp.Tests.Unit"

# Combine with operators
dotnet test --filter "Category=Unit&ClassName=OrderServiceTests"
dotnet test --filter "Category!=Integration"
```

> **Tip:** Add `<CollectCoverage>true</CollectCoverage>` to your test project's `.csproj`
> if you use the `coverlet.msbuild` package. Then every `dotnet test` generates coverage.

---

## dotnet format — Code Formatting

```bash
# Format the entire solution
dotnet format

# Check formatting without changing files (useful in CI)
dotnet format --verify-no-changes

# Format only whitespace issues
dotnet format whitespace

# Format only style issues
dotnet format style

# Format only analyzer warnings
dotnet format analyzers --severity warn

# Format a specific project
dotnet format src/Api/Api.csproj

# Include generated files
dotnet format --include-generated
```

> **Note:** `dotnet format` respects your `.editorconfig` file. Make sure you have one
> in your repository root to get consistent formatting across the team.

---

## dotnet watch — Hot Reload

```bash
# Watch and re-run on changes
dotnet watch run

# Watch and re-run tests
dotnet watch test

# Watch a specific project
dotnet watch --project src/Api/Api.csproj run

# Suppress browser launch
dotnet watch run --no-hot-reload

# Pass arguments through
dotnet watch run -- --urls "http://localhost:5000"
```

The watch command supports **hot reload** for many code changes without restarting the
application. When a change cannot be hot-reloaded, it performs a full rebuild.

> **Tip:** For ASP.NET Core apps, `dotnet watch` automatically refreshes the browser
> when using the default launch profile. Set `DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER=1`
> to disable this.

---

## dotnet clean — Removing Build Artifacts

```bash
# Clean the current project
dotnet clean

# Clean Release configuration artifacts
dotnet clean -c Release

# Clean a specific project
dotnet clean src/Api/Api.csproj
```

This removes the `bin/` and `obj/` directories' contents. It does not remove the
directories themselves.

> **Caution:** `dotnet clean` only removes output from the last build configuration.
> If you built both Debug and Release, you need to clean both:
> ```bash
> dotnet clean -c Debug && dotnet clean -c Release
> ```

---

## dotnet tool — Managing .NET Tools

```bash
# Install a global tool
dotnet tool install -g dotnet-ef

# Install a specific version
dotnet tool install -g dotnet-outdated-tool --version 4.6.0

# Update a global tool
dotnet tool update -g dotnet-ef

# List installed global tools
dotnet tool list -g

# Uninstall
dotnet tool uninstall -g dotnet-ef

# Install as a local tool (per-repo)
dotnet new tool-manifest   # creates .config/dotnet-tools.json
dotnet tool install dotnet-ef

# Restore local tools (after cloning a repo)
dotnet tool restore
```

### Commonly Used Tools

| Tool | Install Command | Purpose |
|---|---|---|
| Entity Framework CLI | `dotnet tool install -g dotnet-ef` | Database migrations |
| Outdated Checker | `dotnet tool install -g dotnet-outdated-tool` | Find outdated packages |
| Report Generator | `dotnet tool install -g dotnet-reportgenerator-globaltool` | Coverage reports |
| User Secrets | Built-in | Manage dev secrets |
| HTTP REPL | `dotnet tool install -g Microsoft.dotnet-httprepl` | Test APIs |

---

## dotnet restore — Package Restoration

```bash
# Restore all packages
dotnet restore

# Restore with locked mode (fail if lock file is out of date)
dotnet restore --locked-mode

# Generate/update the lock file
dotnet restore --use-lock-file

# Restore from a specific source
dotnet restore --source https://api.nuget.org/v3/index.json

# Force re-evaluation of all dependencies
dotnet restore --force
```

> **Important:** In CI pipelines, always use `--locked-mode` with a committed
> `packages.lock.json` to guarantee reproducible restores.

---

## Summary

The `dotnet` CLI is your all-in-one tool for .NET development on any platform. The most
common workflow cycle is:

```bash
dotnet new console -n MyApp        # scaffold
cd MyApp
dotnet build                        # compile
dotnet run                          # execute
dotnet test                         # test
dotnet publish -c Release           # package
```

Master these commands and their flags, and you will rarely need to leave the terminal.
