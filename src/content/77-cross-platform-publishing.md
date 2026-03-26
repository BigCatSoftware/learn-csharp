# Cross-Platform Publishing

.NET applications can be published for Windows, Linux, and macOS from any development
machine. This lesson covers every publishing strategy: framework-dependent, self-contained,
single-file, ReadyToRun, AOT, trimming, and Docker containerization.

---

## Runtime Identifiers (RIDs)

A Runtime Identifier tells the build system which platform to target.

### Common RIDs

| RID | Platform |
|---|---|
| `linux-x64` | Linux on x86-64 (Intel/AMD) |
| `linux-arm64` | Linux on ARM64 (Raspberry Pi 4, AWS Graviton) |
| `linux-musl-x64` | Alpine Linux on x86-64 |
| `linux-musl-arm64` | Alpine Linux on ARM64 |
| `win-x64` | Windows on x86-64 |
| `win-arm64` | Windows on ARM64 |
| `osx-x64` | macOS on Intel |
| `osx-arm64` | macOS on Apple Silicon (M1/M2/M3/M4) |

### Portable RIDs (.NET 8+)

.NET 8 introduced simplified portable RIDs:

| Portable RID | Covers |
|---|---|
| `linux-x64` | Any Linux on x86-64 |
| `linux-arm64` | Any Linux on ARM64 |
| `win-x64` | Any Windows on x86-64 |
| `osx-arm64` | Any macOS on Apple Silicon |

> **Note:** Starting with .NET 8, distribution-specific RIDs like `ubuntu.22.04-x64` are
> deprecated. Use the portable `linux-x64` instead.

---

## Framework-Dependent vs Self-Contained

### Framework-Dependent Deployment (FDD)

The application requires .NET to be installed on the target machine.

```bash
# Framework-dependent (default)
dotnet publish -c Release

# Explicitly framework-dependent
dotnet publish -c Release --self-contained false
```

**Output:** A small set of DLLs and a `MyApp.dll` that you run with `dotnet MyApp.dll`.

| Pros | Cons |
|---|---|
| Small output (~1-5 MB) | Target must have .NET installed |
| Shares runtime across apps | Must match runtime version |
| Auto-patches with runtime updates | Dependency on external install |

### Self-Contained Deployment (SCD)

The application bundles the entire .NET runtime.

```bash
# Self-contained for Linux x64
dotnet publish -c Release -r linux-x64 --self-contained

# Self-contained for Windows
dotnet publish -c Release -r win-x64 --self-contained

# Self-contained for macOS Apple Silicon
dotnet publish -c Release -r osx-arm64 --self-contained
```

**Output:** A native executable plus all runtime files (~60-80 MB uncompressed).

| Pros | Cons |
|---|---|
| No .NET install needed on target | Large output size |
| Control exact runtime version | Must publish per-platform |
| Truly standalone | No shared runtime patching |

> **Tip:** Self-contained is the best choice for distributing tools, CLI apps, and
> applications where you cannot control the target environment.

---

## Single-File Executables

Bundle everything into one file.

```bash
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishSingleFile=true
```

### With Compression

```bash
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishSingleFile=true \
  -p:EnableCompressionInSingleFile=true
```

### Configuration in .csproj

```xml
<PropertyGroup>
  <PublishSingleFile>true</PublishSingleFile>
  <SelfContained>true</SelfContained>
  <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
  <EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>
</PropertyGroup>
```

> **Warning:** Single-file apps extract some files to a temporary directory on first run.
> To include native libraries in the single file, also set
> `<IncludeNativeLibrariesForSelfExtract>true</IncludeNativeLibrariesForSelfExtract>`.

---

## ReadyToRun Compilation

ReadyToRun (R2R) pre-compiles IL to native code, reducing startup time.

```bash
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishReadyToRun=true
```

| Aspect | Without R2R | With R2R |
|---|---|---|
| Startup time | Slower (JIT at startup) | Faster (pre-compiled) |
| Steady-state perf | Same | Same |
| Binary size | Smaller | Larger (~2x IL size) |

```xml
<!-- In .csproj -->
<PropertyGroup>
  <PublishReadyToRun>true</PublishReadyToRun>
</PropertyGroup>
```

> **Tip:** ReadyToRun is great for web APIs and services where startup time matters
> (e.g., serverless, Kubernetes pods with frequent scaling).

---

## AOT Compilation (.NET 8+)

Native AOT compiles your application to a fully native binary. No JIT, no IL, no runtime.

```bash
dotnet publish -c Release -r linux-x64 \
  -p:PublishAot=true
```

### Enable in .csproj

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>
</PropertyGroup>
```

### AOT Characteristics

| Aspect | Value |
|---|---|
| Startup time | Near-instant (< 10ms for simple apps) |
| Memory usage | Significantly lower |
| Binary size | 5-15 MB (trimmed) |
| Reflection | Limited (requires source generators) |
| Dynamic code gen | Not supported |
| Supported project types | Console, Web API (minimal APIs), Worker |

### AOT Limitations

```csharp
// These do NOT work with AOT:
var type = Type.GetType("MyNamespace.MyClass");           // reflection
var obj = Activator.CreateInstance(type);                   // dynamic instantiation
dynamic d = GetSomething();                                // dynamic keyword
var result = JsonSerializer.Deserialize<Foo>(json);        // needs source generator

// AOT-compatible JSON serialization:
[JsonSerializable(typeof(Order))]
[JsonSerializable(typeof(List<Order>))]
internal partial class AppJsonContext : JsonSerializerContext { }

var order = JsonSerializer.Deserialize<Order>(json, AppJsonContext.Default.Order);
```

> **Important:** AOT compilation requires all code paths to be statically analyzable.
> Libraries that rely heavily on reflection (like some older ORMs) will not work. Check
> the library's documentation for AOT compatibility.

---

## Trimming

Trimming removes unused code from the published output, reducing binary size.

```bash
# Basic trimming
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishTrimmed=true

# Full trimming (more aggressive, may break reflection-heavy code)
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishTrimmed=true \
  -p:TrimMode=full
```

### Trim Modes

| Mode | Behavior | Safety |
|---|---|---|
| `partial` | Trims assemblies that opted in | Safe |
| `full` | Trims all assemblies aggressively | May break reflection |

### Trim Warnings

The trimmer produces warnings when it detects potentially unsafe patterns:

```bash
# Show all trim analysis warnings
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishTrimmed=true \
  -p:TrimmerSingleWarn=false
```

### Preserving Code from Trimming

If the trimmer removes code you need, use attributes to preserve it:

```csharp
using System.Diagnostics.CodeAnalysis;

// Preserve this entire type
[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)]
public class ImportantConfig { }

// Preserve members accessed via reflection
public void LoadPlugin(
    [DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicConstructors)]
    Type pluginType)
{
    var instance = Activator.CreateInstance(pluginType);
}
```

> **Caution:** Always test your trimmed application thoroughly. Some libraries do not
> annotate their reflection usage, causing runtime failures that do not appear in
> untrimmed builds.

---

## Publishing Commands Summary

Here is every common publish scenario in one place:

```bash
# Framework-dependent (smallest, requires .NET on target)
dotnet publish -c Release -o ./publish/fdd

# Self-contained for Linux
dotnet publish -c Release -r linux-x64 --self-contained -o ./publish/linux

# Self-contained for Windows
dotnet publish -c Release -r win-x64 --self-contained -o ./publish/windows

# Self-contained for macOS Apple Silicon
dotnet publish -c Release -r osx-arm64 --self-contained -o ./publish/macos

# Single-file for Linux
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishSingleFile=true -o ./publish/single

# Trimmed single-file for Linux
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishSingleFile=true \
  -p:PublishTrimmed=true -o ./publish/trimmed

# AOT for Linux
dotnet publish -c Release -r linux-x64 \
  -p:PublishAot=true -o ./publish/aot

# ReadyToRun for Linux
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishReadyToRun=true -o ./publish/r2r
```

---

## Docker Containerization

### Using dotnet publish for Containers (.NET 8+)

.NET 8+ can produce Docker images directly:

```bash
# Publish as a Docker image (requires Docker daemon)
dotnet publish -c Release \
  -p:PublishProfile=DefaultContainer \
  -p:ContainerImageName=myapp \
  -p:ContainerImageTag=1.0.0
```

Add to `.csproj`:

```xml
<PropertyGroup>
  <ContainerRepository>myregistry.azurecr.io/myapp</ContainerRepository>
  <ContainerImageTag>1.0.0</ContainerImageTag>
</PropertyGroup>
```

### Traditional Dockerfile

```dockerfile
# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy and restore
COPY *.sln .
COPY src/Api/Api.csproj src/Api/
COPY src/Domain/Domain.csproj src/Domain/
COPY src/Application/Application.csproj src/Application/
COPY src/Infrastructure/Infrastructure.csproj src/Infrastructure/
RUN dotnet restore

# Copy everything and publish
COPY . .
RUN dotnet publish src/Api/Api.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "Api.dll"]
```

### Alpine-Based Image (Smaller)

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Api.dll"]
```

### AOT in Docker (Smallest)

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
RUN apt-get update && apt-get install -y clang zlib1g-dev
WORKDIR /src
COPY . .
RUN dotnet publish src/Api/Api.csproj -c Release -r linux-x64 \
    -p:PublishAot=true -o /app/publish

FROM mcr.microsoft.com/dotnet/runtime-deps:9.0-noble-chiseled
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["./Api"]
```

> **Tip:** The `chiseled` base images are distroless Ubuntu images — no shell, no package
> manager, minimal attack surface. They are ideal for AOT-published apps.

---

## Measuring Binary Size

```bash
# Check the output size
du -sh ./publish/fdd/
du -sh ./publish/linux/
du -sh ./publish/single/
du -sh ./publish/trimmed/
du -sh ./publish/aot/

# Typical sizes for a minimal web API:
# FDD:      ~1 MB
# SCD:      ~80 MB
# Single:   ~70 MB
# Trimmed:  ~30 MB
# AOT:      ~12 MB
```

### Size Comparison Table

| Strategy | Typical Size | Startup | Requires Runtime |
|---|---|---|---|
| Framework-dependent | 1-5 MB | Medium | Yes |
| Self-contained | 60-80 MB | Medium | No |
| Self-contained + Trimmed | 25-40 MB | Medium | No |
| Single-file | 60-75 MB | Slow (first run) | No |
| Single-file + Trimmed | 20-35 MB | Slow (first run) | No |
| ReadyToRun | 80-120 MB | Fast | No |
| Native AOT | 8-20 MB | Very fast | No |

---

## Troubleshooting Trimming and AOT Issues

### Problem: App crashes at runtime after trimming

```bash
# Publish with full trim warnings
dotnet publish -c Release -r linux-x64 --self-contained \
  -p:PublishTrimmed=true \
  -p:TrimmerSingleWarn=false \
  -p:TrimMode=full
```

Look for warnings like:

```
warning IL2026: Using member 'System.Text.Json...' which has
'RequiresUnreferencedCodeAttribute'...
```

### Problem: AOT build fails with linker errors

Ensure you have the required native toolchain:

```bash
# Ubuntu
sudo apt install clang zlib1g-dev

# Verify
clang --version
```

### Problem: Reflection-based library fails after trimming

Add a trimmer roots file:

```xml
<!-- TrimmerRoots.xml -->
<linker>
  <assembly fullname="ProblematicLibrary" />
</linker>
```

Reference it in `.csproj`:

```xml
<ItemGroup>
  <TrimmerRootDescriptor Include="TrimmerRoots.xml" />
</ItemGroup>
```

> **Tip:** Run your full test suite against the trimmed/AOT binary before deploying.
> Trimming issues only manifest at runtime, not at build time.

---

## Centralized Publish Configuration

Put common settings in your `.csproj` so you do not need to repeat flags:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>

    <!-- Publishing defaults -->
    <SelfContained>true</SelfContained>
    <PublishSingleFile>true</PublishSingleFile>
    <PublishTrimmed>true</PublishTrimmed>
    <TrimMode>full</TrimMode>
    <EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
</Project>
```

Then publish is simply:

```bash
dotnet publish -c Release -r linux-x64 -o ./publish
```

---

## Summary

- Use **framework-dependent** for servers where you control the .NET installation.
- Use **self-contained** for distributing standalone applications.
- Use **single-file** for clean deployment of one executable.
- Use **ReadyToRun** to improve startup time for web services.
- Use **Native AOT** for the smallest, fastest binaries (with reflection limitations).
- Use **trimming** to reduce self-contained binary size.
- Always test trimmed and AOT builds thoroughly — runtime failures are common.
- Use multi-stage Docker builds for production container images.
