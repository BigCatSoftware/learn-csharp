# Publishing and Deployment on Windows

.NET applications can be published in several ways depending on your deployment target. This lesson covers every publishing strategy — framework-dependent, self-contained, single-file, ReadyToRun, Native AOT, and trimming — with a focus on Windows deployment scenarios relevant to Data Engineers.

---

## Publishing Strategies Overview

| Strategy | Target has .NET? | Binary size | Startup speed | Best for |
|---|---|---|---|---|
| Framework-dependent | Yes (required) | Small (~1 MB) | Normal | Internal servers, Azure |
| Self-contained | No (bundled) | Large (~80 MB) | Normal | Distribution to machines without .NET |
| Single-file | No (bundled) | Large (one file) | Slightly slower first run | Simple deployment, tools |
| ReadyToRun | Either | Larger | Faster startup | Latency-sensitive apps |
| Native AOT | No (compiled) | Small (~10 MB) | Very fast | CLI tools, microservices |
| Trimmed | No (bundled) | Medium (~30 MB) | Normal | Reduce self-contained size |

---

## Framework-Dependent Deployment

The simplest option. Your app is a `.dll` that requires .NET to be installed on the target machine.

```powershell
# Publish for the current platform
dotnet publish -c Release

# Output is in bin/Release/net10.0/publish/
```

To run on the target machine:

```powershell
dotnet MyApp.dll
```

### When to use

- Deploying to servers you control (where .NET is installed)
- Azure App Service, Azure Functions (runtime is pre-installed)
- Docker containers (base image includes .NET)

---

## Self-Contained Deployment

Bundles the .NET runtime with your application. The target machine does not need .NET installed.

```powershell
# Self-contained for Windows x64
dotnet publish -c Release -r win-x64 --self-contained

# Output includes your app + the entire .NET runtime
```

### Common Runtime Identifiers (RIDs) for Windows

| RID | Platform |
|---|---|
| `win-x64` | Windows 64-bit (Intel/AMD) |
| `win-x86` | Windows 32-bit |
| `win-arm64` | Windows ARM64 (Surface Pro X) |

---

## Single-File Deployment

Packages everything into a single `.exe` file.

```powershell
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
```

### Behavior

- First run extracts the runtime to a temp directory (unless using compression disabled)
- Subsequent runs reuse the extracted files
- To include PDB files: `-p:IncludeNativeLibrariesForSelfExtract=true`

### Avoid extraction on first run

```powershell
dotnet publish -c Release -r win-x64 --self-contained \
  -p:PublishSingleFile=true \
  -p:IncludeAllContentForSelfExtract=true
```

---

## Native AOT (Ahead-of-Time Compilation)

Native AOT compiles your application to native machine code at build time. No JIT, no runtime dependency, fast startup.

```powershell
dotnet publish -c Release -r win-x64 -p:PublishAot=true
```

### Requirements

- Enable in `.csproj`:

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>
</PropertyGroup>
```

- Install the **Desktop development with C++** workload in Visual Studio (provides the native linker)

### Limitations

| Feature | Supported in AOT? |
|---|---|
| Reflection (limited) | Partial — annotate with `[DynamicallyAccessedMembers]` |
| `System.Text.Json` | Yes (with source generators) |
| EF Core | No (requires reflection) |
| Dapper | Yes (with AOT-compatible version) |
| gRPC | Yes |
| Minimal APIs | Yes |
| MVC / Razor | No |

### When to use

- CLI tools that need instant startup
- Microservices where cold start latency matters
- Lambda functions / serverless

---

## Trimming

Trimming removes unused code from self-contained deployments, reducing binary size significantly.

```powershell
dotnet publish -c Release -r win-x64 --self-contained -p:PublishTrimmed=true
```

### Trim modes

| Mode | Setting | Behavior |
|---|---|---|
| Partial | `<TrimMode>partial</TrimMode>` | Only trim assemblies that opt in |
| Full | `<TrimMode>full</TrimMode>` | Trim all assemblies (more aggressive) |

### Trim warnings

The compiler warns when trimming may break functionality (e.g., reflection-heavy code):

```
warning IL2026: Using member 'System.Text.Json.JsonSerializer.Deserialize'
which has 'RequiresUnreferencedCodeAttribute'
```

Fix by using source generators or annotating your code:

```csharp
[JsonSerializable(typeof(PipelineConfig))]
internal partial class AppJsonContext : JsonSerializerContext { }
```

---

## ReadyToRun (R2R)

ReadyToRun pre-compiles your code to native code while keeping the IL as fallback. It improves startup time without the restrictions of Native AOT.

```powershell
dotnet publish -c Release -r win-x64 -p:PublishReadyToRun=true
```

Can be combined with self-contained and single-file:

```powershell
dotnet publish -c Release -r win-x64 --self-contained \
  -p:PublishSingleFile=true \
  -p:PublishReadyToRun=true
```

---

## Publishing from Visual Studio

1. Right-click your project in Solution Explorer
2. **Publish...**
3. Choose a target:

| Target | Description |
|---|---|
| Folder | Publish to a local or network folder |
| Azure | Deploy directly to Azure App Service, Functions, etc. |
| Docker | Build and publish a Docker image |
| IIS | Deploy to IIS on Windows Server |

4. Configure settings (configuration, target framework, deployment mode)
5. Click **Publish**

VS creates a `.pubxml` file in `Properties/PublishProfiles/` that you can reuse.

---

## Publishing for Data Engineering Scenarios

### Console app / ETL tool

For a data pipeline tool that runs on a Windows server:

```powershell
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
```

This produces a single `.exe` you can copy to the server and schedule with Task Scheduler or SQL Server Agent.

### Worker Service (long-running)

For a background service that runs continuously:

```powershell
dotnet publish -c Release -r win-x64
```

Install as a Windows Service:

```powershell
sc.exe create MyPipelineWorker binpath="C:\services\MyWorker\MyWorker.exe"
sc.exe start MyPipelineWorker
```

Or use the `Microsoft.Extensions.Hosting.WindowsServices` NuGet package for proper service lifecycle:

```csharp
var builder = Host.CreateDefaultBuilder(args)
    .UseWindowsService()
    .ConfigureServices(services =>
    {
        services.AddHostedService<PipelineWorker>();
    });

builder.Build().Run();
```

### Scheduled Task

For ETL jobs that run on a schedule without SQL Server Agent:

1. Publish as a single-file self-contained app
2. Open **Task Scheduler** (taskschd.msc)
3. **Create Task** > **Actions** > **New** > Browse to your `.exe`
4. **Triggers** > set the schedule (daily, hourly, etc.)
5. **Settings** > check "Run whether user is logged on or not"

---

## Verifying Your Published App

After publishing, always verify:

```powershell
# Check the output directory
ls bin\Release\net10.0\win-x64\publish\

# Run the published binary directly
.\bin\Release\net10.0\win-x64\publish\MyApp.exe

# Check the file size
(Get-Item .\bin\Release\net10.0\win-x64\publish\MyApp.exe).Length / 1MB
```

---

## Quick Decision Guide

```
Do you control the target machine?
├── Yes → Is .NET installed?
│   ├── Yes → Framework-dependent (smallest, simplest)
│   └── No → Self-contained
└── No → Self-contained + Single-file

Is startup time critical?
├── Yes → Can you live with AOT limitations?
│   ├── Yes → Native AOT
│   └── No → ReadyToRun
└── No → Standard publish

Is binary size a concern?
├── Yes → Trimmed + Single-file
└── No → Self-contained is fine
```
