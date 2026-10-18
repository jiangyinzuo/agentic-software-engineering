---
name: wezterm-cli-control
description: "Operate WezTerm panes from WSL: inspect terminal state, send text or keys, manage tabs, and verify commands in shells, SSH, tmux, and TUIs."
---

# WezTerm CLI control

Select the pane → read its state → send appropriate input → verify the result.

## Target and inspect

```bash
wezterm.exe cli list --format json
wezterm.exe cli get-text --pane-id "$pane_id"
```

Use an observed pane ID, not a tab number. Explicit `--pane-id` avoids accidentally targeting the agent's pane via `WEZTERM_PANE`. Titles and cwd help locate a session; screen content identifies whether it is a shell, running command, or TUI. Recheck when the user may have repurposed the pane. Verify actual host/user before destructive operations.

`get-text` uses screen-relative lines: `0` is the current screen's first line; negative numbers address scrollback. With no range it returns the current screen. Omit `--end-line` to read through the screen bottom.

```bash
# Recent history plus current screen
wezterm.exe cli get-text --pane-id "$pane_id" --start-line -100
# History only, excluding the current screen
wezterm.exe cli get-text --pane-id "$pane_id" --start-line -200 --end-line -1
```

Use `--escapes` when color/style matters. Consult `wezterm.exe cli <command> --help` for installed-version behavior.

## Send text and keys

`send-text [TEXT]` accepts an argument or reads stdin. By default it uses bracketed paste **if the target application has enabled it**; `--no-paste` sends bytes directly.

For shell commands, prefer default paste for text, then send Enter separately:

```bash
printf '%s' 'printf "%s\n" READY' |
  wezterm.exe cli send-text --pane-id "$pane_id"
printf '\r' |
  wezterm.exe cli send-text --pane-id "$pane_id" --no-paste
wezterm.exe cli get-text --pane-id "$pane_id"
```

Check for unfinished user input before sending. Do not append to or erase it unintentionally; coordinate or use another pane if the user is typing. Reading and sending are not atomic.

Use `--no-paste` for control keys and deliberate direct input. For example, `printf '\003'` sends Ctrl-C; use it only when interruption is intended. An actual control byte is different from literal text such as `\n`.

Multiline paste behavior depends on the application. Without bracketed paste, newlines may execute commands immediately. Prefer transferring a file for large scripts; stdin and quoted heredocs help avoid nested shell quoting. Separate mode changes, text, and submission when their ordering matters.

CLI success confirms delivery, not execution. Read back the resulting output or application state.

## Completion and long output

Save verbose output to a log; inspect relevant excerpts rather than repeatedly capturing large scrollback ranges. For long commands, a fresh completion marker with exit status is more reliable than a fixed prompt:

```bash
( if command_to_run; then rc=0; else rc=$?; fi; printf '\n__WZ_DONE_unique_token__=%s\n' "$rc"; exit "$rc" )
```

Replace the token per run and look for the emitted standalone line, not the echoed command. For pipelines ending in `tee`, use Bash `set -o pipefail`. For multi-step jobs, invoke a script with its own error handling. Avoid tight polling; use completion notifications where available. If output scrolls away, inspect the log rather than rerunning the operation.

## TUIs and recovery

- **Neovim:** confirm mode before sending keys. Prefer bracketed paste for text in a supported editing mode; for direct multiline insertion, `:set paste` / `:set nopaste` can avoid doubled indentation. Verify saving separately from visible buffer contents.
- **tmux:** distinguish WezTerm's pane from the active tmux pane. Use tmux keys only in a confirmed tmux session; `tmux capture-pane -p -S -200` can retrieve its own scrollback.
- **Unexpected state:** stop sending, read again, and recover with the smallest appropriate action. Do not automatically send Ctrl-C to an unknown foreground job.

## Spawn

```bash
new_pane=$(wezterm.exe cli spawn -- bash -lc 'exec ssh server-a')
wezterm.exe cli get-text --pane-id "$new_pane"
```

`spawn` returns the new pane ID. Use `--window-id` to select a window, or `--new-window` when a separate window is desired. The new pane may show authentication or startup output rather than a ready shell.

Reference: https://wezterm.org/cli/cli/index.html
