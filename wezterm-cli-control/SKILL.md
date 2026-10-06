---
name: wezterm-cli-control
description: "Control Windows WezTerm from WSL with `wezterm.exe cli`: inspect windows, tabs, panes, and text; send shell commands or TUI keystrokes; spawn tabs; and verify results. Use whenever the user asks to operate a WezTerm tab or pane, automate terminal input, read pane output, or control a tmux/SSH session through WezTerm."
---

# WezTerm CLI control from WSL

Use `wezterm.exe cli` as the pane-control API. Target a verified `pane_id`, not a guessed tab number, and read the pane after state changes.

## Start and target

Confirm the executable and inspect topology:

```bash
command -v wezterm.exe
wezterm.exe --version
wezterm.exe cli list --format json
```

Use stable evidence such as `tab_id`, title, workspace, or cwd to select the target pane. If a tab has multiple panes, inspect all of them rather than guessing.

Read before sending input:

```bash
wezterm.exe cli get-text --pane-id "$pane_id"
```

Classify the pane first: shell prompt, running command, or full-screen application. Send shell commands only to a shell; send keystrokes to Neovim, tmux, fzf, and other TUIs.

## Send input

Use `--no-paste` for commands and keystrokes. Send ordinary text, control keys, and Enter as distinct operations when mode or command completion matters.

```bash
printf '%s' 'printf READY' |
  wezterm.exe cli send-text --pane-id "$pane_id" --no-paste
printf '\n' |
  wezterm.exe cli send-text --pane-id "$pane_id" --no-paste
sleep 0.2
wezterm.exe cli get-text --pane-id "$pane_id"
```

For scrollback, add `--start-line -200 --end-line -1`. A successful CLI call only means WezTerm accepted the bytes; read the pane to confirm execution.

Do not put a literal `\n` inside ordinary shell text and expect Enter; send an actual newline byte. Avoid combining recovery keys, commands, and editor input into one opaque payload.

For multiline shell input, use a quoted outer heredoc and pipe it directly to `send-text`; use a different delimiter for the command's inner heredoc:

```bash
cat <<'SEND' | wezterm.exe cli send-text --pane-id "$pane_id" --no-paste
cat > /tmp/example.txt <<'FILE'
line one
line two
FILE
SEND
```

Quote both delimiters, keep each terminator alone on its own line, and do not reuse the delimiter.

## Full-screen applications

### Neovim

Treat input as editor keys and wait for the UI before typing. For multiline source, Neovim's autoindent can compound indentation. Use this sequence:

1. Leave insert mode and run `:set paste`.
2. Insert the complete source.
3. Leave insert mode and run `:set nopaste`.
4. Save and verify the file or run the requested command.

Keep mode transitions separate enough to detect a missed state. `get-text` does not by itself prove that a buffer was saved.

### tmux

WezTerm and tmux are separate input layers. Use tmux's prefix only when the pane is visibly attached to tmux. For tmux scrollback, `tmux capture-pane -p -S -200` inside the session can be more reliable than WezTerm screen capture.

## Spawn and recover

`spawn` creates a tab and prints its new pane ID:

```bash
new_pane=$(wezterm.exe cli spawn -- bash -lc 'exec ssh server-a -t "tmux new-session -A -s project-1"')
wezterm.exe cli get-text --pane-id "$new_pane"
```

Use `--new-window` only when a separate window is intended; use `--window-id` to select a destination window.

If input looks corrupted, stop, read the pane, send one Ctrl-C only if the state is recoverable, read again, and continue with the smallest next action. If a required CLI option is unavailable, report the installed version instead of silently using ambiguous input.

## References

- https://wezterm.org/cli/cli/index.html
- https://wezterm.org/cli/cli/list.html
- https://wezterm.org/cli/cli/get-text.html
- https://wezterm.org/cli/cli/send-text.html
- https://wezterm.org/cli/cli/spawn.html

