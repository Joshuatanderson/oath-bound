---
name: tmux
description: Manage tmux sessions, windows, and panes for terminal multiplexing. Use when you need to run long-lived processes, organize multiple terminal contexts, or persist work across SSH disconnects.
license: MIT
---

# tmux Session Manager

Create and manage tmux sessions for persistent terminal workflows.

## When to use

- Running long processes that shouldn't die if the terminal closes
- Organizing multiple terminal contexts for a project
- Pairing or sharing terminal sessions
- Running dev server + tests + logs side by side

## Quick reference

### Sessions

```bash
# Create named session
tmux new -s my-project

# List sessions
tmux ls

# Attach to session
tmux attach -t my-project

# Detach from session (inside tmux)
# Ctrl+B, then D

# Kill session
tmux kill-session -t my-project
```

### Windows (tabs)

```bash
# New window
# Ctrl+B, then C

# Switch windows
# Ctrl+B, then 0-9 (by number)
# Ctrl+B, then N (next)
# Ctrl+B, then P (previous)

# Rename window
# Ctrl+B, then , (comma)
```

### Panes (splits)

```bash
# Horizontal split
# Ctrl+B, then "

# Vertical split
# Ctrl+B, then %

# Navigate panes
# Ctrl+B, then arrow keys

# Close pane
# exit (or Ctrl+D)
```

## Common project layout

Set up a development environment with one command:

```bash
tmux new-session -d -s dev -n editor
tmux send-keys -t dev:editor 'nvim .' Enter
tmux new-window -t dev -n server
tmux send-keys -t dev:server 'npm run dev' Enter
tmux new-window -t dev -n logs
tmux send-keys -t dev:logs 'tail -f logs/dev.log' Enter
tmux select-window -t dev:editor
tmux attach -t dev
```

## Tips

- Name sessions after projects for easy switching
- Use `tmux ls` before creating to avoid duplicates
- Detach (don't exit) to keep processes running
- Use `tmux kill-server` to clean up all sessions
