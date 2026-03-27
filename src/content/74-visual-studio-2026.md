# Visual Studio 2026 Setup and Mastery

Visual Studio 2026 is the most powerful IDE for C# development on Windows. This lesson covers installation, workload selection, essential configuration, and the productivity features that make VS indispensable for professional .NET development.

---

## Installing Visual Studio 2026

Download the installer from [visualstudio.microsoft.com](https://visualstudio.microsoft.com).

### Editions

| Edition | Cost | Use Case |
|---|---|---|
| Community | Free | Individual developers, open source, education |
| Professional | Paid | Small teams |
| Enterprise | Paid | Large organizations, advanced testing/DevOps |

### Workloads to Install

Workloads are bundles of tools for specific development scenarios. Select these in the installer:

**Essential workloads:**

- **ASP.NET and web development** — Web APIs, MVC, Razor Pages, Blazor
- **.NET desktop development** — Console apps, WPF, WinForms, class libraries
- **Data storage and processing** — SQL Server Data Tools (SSDT), database projects

**Optional but useful:**

- **Azure development** — If deploying to Azure
- **.NET Multi-platform App UI (MAUI)** — Cross-platform mobile/desktop apps

### Individual Components Worth Adding

After selecting workloads, switch to the **Individual components** tab and add:

- **Git for Windows** (if not already installed)
- **.NET profiling tools**
- **IntelliCode** (AI-assisted IntelliSense)
- **Live Unit Testing** (Enterprise only)

---

## First Launch Configuration

### Choose your theme

Settings > General > Color theme:

| Theme | Best For |
|---|---|
| Dark | Most developers (easier on eyes) |
| Blue | Classic VS look |
| Light | High-ambient-light environments |

### Set default environment

On first launch, VS asks you to choose a development environment. Select **Visual C#** — this configures keyboard shortcuts and window layouts for C# development.

### Configure text editor defaults

Go to **Tools > Options > Text Editor > C# > Advanced**:

- Enable **Inline Parameter Name Hints** — shows parameter names at call sites
- Enable **Inline Type Hints** — shows inferred types for `var`

Go to **Tools > Options > Text Editor > C# > Code Style**:

- Set `var` preferences (prefer explicit types, prefer `var` when type is apparent, etc.)
- Configure naming conventions to match your team's standards

---

## Solution Explorer — The Heart of VS

Solution Explorer is where you manage your projects, files, references, and dependencies.

### Key operations

| Action | How |
|---|---|
| Open Solution Explorer | View > Solution Explorer (Ctrl+Alt+L) |
| Search files | Ctrl+; in Solution Explorer search box |
| Add new project | Right-click solution > Add > New Project |
| Add existing project | Right-click solution > Add > Existing Project |
| Add project reference | Right-click Dependencies > Add Project Reference |
| Manage NuGet packages | Right-click project > Manage NuGet Packages |
| Edit .csproj directly | Double-click the project node |
| View file on disk | Right-click file > Open Containing Folder |
| Scope to project | Double-click a project to scope Solution Explorer |
| Unscope | Click the back arrow at the top of Solution Explorer |

### File nesting

VS automatically nests related files. For example:

```
Controllers/
  HomeController.cs        ← main file
    HomeController.Tests.cs  ← nested under it
appsettings.json
  appsettings.Development.json  ← nested
```

Toggle nesting with the **Nesting** icon in the Solution Explorer toolbar.

---

## Essential Keyboard Shortcuts

### Navigation

| Shortcut | Action |
|---|---|
| Ctrl+T | Go to All (search files, types, members) |
| Ctrl+, | Go to All (alternative) |
| F12 | Go to Definition |
| Ctrl+F12 | Go to Implementation |
| Shift+F12 | Find All References |
| Alt+F12 | Peek Definition (inline preview) |
| Ctrl+- | Navigate Backward |
| Ctrl+Shift+- | Navigate Forward |
| Ctrl+G | Go to Line |

### Editing

| Shortcut | Action |
|---|---|
| Ctrl+D | Duplicate line |
| Alt+Up/Down | Move line up/down |
| Ctrl+Shift+K | Delete line |
| Ctrl+K, Ctrl+C | Comment selection |
| Ctrl+K, Ctrl+U | Uncomment selection |
| Ctrl+K, Ctrl+D | Format document |
| Ctrl+. | Quick Actions (refactoring suggestions) |
| Ctrl+R, Ctrl+R | Rename symbol |
| Ctrl+Shift+Space | Parameter info |

### Building and Running

| Shortcut | Action |
|---|---|
| Ctrl+Shift+B | Build solution |
| F5 | Start with debugger |
| Ctrl+F5 | Start without debugger |
| Shift+F5 | Stop debugging |
| F9 | Toggle breakpoint |
| F10 | Step over |
| F11 | Step into |
| Shift+F11 | Step out |

### Windows

| Shortcut | Action |
|---|---|
| Ctrl+Alt+L | Solution Explorer |
| Ctrl+\, E | Error List |
| Ctrl+` | Terminal |
| Ctrl+Alt+O | Output window |
| Ctrl+Q | Quick Launch (search settings/commands) |

---

## The Debugger

The Visual Studio debugger is the most powerful debugging tool in the .NET ecosystem.

### Breakpoints

| Type | How | Use Case |
|---|---|---|
| Line breakpoint | F9 on a line | Pause at a specific line |
| Conditional breakpoint | Right-click breakpoint > Conditions | Pause only when a condition is true |
| Hit count breakpoint | Right-click breakpoint > Conditions > Hit Count | Pause after N hits |
| Tracepoint | Right-click breakpoint > Actions | Log a message without pausing |
| Exception breakpoint | Debug > Windows > Exception Settings | Break when an exception is thrown |

### Data inspection

| Feature | How |
|---|---|
| Hover over variable | Shows current value in tooltip |
| Watch window | Debug > Windows > Watch (add expressions to track) |
| Locals window | Debug > Windows > Locals (all local variables) |
| Autos window | Debug > Windows > Autos (variables used nearby) |
| Immediate window | Debug > Windows > Immediate (evaluate expressions at runtime) |
| DataTips | Hover over a variable, pin the tooltip to keep it visible |

### Advanced debugging

| Feature | Description |
|---|---|
| Edit and Continue | Modify code while debugging and apply changes live |
| Hot Reload | Apply code changes without restarting (Ctrl+Shift+Enter) |
| Return Value | See method return values in the Autos window |
| Run to Cursor | Right-click > Run to Cursor (Ctrl+F10) |
| Set Next Statement | Right-click > Set Next Statement (move execution point) |
| Diagnostic Tools | CPU, memory, and event profiling while debugging |

---

## IntelliSense and AI Assistance

### IntelliSense

IntelliSense provides real-time code completion, parameter info, quick info, and member lists.

- **Trigger manually:** Ctrl+Space
- **Parameter info:** Ctrl+Shift+Space
- **Complete word:** Tab or Enter
- **Filter list:** Type to narrow, use camelCase shortcuts (e.g., type `cw` to find `Console.WriteLine`)

### IntelliCode

IntelliCode uses AI to rank completions by likelihood. The most probable completion appears first with a star icon. It learns from your codebase and the broader .NET ecosystem.

---

## Code Refactoring

Press **Ctrl+.** on any code element to see available refactorings:

| Refactoring | What It Does |
|---|---|
| Rename | Rename a symbol across the entire solution |
| Extract Method | Pull selected code into a new method |
| Extract Interface | Create an interface from a class's public members |
| Inline Variable | Replace a variable with its value |
| Introduce Variable | Extract an expression into a named variable |
| Move Type to File | Move a type to a file matching its name |
| Generate Constructor | Create a constructor from selected fields |
| Add Parameter | Add a parameter to a method and update all callers |
| Convert to Top-Level Statements | Simplify Program.cs |

---

## Built-in Terminal

VS 2026 has an integrated terminal: **View > Terminal** or **Ctrl+`**.

Configure it at **Tools > Options > Environment > Terminal**:

- Set default shell to **PowerShell 7** or **Git Bash**
- Run `dotnet` CLI commands directly without leaving the IDE

---

## Extensions Worth Installing

| Extension | Purpose |
|---|---|
| **ReSharper** | Advanced refactoring, code analysis (paid) |
| **Fine Code Coverage** | Visualize test coverage in the editor |
| **Markdown Editor** | Preview and edit markdown files |
| **Editor Guidelines** | Vertical line at column 120 for line length |
| **Productivity Power Tools** | Suite of small productivity enhancements |
| **SQLite/SQL Server Compact Toolbox** | Browse local databases |

Install extensions at **Extensions > Manage Extensions**.

---

## Solution-Level Configuration Files

| File | Purpose |
|---|---|
| `.editorconfig` | Code style rules enforced by the IDE and compiler |
| `Directory.Build.props` | Shared MSBuild properties for all projects |
| `Directory.Packages.props` | Central package management |
| `global.json` | Pin SDK version |
| `NuGet.Config` | Package source configuration |
| `.gitignore` | Git ignore rules (use VS template) |

### Creating .editorconfig

Right-click the solution > **Add > New EditorConfig (IntelliSense)** — VS generates a file with all available C# style rules that you can customize.
