# Claude Code hooks

## Overview

Hooks are **Node** scripts (no extra packages) registered in [`.claude/settings.json`](../.claude/settings.json). Each invocation receives a **JSON object on stdin**; scripts write **JSON to stdout** (these implementations print `{}` where required). Session logging shares logic with Cursor via [`.claude/hooks/session-tracker-utils.js`](../.claude/hooks/session-tracker-utils.js).

Official Claude Code hook contracts (all events) are documented upstream; this file describes **this repo’s** scripts only.

---

## Supported hooks

| Claude event | Script | Purpose |
|--------------|--------|---------|
| `SessionStart` | [`session-start.js`](../.claude/hooks/session-start.js) | Open/update a session row; resume handling; housekeeping. |
| `SessionEnd` | [`session-end.js`](../.claude/hooks/session-end.js) | Close session row; extract **Summary** bullets from transcript. |
| `Stop` | [`notify-stop.js`](../.claude/hooks/notify-stop.js) | Sound + desktop notification when a task completes. |
| `StopFailure` | [`notify-failure.js`](../.claude/hooks/notify-failure.js) | Sound + notification on failure. |
| `PermissionRequest` | [`notify-permission.js`](../.claude/hooks/notify-permission.js) | Sound + notification when approval is needed. |

---

## What each hook does

### `SessionStart` (`session-start.js`)

Runs when you **start or resume** a Claude session. If session logging is enabled, it records that session in your work log (project/branch and related metadata). Does nothing when logging is turned off.

### `SessionEnd` (`session-end.js`)

Runs when the session **ends**. Saves when it ended and how long it ran, and tries to capture any **Summary** section from the conversation transcript into the log.

### Notify hooks (`notify-*.js`)

**Stop**, **StopFailure**, and **PermissionRequest** each play a short sound and show a desktop notification. They can stay quiet when a dev app (e.g. editor or terminal) is already in front—see [`platform.js`](../.claude/hooks/platform.js). Sounds are configured in [`.claude/config.json`](../.claude/config.json).

---

## Installation

1. Copy this repository or copy [`.claude/`](../.claude/) into your project.
2. Ensure **`node`** is on your `PATH` (hooks invoke `node .claude/hooks/...` from [`.claude/settings.json`](../.claude/settings.json)).
3. Merge **hooks** from [`.claude/settings.json`](../.claude/settings.json) into your Claude Code hook config (or use this project as the working directory).
4. Merge [`.claude/config.json`](../.claude/config.json) or set `session_tracking` / `hooks` / `sounds_directory` to taste.
5. Optional: run tests in [`.claude/hooks/__tests__/`](../.claude/hooks/__tests__/) with your test runner.

---

## Configuration

| File | Role |
|------|------|
| [`.claude/config.json`](../.claude/config.json) | Top-level `enabled`, **`session_tracking`**, notify hook toggles/sounds, `sounds_directory`. |
| [`.claude/settings.json`](../.claude/settings.json) | Maps Claude **events** → `command`, **`timeout`** for `SessionEnd`. |

### `session_tracking`

| Key | Default | Meaning |
|-----|---------|--------|
| `enabled` | — | Must be `true` for session hooks to write logs. |
| `store_directory` | `work-logs` | Directory under **project root** for daily JSON files. |
| `store_name_prefix` | `session-work-log` | Files: `{prefix}-{YYYY-MM-DD}.json`. |
| `max_sessions` | `200` | Trim oldest **completed** rows; open rows kept. |
| `max_bullets` | `50` | Cap stored summary bullets per session. |
| `stale_session_days` | `7` | Auto-close stale **open** rows. |

---

## Logging behavior

- **Where:** Default **`work-logs/`** at the project root (configurable via `store_directory`, must stay under the repo root).
- **When:** One row per `session_id` while open; **resume** appends `resume_events` instead of duplicating; **midnight crossing** may leave the row in the previous day’s file until end.
- **Fields:** Includes `tool: "claude"`, timestamps, optional `summary_bullets` from **Summary** sections in assistant text (heading variants: `## Summary`, `**Summary:**`, `Summary:`, etc. — see `session-tracker-utils.js`).
- **Writes:** Atomic temp file + rename; `updated_at` on the JSON root; file mode `0o600` on that path.
- **Debug:** `DEBUG=1` adds stderr from hooks without changing stdout contract.

**Example file shape** (`session-work-log-YYYY-MM-DD.json`):

```json
{
  "version": 1,
  "updated_at": "2026-04-18T18:00:00.000Z",
  "sessions": [
    {
      "session_id": "abc123",
      "tool": "claude",
      "started_at": "2026-04-18T17:00:00.000Z",
      "project_name": "my-app",
      "project_path": "/path/to/my-app",
      "branch_name": "main",
      "ended_at": "2026-04-18T17:30:00.000Z",
      "duration_minutes": 30,
      "summary_bullets": [
        "First task summary line.",
        "Second task summary line."
      ],
      "resume_events": [
        { "at": "2026-04-18T17:10:00.000Z", "source": "resume" }
      ]
    }
  ]
}
```

While a session is still open, `ended_at`, `duration_minutes`, and `summary_bullets` may be `null`. `resume_events` appears when the same session id is started again after a pause. Cursor rows use `"tool": "cursor"` but the same shape.

---

## Security

- **Writes:** Session JSON only under the **project root** (default `work-logs/`); relative `store_directory` cannot escape the repo; absolute paths outside the repo are rejected. If you want to use in multiple projects, keep everything on system level.
- **Reads:** **`transcript_path`** is read only as given by Claude Code (typically under `~/.claude/projects/...`). No directory crawling of your home folder.
- **Git / package metadata:** Read from **`cwd`** in the payload for branch and project name.
- **Trust:** Treat stdin as trustworthy only to the extent you trust **Claude Code**.
