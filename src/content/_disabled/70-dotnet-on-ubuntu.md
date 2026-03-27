# Installing .NET on Ubuntu

Installing .NET on Ubuntu is the first step to C# development on Linux. This lesson covers
every installation method, SDK management, and troubleshooting common issues.

---

## Installation Methods at a Glance

| Method | Best For | Multiple SDKs | Auto-Update |
|---|---|---|---|
| Microsoft APT feed | Most developers | Yes | Yes (via apt) |
| Ubuntu built-in feed | Quick start | Yes | Yes (via apt) |
| Snap | Sandboxed install | No | Yes (auto) |
| dotnet-install.sh | CI / version pinning | Yes | No |

> **Important:** Do not mix installation methods. If you installed via the Microsoft feed,
> do not also install via snap. Mixing methods causes PATH conflicts and broken toolchains.

---

## Method 1 — Microsoft APT Package Feed (Recommended)

This is the most common approach and gives you the freshest SDK versions.

### Step 1: Register the Microsoft package repository

```bash
# Download and install the Microsoft package signing key
wget https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb
```

### Step 2: Install the SDK

```bash
sudo apt update
sudo apt install -y dotnet-sdk-9.0
```

To install a specific older version alongside the latest:

```bash
sudo apt install -y dotnet-sdk-8.0
```

### Step 3: Verify

```bash
dotnet --version
# 9.0.100

dotnet --list-sdks
# 8.0.404 [/usr/share/dotnet/sdk]
# 9.0.100 [/usr/share/dotnet/sdk]
```

> **Tip:** If you only need to run .NET apps (not build them), install just the runtime:
> `sudo apt install -y dotnet-runtime-9.0`

---

## Method 2 — Ubuntu Built-in Feed (.NET from Ubuntu Archive)

Starting with Ubuntu 22.04, Canonical ships .NET in the main Ubuntu archive.

```bash
sudo apt update
sudo apt install -y dotnet9
```

> **Warning:** The Ubuntu-provided packages and Microsoft-provided packages can conflict.
> If you have the Microsoft feed registered, Ubuntu may pull a mismatched combination.
> Use `apt list --installed | grep dotnet` to check which source you are using.

### Resolving APT Feed Priority Conflicts

If both feeds are present, create a priority pinning file:

```bash
sudo tee /etc/apt/preferences.d/dotnet-microsoft <<'EOF'
Package: dotnet* aspnet* netstandard*
Pin: origin packages.microsoft.com
Pin-Priority: 900
EOF
```

This forces APT to prefer the Microsoft feed for all .NET packages.

---

## Method 3 — Snap

```bash
sudo snap install dotnet-sdk --classic --channel=9.0
```

The snap package bundles the SDK, runtime, and ASP.NET runtime in one unit.

```bash
dotnet-sdk.dotnet --version
```

> **Caution:** The snap binary is `dotnet-sdk.dotnet`, not `dotnet`. You can alias it:
> `sudo snap alias dotnet-sdk.dotnet dotnet`

---

## Method 4 — dotnet-install.sh (Best for CI and Multiple Versions)

The official install script lets you install any SDK version side-by-side without root.

### Download the script

```bash
curl -sSL https://dot.net/v1/dotnet-install.sh -o dotnet-install.sh
chmod +x dotnet-install.sh
```

### Install specific SDK versions

```bash
# Install the latest .NET 9 SDK
./dotnet-install.sh --channel 9.0

# Install a specific version
./dotnet-install.sh --version 8.0.404

# Install to a custom location
./dotnet-install.sh --channel 9.0 --install-dir /opt/dotnet
```

### Configure PATH

The script installs to `~/.dotnet` by default. Add these lines to your `~/.bashrc` or
`~/.zshrc`:

```bash
export DOTNET_ROOT="$HOME/.dotnet"
export PATH="$DOTNET_ROOT:$DOTNET_ROOT/tools:$PATH"
```

Then reload:

```bash
source ~/.bashrc
```

> **Tip:** In CI pipelines, use `dotnet-install.sh` to pin exact SDK versions. This
> guarantees reproducible builds regardless of what the runner has pre-installed.

---

## Listing Installed SDKs and Runtimes

```bash
# List all installed SDKs
dotnet --list-sdks
# 8.0.404 [/usr/share/dotnet/sdk]
# 9.0.100 [/usr/share/dotnet/sdk]

# List all installed runtimes
dotnet --list-runtimes
# Microsoft.AspNetCore.App 8.0.12 [/usr/share/dotnet/shared/Microsoft.AspNetCore.App]
# Microsoft.AspNetCore.App 9.0.0 [/usr/share/dotnet/shared/Microsoft.AspNetCore.App]
# Microsoft.NETCore.App 8.0.12 [/usr/share/dotnet/shared/Microsoft.NETCore.App]
# Microsoft.NETCore.App 9.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]

# Show full environment info
dotnet --info
```

---

## Pinning SDK Version with global.json

When a team must use the same SDK version, create a `global.json` at the repository root:

```bash
dotnet new globaljson --sdk-version 9.0.100
```

This creates:

```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "latestPatch"
  }
}
```

### Roll-Forward Policies

| Policy | Behavior |
|---|---|
| `disable` | Exact version match required |
| `patch` | Use latest patch of the same major.minor.patch band |
| `latestPatch` | Use latest patch of the same major.minor |
| `feature` | Use latest feature band of the same major.minor |
| `latestFeature` | Use latest feature band of the same major.minor |
| `minor` | Use latest minor of the same major |
| `latestMinor` | Use latest minor of the same major |
| `latestMajor` | Use any latest installed SDK |

```json
{
  "sdk": {
    "version": "8.0.300",
    "rollForward": "latestFeature",
    "allowPrerelease": false
  }
}
```

> **Note:** `global.json` is read from the current directory upward. If no `global.json`
> is found, the latest installed SDK is used.

---

## Common PATH Issues and Fixes

### Symptom: `dotnet: command not found`

Check where .NET is installed:

```bash
which dotnet
ls /usr/share/dotnet/dotnet
ls ~/.dotnet/dotnet
```

Fix: add the correct path to your shell profile.

### Symptom: Wrong SDK version picked up

```bash
dotnet --version
# Shows 8.0 when you expect 9.0
```

Debug with:

```bash
dotnet --info | head -20
```

Check for a `global.json` pinning an older version:

```bash
find . -name global.json -maxdepth 3
```

### Symptom: `dotnet tool` commands not found after install

.NET global tools install to `~/.dotnet/tools`. Ensure it is in your PATH:

```bash
echo 'export PATH="$HOME/.dotnet/tools:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Symptom: SDK installs via script but APT dotnet overrides it

```bash
# Check which dotnet is first in PATH
which -a dotnet
```

If `/usr/bin/dotnet` comes before `~/.dotnet/dotnet`, reorder your PATH so `~/.dotnet`
appears first.

---

## Uninstalling Old Versions

### APT-installed SDKs

```bash
# List installed dotnet packages
apt list --installed 2>/dev/null | grep dotnet

# Remove a specific SDK
sudo apt remove dotnet-sdk-8.0

# Remove everything .NET related
sudo apt remove 'dotnet*' 'aspnet*'
sudo apt autoremove
```

### Script-installed SDKs

```bash
# SDKs installed via dotnet-install.sh are just directories
ls ~/.dotnet/sdk/
# 8.0.404  9.0.100

# Remove a specific version
rm -rf ~/.dotnet/sdk/8.0.404
rm -rf ~/.dotnet/shared/Microsoft.NETCore.App/8.0.12
rm -rf ~/.dotnet/shared/Microsoft.AspNetCore.App/8.0.12
```

### Snap

```bash
sudo snap remove dotnet-sdk
```

---

## Verifying a Working Installation

Run this quick smoke test after any installation:

```bash
# Create a temp project, build, and run it
cd /tmp
dotnet new console -n hello-test
cd hello-test
dotnet run
# Hello, World!

# Clean up
cd ..
rm -rf hello-test
```

> **Tip:** If `dotnet new` works but `dotnet build` fails with missing SDK errors,
> you likely have a runtime installed but not an SDK. Run `dotnet --list-sdks` to confirm.

---

## Summary

- Use the **Microsoft APT feed** for most development setups on Ubuntu.
- Use **dotnet-install.sh** when you need multiple SDK versions or CI reproducibility.
- Use **global.json** to pin SDK versions per project.
- Never mix installation methods on the same machine.
- Always ensure `~/.dotnet` and `~/.dotnet/tools` are in your PATH.
