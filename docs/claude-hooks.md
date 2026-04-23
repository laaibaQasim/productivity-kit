# Claude Code Hooks

This package wires **Claude Code lifecycle events** to small Node scripts (no dependencies) defined in [`.claude/settings.json`](../.claude/settings.json).

Each hook receives a **JSON payload on stdin**, performs a focused task (log or notify), and exits (`stdout` is `{}` where required by Claude). Session logging shares logic with Cursor via [`session-tracker-utils.js`](../.claude/hooks/session-tracker-utils.js).

This document explains **what these hooks do in this repo**. For full event contracts, refer to Claude's official docs.

---

## Table of Contents

- [Hooks Overview](#hooks-overview)
- [Session Tracking](#session-tracking)
- [Notifications](#notifications)
- [Configuration](#configuration)
- [Logging Model](#logging-model)
- [Example](#example)

---

## Hooks Overview

| Event | Script | What happens |
|-------|--------|-------------|
| `SessionStart` | `session-start.js` | Starts or resumes a session log entry |
| `SessionEnd` | `session-end.js` | Finalizes the session and extracts `### Session Log` entries from the transcript |
| `Stop` | `notify-stop.js` | Notifies when a task completes |
| `StopFailure` | `notify-failure.js` | Notifies on failure |
| `PermissionRequest` | `notify-permission.js` | Notifies when approval is required |

---

## Session Tracking

### `SessionStart`

Triggered when a session starts or resumes.

- Creates or updates a session entry
- Records project, branch, and timestamps
- Adds a `resume_event` if the session was reopened
- No-op if `session_tracking.enabled = false`

### `SessionEnd`

Triggered when a session ends.

- Marks session as completed (`ended_at`, duration)
- Reads the transcript via `transcript_path`
- Extracts every `### Session Log` block from assistant turns into `session_logs` (each entry includes `captured_at` plus the six structured fields)

> There is no separate `capture-summary` hook for Claude Code in this repo; logging is finalized here unless you add one.

---

## Notifications

The `Stop`, `StopFailure`, and `PermissionRequest` hooks provide desktop notifications and optional sounds.

| Event | Behavior |
|-------|----------|
| **Stop** | Plays a sound and sends a desktop notification |
| **StopFailure** | Plays failure sound and sends error notification |
| **PermissionRequest** | Notifies with context (command / reason if available) |

<details>
<summary><strong>Sound configuration</strong></summary>

- Set `sounds_directory` in `config.json` to your preferred audio files
- Each notify hook maps to a different sound (success / failure / permission)
- If not configured, default sounds are used or playback is skipped

</details>

<details>
<summary><strong>Focus-aware behavior</strong></summary>

Notifications can be suppressed when a dev app (editor/terminal) is already focused.

> Cursor already provides built-in editor notifications, so this package does **not** duplicate that behavior there.

</details>

---

## Configuration

### Files

| File | Purpose |
|------|---------|
| `config.json` | Enables logging, controls storage, sounds |
| `settings.json` | Maps Claude events to hook scripts |

### Session Tracking Options

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | — | Enables/disables logging |
| `store_directory` | `work-logs/` | Where logs are stored |
| `stale_session_days` | — | Auto-close inactive sessions |
| `temp_session_id_log` | — | Optional debug logging for session IDs |

---

## Logging Model

- Logs are written to `work-logs/` (configurable)
- One JSON file per day
- One entry per `session_id`

<details>
<summary><strong>Session entry fields</strong></summary>

Each session includes:

| Field | Description |
|-------|-------------|
| `started_at` / `ended_at` | ISO timestamps |
| `duration_minutes` | Computed duration |
| `project` / `branch` | Project context |
| `session_logs` | Array of `{ captured_at, user_intent, prompt_summary, provided_context, what_i_did, open_issues, next_best_step }` |
| `resume_events` | Timestamps of session resumes |

Older files may still show legacy `summary_bullets`; new sessions use `session_logs` only.

</details>

---

## Example

<details>
<summary><strong>Full session JSON</strong></summary>

```json
{
  "sessions": [
    {
      "session_id": "abc123",
      "tool": "claude",
      "model": "claude-sonnet-4-6",
      "started_at": "...",
      "ended_at": "...",
      "duration_minutes": 30,
      "session_logs": [
        {
          "captured_at": "2026-04-19T12:00:00.000Z",
          "user_intent": "Fix the login bug.",
          "prompt_summary": "Reproduce and patch auth flow.",
          "provided_context": "Error logs pasted.",
          "what_i_did": "Updated validateSession().",
          "open_issues": "None.",
          "next_best_step": "Add an integration test."
        }
      ],
      "resume_events": []
    }
  ]
}
```

</details>
