# ai-dump

Claude hooks that play sounds and show desktop notifications when the agent finishes a task, fails, or needs permission.

## Hooks

Three hooks fire automatically during Claude sessions:

| Event | Hook file | Default sound |
|---|---|---|
| Task completed | `notify-stop.js` | `task-completed.mp3` |
| Task failed | `notify-failure.js` | `task-failed.mp3` |
| Permission needed | `notify-permission.js` | `approval-required.mp3` |

Notifications are suppressed when a dev-focused app is frontmost (for example Cursor, Terminal, VS Code, iTerm2, Warp, common Linux terminals, or Windows Terminal). They only fire when the active window is something else.

---

## Installation

No npm install — hooks use Node built-ins only.

### Project level

Applies only to the current project. Place the hooks inside the project's `.claude/` directory:

```
your-project/
└── .claude/
    ├── config.json
    └── hooks/
        ├── platform.js
        ├── notify-stop.js
        ├── notify-failure.js
        └── notify-permission.js
```

### Root level

Applies to all Claude sessions across every project. Place the hooks inside `~/.claude/`:

```
~/.claude/
├── config.json
└── hooks/
    ├── platform.js
    ├── notify-stop.js
    ├── notify-failure.js
    └── notify-permission.js
```

Project-level config takes precedence over root-level config when both exist.

---

## Platform requirements

| OS | Notification | Sound |
|---|---|---|
| **macOS** | `osascript` (`display notification`) | `afplay` |
| **Linux** | `notify-send` (if available) | `mpg123` or `ffplay` (first found) |
| **Windows** | PowerShell tray balloon | PowerShell `MediaPlayer` |

Frontmost-app detection (for suppression): **macOS** uses AppleScript / System Events; **Linux** uses `xdotool` when installed (otherwise suppression may not apply). **Windows** has no frontmost check; hooks always consider notifying unless you extend the list in `platform.js`.

Set `DEBUG=1` (or any non-empty value) when running Node if you want errors from sound/notification code on **stderr** — normal hook **stdout** stays clean for Claude.

---

<details>
<summary>Disable all hooks</summary>

Set `enabled` to `false` in `.claude/config.json`:

```json
{ "enabled": false }
```

</details>

<details>
<summary>Enable or disable a specific hook</summary>

Toggle the `enabled` field on any hook in `.claude/config.json`:

```json
{
  "hooks": {
    "task_done":        { "enabled": false },
    "task_failed":      { "enabled": true  },
    "permission_needed":{ "enabled": true  }
  }
}
```

</details>

<details>
<summary>Change a sound</summary>

Update the `sound` field for the relevant hook and drop the `.mp3` into the sounds directory:

```json
{
  "hooks": {
    "task_done": { "enabled": true, "sound": "my-custom-sound.mp3" }
  }
}
```

</details>

<details>
<summary>Change the sounds directory</summary>

Update `sounds_directory` in `.claude/config.json` to any absolute or relative path:

```json
{ "sounds_directory": "/Users/you/sounds" }
```

</details>
