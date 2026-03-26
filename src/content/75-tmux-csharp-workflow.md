# tmux Workflow for C# Development

tmux is a terminal multiplexer that lets you split your terminal into panes and windows,
manage long-running processes, and keep sessions alive across SSH disconnects. Combined
with LazyVim and the dotnet CLI, it creates a powerful C# development environment
entirely in the terminal.

---

## Why tmux for C# Development?

- Run `dotnet watch` in one pane while editing in another
- See build errors and test results without leaving your editor
- Keep sessions persistent across terminal closes and SSH disconnects
- Switch between multiple project sessions instantly

---

## Recommended Session Layout

Here is the layout that works well for day-to-day C# work:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                                                 │
│              LazyVim (Editor)                   │
│              Pane 0 — Main                      │
│                                                 │
│                                                 │
├────────────────────────┬────────────────────────┤
│                        │                        │
│  dotnet watch run      │  dotnet test / shell   │
│  Pane 1 — Watch        │  Pane 2 — Tests        │
│                        │                        │
└────────────────────────┴────────────────────────┘
```

### Creating This Layout

```bash
# Start a new session named after your project
tmux new-session -s order-system -c ~/src/OrderSystem

# You are now in Pane 0 — launch your editor
nvim .

# Split horizontally (bottom pane)
# Press: Ctrl-b %  (or Ctrl-b " for vertical split — convention varies)
# We want a horizontal split below:
# Press: Ctrl-b "

# You are now in Pane 1 — run dotnet watch
dotnet watch run --project src/Api/Api.csproj

# Split Pane 1 vertically to create Pane 2
# Press: Ctrl-b %

# You are now in Pane 2 — run tests or use as a shell
dotnet test --watch
```

### Quick Commands to Set Up from the Shell

```bash
# Create the entire layout in one script
tmux new-session -d -s order-system -c ~/src/OrderSystem

# Main pane: editor
tmux send-keys -t order-system 'nvim .' Enter

# Create bottom-left pane: watch
tmux split-window -v -t order-system -c ~/src/OrderSystem
tmux send-keys -t order-system 'dotnet watch run --project src/Api/Api.csproj' Enter

# Create bottom-right pane: tests
tmux split-window -h -t order-system -c ~/src/OrderSystem
tmux send-keys -t order-system 'dotnet watch test' Enter

# Resize the editor pane to take 70% of the height
tmux select-pane -t 0
tmux resize-pane -U 15

# Attach to the session
tmux attach -t order-system
```

---

## Essential tmux Keybindings

All tmux commands start with the **prefix key**, which is `Ctrl-b` by default.

### Pane Management

| Keys | Action |
|---|---|
| `Ctrl-b "` | Split pane horizontally (top/bottom) |
| `Ctrl-b %` | Split pane vertically (left/right) |
| `Ctrl-b o` | Cycle to next pane |
| `Ctrl-b ;` | Toggle to last active pane |
| `Ctrl-b z` | Zoom/unzoom current pane (fullscreen toggle) |
| `Ctrl-b x` | Close current pane |
| `Ctrl-b {` | Swap pane with previous |
| `Ctrl-b }` | Swap pane with next |
| `Ctrl-b Arrow` | Move to pane in direction |

### Window Management

| Keys | Action |
|---|---|
| `Ctrl-b c` | Create new window |
| `Ctrl-b n` | Next window |
| `Ctrl-b p` | Previous window |
| `Ctrl-b 0-9` | Switch to window by number |
| `Ctrl-b ,` | Rename current window |
| `Ctrl-b &` | Close current window |

### Session Management

| Keys | Action |
|---|---|
| `Ctrl-b d` | Detach from session |
| `Ctrl-b s` | List sessions |
| `Ctrl-b $` | Rename session |

> **Tip:** Use `Ctrl-b z` to zoom into a pane when you need full-screen focus on
> build output or test results, then `Ctrl-b z` again to zoom back out.

---

## tmux Session Naming Conventions

Name sessions after the project you are working on:

```bash
# Create sessions for different projects
tmux new-session -d -s order-system -c ~/src/OrderSystem
tmux new-session -d -s auth-service -c ~/src/AuthService
tmux new-session -d -s dotfiles -c ~/dotfiles

# List all sessions
tmux list-sessions
# auth-service: 1 windows (created ...)
# dotfiles: 1 windows (created ...)
# order-system: 3 windows (created ...)

# Switch between sessions
tmux switch-client -t order-system
# Or use Ctrl-b s to get an interactive session picker
```

---

## Running dotnet watch in a Dedicated Pane

`dotnet watch` rebuilds and re-runs your application whenever a file changes. It is
perfect for a dedicated tmux pane.

```bash
# Watch a web API with hot reload
dotnet watch run --project src/Api/Api.csproj

# Watch tests (re-runs on file changes)
dotnet watch test --project tests/Domain.Tests/Domain.Tests.csproj

# Watch with specific verbosity
dotnet watch run --project src/Api/Api.csproj -- --urls "http://localhost:5000"
```

### Workflow

1. Edit code in the LazyVim pane
2. Save the file (`:w`)
3. `dotnet watch` detects the change and rebuilds automatically
4. Check the watch pane for build errors or successful reload
5. Check the test pane for passing/failing tests

> **Note:** Hot reload works for many code changes without restarting. When a change
> cannot be hot-reloaded, the process restarts automatically. Watch the output for
> "Hot reload of changes succeeded" or "Restart requested" messages.

---

## Quick-Switch Between Editor and Terminal

### Method 1: Pane Navigation

```bash
# Map arrow keys for fast pane switching (add to .tmux.conf)
bind -n M-Left select-pane -L
bind -n M-Right select-pane -R
bind -n M-Up select-pane -U
bind -n M-Down select-pane -D
```

This lets you press `Alt+Arrow` to move between panes without the prefix key.

### Method 2: Zoom Toggle

Press `Ctrl-b z` to zoom into the editor pane. When you need to check build output,
press `Ctrl-b z` again, then `Ctrl-b o` to cycle to the watch pane.

### Method 3: Neovim Terminal

Use `:terminal` inside Neovim for quick one-off commands without switching panes:

```vim
:split | terminal dotnet build
```

---

## tmux-resurrect for Session Persistence

By default, tmux sessions are lost when the tmux server stops (e.g., after a reboot).
`tmux-resurrect` saves and restores sessions.

### Install with TPM (tmux Plugin Manager)

Add to `~/.tmux.conf`:

```bash
# Install TPM if not already installed
# git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

# In ~/.tmux.conf:
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'

# Auto-save every 15 minutes
set -g @continuum-restore 'on'

# Restore Neovim sessions
set -g @resurrect-strategy-nvim 'session'

# Initialize TPM (keep this at the very bottom)
run '~/.tmux/plugins/tpm/tpm'
```

### Usage

| Keys | Action |
|---|---|
| `Ctrl-b Ctrl-s` | Save session |
| `Ctrl-b Ctrl-r` | Restore session |

> **Important:** `tmux-resurrect` saves the pane layout and the commands that were running,
> but it cannot restore the state of interactive programs. After a restore, you may need
> to re-run `dotnet watch` or reopen Neovim manually.

---

## tmux-sessionizer for Project Switching

A sessionizer script lets you fuzzy-find projects and create/switch tmux sessions
instantly. This is inspired by ThePrimeagen's setup.

```bash
#!/usr/bin/env bash
# Save as ~/.local/bin/tmux-sessionizer
# chmod +x ~/.local/bin/tmux-sessionizer

# Directories to search for projects
SEARCH_DIRS="$HOME/src $HOME/dev"

selected=$(find $SEARCH_DIRS -mindepth 1 -maxdepth 2 -type d 2>/dev/null | fzf)

if [[ -z $selected ]]; then
    exit 0
fi

selected_name=$(basename "$selected" | tr . _)

if ! tmux has-session -t="$selected_name" 2>/dev/null; then
    tmux new-session -ds "$selected_name" -c "$selected"
fi

if [[ -z $TMUX ]]; then
    tmux attach-session -t "$selected_name"
else
    tmux switch-client -t "$selected_name"
fi
```

Bind it in tmux:

```bash
# In ~/.tmux.conf
bind-key f run-shell "tmux neww ~/.local/bin/tmux-sessionizer"
```

Now `Ctrl-b f` opens a fuzzy finder for all your projects. Select one and it creates
(or switches to) a tmux session for that project.

> **Tip:** Install `fzf` if you do not have it: `sudo apt install fzf`

---

## Example .tmux.conf

```bash
# ~/.tmux.conf

# Remap prefix to Ctrl-a (easier to reach)
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# Start windows and panes at 1, not 0
set -g base-index 1
setw -g pane-base-index 1

# Enable mouse support
set -g mouse on

# Increase scrollback buffer
set -g history-limit 50000

# Faster key repetition
set -sg escape-time 0

# True color support (important for Neovim themes)
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:Tc"

# Vi mode for copy
setw -g mode-keys vi

# Easy pane splitting
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"

# Alt+arrow for pane navigation (no prefix needed)
bind -n M-Left select-pane -L
bind -n M-Right select-pane -R
bind -n M-Up select-pane -U
bind -n M-Down select-pane -D

# Reload config
bind r source-file ~/.tmux.conf \; display "Config reloaded!"

# Sessionizer
bind-key f run-shell "tmux neww ~/.local/bin/tmux-sessionizer"

# Plugins
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @continuum-restore 'on'
set -g @resurrect-strategy-nvim 'session'

# Initialize TPM
run '~/.tmux/plugins/tpm/tpm'
```

---

## Shell Aliases for Common dotnet Commands

Add these to `~/.bashrc` or `~/.zshrc`:

```bash
# Dotnet aliases
alias db='dotnet build'
alias dr='dotnet run'
alias dt='dotnet test'
alias dw='dotnet watch run'
alias dwt='dotnet watch test'
alias dp='dotnet publish -c Release'
alias da='dotnet add package'
alias dl='dotnet list package'
alias dlo='dotnet list package --outdated'

# Quick project creation
alias dnew='dotnet new console -n'
alias dapi='dotnet new webapi -n'
alias dlib='dotnet new classlib -n'

# Clean everything
alias dclean='dotnet clean && find . -type d \( -name bin -o -name obj \) -exec rm -rf {} + 2>/dev/null; echo "Cleaned"'
```

> **Caution:** The `dclean` alias aggressively removes all `bin/` and `obj/` directories.
> This is useful when builds get into a bad state, but you will need to run `dotnet restore`
> afterward.

---

## Putting It All Together

A typical C# development session looks like this:

```bash
# 1. Start or attach to your project session
tmux attach -t order-system || tmux new -s order-system -c ~/src/OrderSystem

# 2. Open LazyVim in the main pane
nvim .

# 3. Split and start dotnet watch (Ctrl-b -)
dotnet watch run --project src/Api/Api.csproj

# 4. Split again for tests (Ctrl-b |)
dotnet watch test

# 5. Edit code in the editor pane, watch the other panes update
# 6. When done, detach with Ctrl-b d (session stays alive)
# 7. Reattach later with: tmux attach -t order-system
```

---

## Summary

- Use tmux to run LazyVim, `dotnet watch`, and tests side by side.
- Name sessions after projects for fast switching.
- Use `tmux-resurrect` and `tmux-continuum` to persist sessions across reboots.
- Build a sessionizer script for instant project switching with `fzf`.
- Set up shell aliases to reduce typing for common dotnet commands.
- Configure `.tmux.conf` with true color support, vi mode, and mouse support for the
  best Neovim integration.
