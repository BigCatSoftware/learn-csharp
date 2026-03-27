# LazyVim + C# on Ubuntu

LazyVim is a Neovim distribution that provides a batteries-included IDE experience.
This lesson covers setting up full C# language support, including LSP, debugging, testing,
and efficient keymaps for .NET development.

---

## Prerequisites

Before setting up C# support in LazyVim, ensure you have:

```bash
# Neovim 0.10+ (required for LazyVim)
nvim --version

# .NET SDK installed
dotnet --version

# Node.js (needed by some LSP tooling)
node --version
```

> **Important:** LazyVim expects Neovim 0.10 or later. If your Ubuntu repos have an older
> version, install from the Neovim PPA or download the appimage:
> ```bash
> curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim.appimage
> chmod u+x nvim.appimage
> sudo mv nvim.appimage /usr/local/bin/nvim
> ```

---

## Enabling the C# Extra

LazyVim has a built-in C# language extra that configures LSP, treesitter, and formatting.

### Step 1: Open the Extras menu

Launch Neovim and type:

```
:LazyExtras
```

### Step 2: Enable the C# extra

Scroll to `lang.cs` or search for it. Press `x` to toggle it on. This enables:

```
lazyvim.plugins.extras.lang.cs
```

Alternatively, create the file manually:

```lua
-- ~/.config/nvim/lua/plugins/csharp.lua
return {
  { import = "lazyvim.plugins.extras.lang.cs" },
}
```

Restart Neovim and run `:Lazy sync` to install all components.

> **Tip:** After enabling the extra, run `:Mason` to verify the language server was
> installed. You should see `omnisharp` or `roslyn` in the installed list.

---

## Choosing a Language Server

There are three C# language servers available. Each has trade-offs.

| Server | Package | Strengths | Weaknesses |
|---|---|---|---|
| **Roslyn LSP** | `roslyn` (via Mason) | Official Microsoft server, best analysis | Newer, may have rough edges |
| **OmniSharp** | `omnisharp` (via Mason) | Mature, widely tested | Heavier, slower startup |
| **csharp-ls** | `csharp-ls` (dotnet tool) | Lightweight, fast | Fewer features |

### LazyVim Default

The `lang.cs` extra configures **Roslyn LSP** by default (as of LazyVim 2024+). This is
the recommended choice for most developers.

### Using OmniSharp Instead

If you prefer OmniSharp:

```lua
-- ~/.config/nvim/lua/plugins/csharp-override.lua
return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        omnisharp = {
          enabled = true,
          cmd = { "omnisharp", "--languageserver" },
          settings = {
            FormattingOptions = {
              EnableEditorConfigSupport = true,
            },
            RoslynExtensionsOptions = {
              EnableAnalyzersSupport = true,
              EnableImportCompletion = true,
            },
          },
        },
      },
    },
  },
}
```

### Using csharp-ls

```bash
# Install as a global tool
dotnet tool install -g csharp-ls
```

```lua
-- ~/.config/nvim/lua/plugins/csharp-override.lua
return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        csharp_ls = {
          enabled = true,
        },
      },
    },
  },
}
```

---

## PATH Configuration

.NET global tools install to `~/.dotnet/tools`. The language server and other tools
need this in your PATH.

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export DOTNET_ROOT="$HOME/.dotnet"
export PATH="$DOTNET_ROOT:$DOTNET_ROOT/tools:$PATH"
```

> **Warning:** If `~/.dotnet/tools` is not in your PATH, Mason-installed tools like
> `csharp-ls` will fail silently. Always verify with `which csharp-ls` after installation.

Reload and verify:

```bash
source ~/.bashrc
which dotnet
echo $DOTNET_ROOT
```

---

## Key LSP Features

Once the C# language server is running, you get full IDE features. Here are the most
important keymaps (LazyVim defaults):

### Navigation

| Keymap | Action | Description |
|---|---|---|
| `gd` | Go to definition | Jump to where a type/method is defined |
| `gr` | Find references | List all usages of a symbol |
| `gI` | Go to implementation | Jump to interface implementations |
| `gy` | Go to type definition | Jump to the type of a variable |
| `K` | Hover documentation | Show docs for the symbol under cursor |
| `<leader>ss` | Document symbols | List all symbols in current file |
| `<leader>sS` | Workspace symbols | Search symbols across the solution |

### Refactoring

| Keymap | Action | Description |
|---|---|---|
| `<leader>cr` | Rename | Rename a symbol across the entire solution |
| `<leader>ca` | Code action | Extract method, implement interface, etc. |
| `<leader>cf` | Format | Format the current file |
| `<leader>cd` | Line diagnostics | Show error/warning details |

### Diagnostics

| Keymap | Action | Description |
|---|---|---|
| `]d` | Next diagnostic | Jump to next error/warning |
| `[d` | Previous diagnostic | Jump to previous error/warning |
| `<leader>xx` | Trouble toggle | Open the diagnostics panel |
| `<leader>xX` | Buffer diagnostics | Show diagnostics for current file |

> **Tip:** Press `<leader>ca` on a squiggly line to see available code actions. The
> Roslyn LSP provides dozens of refactorings: extract method, extract variable, inline
> variable, add null check, implement interface, generate constructor, and more.

---

## Debugging with nvim-dap and netcoredbg

### Install netcoredbg

```bash
# Via Mason (recommended)
# Open Neovim and run :MasonInstall netcoredbg

# Or manually
mkdir -p ~/.local/share/netcoredbg
cd ~/.local/share/netcoredbg
curl -sSL https://github.com/Samsung/netcoredbg/releases/latest/download/netcoredbg-linux-amd64.tar.gz | tar xz
```

### Configure nvim-dap

LazyVim's `lang.cs` extra may configure this automatically. If not, add:

```lua
-- ~/.config/nvim/lua/plugins/dap-csharp.lua
return {
  {
    "mfussenegger/nvim-dap",
    opts = function()
      local dap = require("dap")

      dap.adapters.coreclr = {
        type = "executable",
        command = vim.fn.stdpath("data") .. "/mason/bin/netcoredbg",
        args = { "--interpreter=vscode" },
      }

      dap.configurations.cs = {
        {
          type = "coreclr",
          name = "Launch",
          request = "launch",
          program = function()
            -- Find the DLL to debug
            return vim.fn.input("Path to dll: ", vim.fn.getcwd() .. "/bin/Debug/net9.0/", "file")
          end,
          cwd = "${workspaceFolder}",
          stopOnEntry = false,
        },
        {
          type = "coreclr",
          name = "Attach",
          request = "attach",
          processId = require("dap.utils").pick_process,
        },
      }
    end,
  },
}
```

### Debugging Keymaps

| Keymap | Action |
|---|---|
| `<leader>db` | Toggle breakpoint |
| `<leader>dB` | Conditional breakpoint |
| `<leader>dc` | Continue / Start debugging |
| `<leader>di` | Step into |
| `<leader>do` | Step over |
| `<leader>dO` | Step out |
| `<leader>dt` | Terminate |
| `<leader>dr` | Toggle REPL |
| `<leader>du` | Toggle DAP UI |

### Debug Workflow

```bash
# Build first so the DLL exists
dotnet build
```

Then in Neovim:

1. Set breakpoints with `<leader>db`
2. Start debugging with `<leader>dc`
3. Enter the path to your DLL (e.g., `bin/Debug/net9.0/MyApp.dll`)
4. Step through code with `<leader>di` and `<leader>do`

> **Note:** Always `dotnet build` before debugging. The debugger attaches to the compiled
> DLL, not the source files directly.

---

## Running dotnet Commands from Neovim

### Using :terminal

```vim
" Open a terminal in a horizontal split
:split | terminal dotnet build

" Open in a vertical split
:vsplit | terminal dotnet test

" Run with watch mode
:terminal dotnet watch run --project src/Api/Api.csproj
```

### Using vim-dispatch or toggleterm

```lua
-- ~/.config/nvim/lua/plugins/toggleterm.lua
return {
  {
    "akinsho/toggleterm.nvim",
    keys = {
      { "<leader>tb", "<cmd>TermExec cmd='dotnet build'<cr>", desc = "Build" },
      { "<leader>tt", "<cmd>TermExec cmd='dotnet test'<cr>", desc = "Test" },
      { "<leader>tr", "<cmd>TermExec cmd='dotnet run'<cr>", desc = "Run" },
    },
  },
}
```

---

## Test Runner with Neotest

Neotest provides a rich test runner UI inside Neovim.

```lua
-- ~/.config/nvim/lua/plugins/neotest-csharp.lua
return {
  {
    "nvim-neotest/neotest",
    dependencies = {
      "Issafalcon/neotest-dotnet",
    },
    opts = {
      adapters = {
        ["neotest-dotnet"] = {
          discovery_root = "solution",
        },
      },
    },
  },
}
```

### Neotest Keymaps

| Keymap | Action |
|---|---|
| `<leader>tn` | Run nearest test |
| `<leader>tf` | Run all tests in file |
| `<leader>ts` | Toggle test summary |
| `<leader>to` | Show test output |

> **Tip:** Neotest shows green/red indicators in the gutter next to each test method.
> This gives you instant feedback without leaving Neovim.

---

## Recommended Plugin Configuration Summary

```lua
-- ~/.config/nvim/lua/plugins/csharp-full.lua
return {
  -- Enable the C# language extra
  { import = "lazyvim.plugins.extras.lang.cs" },

  -- Neotest for test runner
  {
    "nvim-neotest/neotest",
    dependencies = { "Issafalcon/neotest-dotnet" },
    opts = {
      adapters = {
        ["neotest-dotnet"] = { discovery_root = "solution" },
      },
    },
  },

  -- Custom keymaps for dotnet commands
  {
    "folke/which-key.nvim",
    opts = {
      spec = {
        { "<leader>D", group = "dotnet" },
      },
    },
  },
}
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| LSP not starting | Check `:LspInfo` — ensure the server path is valid |
| No completions | Verify the `.sln` or `.csproj` is in the workspace root |
| Slow LSP startup | Large solutions take time; OmniSharp may take 30-60 seconds |
| Diagnostics missing | Run `:LspRestart` or rebuild with `dotnet build` |
| Mason install fails | Check `:Mason` logs; ensure `~/.dotnet/tools` is in PATH |

> **Tip:** Run `:checkhealth` in Neovim to diagnose common setup issues with LSP,
> treesitter, and Mason.

---

## Summary

- Enable the `lang.cs` extra in LazyVim for one-step C# setup.
- The Roslyn LSP is the recommended language server for C# in Neovim.
- Use `netcoredbg` with `nvim-dap` for step-through debugging.
- Use `neotest-dotnet` for an integrated test runner.
- Keep `~/.dotnet/tools` in your PATH for all .NET tooling to work.
