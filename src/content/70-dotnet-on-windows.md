# Setting Up .NET 10 on Windows 11

Setting up .NET 10 on Windows 11 is the first step to professional C# development. This lesson covers every installation method, SDK management, terminal configuration, and environment verification.

---

## Installation Methods at a Glance

| Method | Best For | Multiple SDKs | Auto-Update |
|---|---|---|---|
| Visual Studio 2026 installer | Most developers | Yes | Yes (via VS updates) |
| Standalone SDK installer | CLI-first workflow | Yes | No |
| winget | Scripted / repeatable setup | Yes | Yes (`winget upgrade`) |
| dotnet-install.ps1 | CI / version pinning | Yes | No |

---

## Method 1 — Install via Visual Studio 2026

Visual Studio 2026 bundles the .NET 10 SDK automatically when you install the right workloads. If you plan to use VS as your primary IDE, this is the simplest path.

1. Download Visual Studio 2026 from [visualstudio.microsoft.com](https://visualstudio.microsoft.com)
2. In the installer, select at least:
   - **ASP.NET and web development**
   - **.NET desktop development**
3. The installer will pull the latest .NET 10 SDK

After installation, open a terminal and verify:

```powershell
dotnet --version
# Expected: 10.x.x

dotnet --list-sdks
# Shows all installed SDK versions and their paths
```

---

## Method 2 — Standalone SDK Installer

Download the .NET 10 SDK directly from [dotnet.microsoft.com/download](https://dotnet.microsoft.com/download).

1. Choose **Windows** > **x64** (or ARM64 if on a Surface Pro X / ARM device)
2. Download the **.NET SDK** (not just the runtime)
3. Run the installer — it adds `dotnet` to your PATH automatically

```powershell
# Verify after install
dotnet --version
dotnet --list-sdks
dotnet --list-runtimes
```

---

## Method 3 — Install via winget

`winget` is the Windows Package Manager, built into Windows 11. This is the best method for scripted or repeatable setups.

```powershell
# Search for available .NET SDKs
winget search Microsoft.DotNet.SDK

# Install .NET 10 SDK
winget install Microsoft.DotNet.SDK.10

# Later — upgrade to latest patch
winget upgrade Microsoft.DotNet.SDK.10
```

> **Tip:** winget is great for setting up a new machine. You can script all your dev tool installations into a single `.ps1` file.

---

## Method 4 — dotnet-install.ps1 Script

The official install script is useful for CI pipelines and pinning exact SDK versions.

```powershell
# Download the script
Invoke-WebRequest -Uri https://dot.net/v1/dotnet-install.ps1 -OutFile dotnet-install.ps1

# Install a specific SDK version
.\dotnet-install.ps1 -Version 10.0.100

# Install latest 10.x
.\dotnet-install.ps1 -Channel 10.0
```

The script installs to `$env:LOCALAPPDATA\Microsoft\dotnet` by default. You may need to add this to your PATH manually.

---

## Managing Multiple SDK Versions

You can have multiple .NET SDKs installed side by side. The `global.json` file controls which SDK a project uses.

```powershell
# See all installed SDKs
dotnet --list-sdks
```

Example output:

```
8.0.400 [C:\Program Files\dotnet\sdk]
9.0.200 [C:\Program Files\dotnet\sdk]
10.0.100 [C:\Program Files\dotnet\sdk]
```

### Pinning a project to a specific SDK

Create a `global.json` in your project or solution root:

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestPatch"
  }
}
```

The `rollForward` policy controls how flexible the version matching is:

| Policy | Behavior |
|---|---|
| `disable` | Exact match only |
| `latestPatch` | Use latest patch of the specified major.minor.feature |
| `latestFeature` | Use latest feature band of the specified major.minor |
| `latestMinor` | Use latest minor of the specified major |
| `latestMajor` | Use any installed SDK (most flexible) |

```powershell
# Create global.json from the CLI
dotnet new globaljson --sdk-version 10.0.100 --roll-forward latestPatch
```

---

## Where dotnet Lives on Windows

The default installation paths:

| Item | Path |
|---|---|
| SDK & runtime | `C:\Program Files\dotnet\` |
| dotnet.exe | `C:\Program Files\dotnet\dotnet.exe` |
| SDKs | `C:\Program Files\dotnet\sdk\` |
| Runtimes | `C:\Program Files\dotnet\shared\` |
| NuGet global cache | `%USERPROFILE%\.nuget\packages\` |
| User tools | `%USERPROFILE%\.dotnet\tools\` |

The installer adds `C:\Program Files\dotnet\` to the system PATH. You can verify:

```powershell
where.exe dotnet
# Expected: C:\Program Files\dotnet\dotnet.exe
```

---

## Windows Terminal Setup

Windows Terminal is the modern terminal for Windows 11. It supports tabs, panes, GPU-accelerated rendering, and profiles for PowerShell, Command Prompt, Git Bash, and WSL.

### Why Windows Terminal over cmd.exe

| Feature | cmd.exe | Windows Terminal |
|---|---|---|
| Tabs | No | Yes |
| Split panes | No | Yes |
| GPU rendering | No | Yes |
| Unicode / emoji | Limited | Full |
| Customizable themes | No | Yes |
| Multiple shell profiles | No | Yes |

### Install (if not already present)

```powershell
winget install Microsoft.WindowsTerminal
```

### Recommended settings

Open Settings (Ctrl+,) and configure:

- **Default profile:** PowerShell 7 (not Windows PowerShell 5.1)
- **Font:** Cascadia Code NF or JetBrains Mono NF (Nerd Font for icons)
- **Color scheme:** One Half Dark, Catppuccin Mocha, or Tokyo Night
- **Starting directory:** `C:\Users\Tiger.Schueler\source`

---

## PowerShell vs Command Prompt

| Feature | Command Prompt | PowerShell 7 |
|---|---|---|
| Scripting | Batch files (.bat) | Full scripting language (.ps1) |
| Object pipeline | Text only | Rich .NET objects |
| Tab completion | Basic | Extensible (PSReadLine) |
| Module system | None | PowerShell Gallery |
| Cross-platform | Windows only | Windows, Linux, macOS |
| dotnet CLI support | Full | Full |

**Recommendation:** Use **PowerShell 7** in **Windows Terminal** for all .NET development.

```powershell
# Install PowerShell 7 if needed
winget install Microsoft.PowerShell
```

---

## Environment Variables on Windows

### Setting variables for the current session

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:ConnectionStrings__Default = "Server=localhost;Database=MyDb;Trusted_Connection=true"
```

### Setting persistent variables

**User-level** (persists across sessions, current user only):

```powershell
[Environment]::SetEnvironmentVariable("DOTNET_CLI_TELEMETRY_OPTOUT", "1", "User")
```

**System-level** (all users, requires admin):

```powershell
[Environment]::SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development", "Machine")
```

**Via GUI:** Settings > System > About > Advanced system settings > Environment Variables.

### Common .NET environment variables

| Variable | Purpose | Example |
|---|---|---|
| `DOTNET_CLI_TELEMETRY_OPTOUT` | Disable telemetry | `1` |
| `DOTNET_ENVIRONMENT` | Generic host environment | `Development` |
| `ASPNETCORE_ENVIRONMENT` | ASP.NET Core environment | `Development` |
| `ASPNETCORE_URLS` | Override listening URLs | `https://localhost:5001` |

---

## Verifying Everything Works End to End

Run through this checklist to confirm your setup is complete:

```powershell
# 1. dotnet is on PATH
dotnet --version

# 2. SDK is installed
dotnet --list-sdks

# 3. Create a test project
dotnet new console -n HelloWindows
cd HelloWindows

# 4. Build and run
dotnet run
# Expected: Hello, World!

# 5. Clean up
cd ..
Remove-Item -Recurse -Force HelloWindows
```

If all five steps succeed, your .NET 10 environment is ready for development.
