# Cursor Hooks

This package connects **Cursor lifecycle events** to small Node scripts (no dependencies).

Each hook receives a **JSON payload on stdin**, performs a focused task (log or process response), and exits (no blocking behavior). Session logging shares logic with Claude Code via [`session-tracker-utils.js`](../.claude/hooks/session-tracker-utils.js).

This document explains **what these hooks do in this repo**.

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
| `sessionStart` | `session-start.js` | Starts or resumes a session log entry |
| `sessionEnd` | `session-end.js` | Finalizes session; merges incremental `session_logs` or scans transcript |
| `afterAgentResponse` | `capture-summary.js` | Parses each reply for `### Session Log` and appends to `session_logs` |

---

## Session Tracking

### `sessionStart`

Triggered when a new conversation starts (or when Cursor fires the event for a thread).

- Creates a session entry when the `session_id` is new
- If the same `session_id` already exists in today's file (open or closed), records a resume and clears `ended_at` / `duration_minutes` when reopening a closed session
- No-op if `session_tracking.enabled = false`

### `sessionEnd`

Triggered when the session ends.

- Marks session as completed (`ended_at`, duration)
- Prefers `session_logs` already captured by `capture-summary.js`; if empty, falls back to scanning the transcript (same extraction as Claude Code's `SessionEnd`)

### `afterAgentResponse` (capture-summary.js)

Triggered after each assistant response.

- Parses `input.text` for a `### Session Log` section and the six labeled fields
- Appends `{ captured_at, ...fields }` to `session_logs`
- If no open row exists for `session_id`, can create a new session row or reopen the last matching row

This builds `session_logs` incrementally so you do not rely only on end-of-session transcript scans.

<details>
<summary><strong>Known limitation</strong></summary>

If Cursor does not fire hooks for a given UI flow (for example some reopened threads), entries will not appear until behavior is consistent. See troubleshooting in Cursor docs or try a fresh chat to verify hooks.

</details>

---

## Notifications

Cursor already provides **built-in editor notifications**, so this package does **not** implement separate notification hooks under `.cursor/`.

<details>
<summary><strong>Duplicate notification issue with Claude hooks</strong></summary>

If you use **Claude Code hooks** in [`.claude/settings.json`](../.claude/settings.json) (for example `Stop` with sounds or desktop notifications), be aware of a known Cursor behavior: the IDE can run **internal background model sessions** (for example low-token `composer-*` runs) in addition to your main agent turn. Those sessions also trigger Claude's lifecycle hooks, so **side effects can run twice per user prompt**.

Details and discussion: [Duplicate notifications when using Claude hooks alongside Cursor](https://forum.cursor.com/t/duplicate-notifications-when-using-claude-hooks-alongside-cursor/158420).

**Temporary workaround:**

In Cursor, open **Settings** and turn off **system notifications** and **completion sound** (or equivalent "notify on completion" / sound options) so Cursor's own alerts don't stack on top of your Claude hook notifications.

Longer-term workarounds in hooks include filtering by `model` in the hook payload (fragile) or waiting for Cursor to expose a background-session flag.

</details>

---

## Configuration

### Files

| File | Purpose |
|------|---------|
| `config.json` | Enables logging and storage behavior |
| `hooks.json` | Maps Cursor events to hook scripts |

### Session Tracking Options

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | — | Enables/disables logging |
| `store_directory` | `work-logs/` | Where logs are stored |
| `store_name_prefix` | — | Filename prefix for daily JSON files |
| `stale_session_days` | — | Auto-close inactive sessions |
| `temp_session_id_log` | — | Optional debug logging for session IDs |

> Sounds are **not** configured under `.cursor/` in this repo; use Claude Code notify hooks for desktop sounds.

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
| `project` | Project context |
| `session_logs` | Array of structured entries with `captured_at` |
| `resume_events` | Timestamps of session resumes |

</details>

---

## Example

<details>
<summary><strong>Full session JSON</strong></summary>

```json
{
  "sessions": [
    {
      "session_id": "xyz789",
      "tool": "cursor",
      "model": "cursor-small",
      "started_at": "...",
      "ended_at": "...",
      "duration_minutes": 25,
      "session_logs": [
        {
          "captured_at": "2026-04-19T14:00:00.000Z",
          "user_intent": "Add a loading button.",
          "prompt_summary": "Spinner + disabled state.",
          "provided_context": "Button.tsx.",
          "what_i_did": "Added loading prop.",
          "open_issues": "No tests yet.",
          "next_best_step": "Add unit tests."
        }
      ],
      "resume_events": []
    }
  ]
}
```

</details>
