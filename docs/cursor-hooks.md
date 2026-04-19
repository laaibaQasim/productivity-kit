# Cursor hooks

## Overview

This package connects **Cursor lifecycle events** to small Node scripts (no dependencies).

Each hook:
- receives a **JSON payload on stdin**
- performs a focused task (log or process response)
- exits (no blocking behavior)

Session logging shares logic with Claude via `session-tracker-utils.js`.

This document explains **what these hooks do in this repo**.

---

## Hooks in this package

| Event | Script | What happens |
|------|--------|-------------|
| `sessionStart` | `session-start.js` | Starts or resumes a session log entry |
| `sessionEnd` | `session-end.js` | Finalizes session and extracts summaries |
| `afterAgentResponse` | `after-response.js` | Captures incremental summaries from responses |

---

## Behavior

### Session tracking

#### `sessionStart`
Triggered when a new conversation starts.

- Creates a session entry
- Records metadata (project, timestamps, mode)
- Adds resume tracking if chat was closed and then resumed
- No-op if `session_tracking.enabled = false`

---

#### `sessionEnd`
Triggered when the session ends.

- Marks session as completed (`ended_at`, duration)
- Extracts final summaries (no summary means no record)
- Records termination reason (`completed`, `aborted`, `error`, etc.)

---

#### `afterAgentResponse`
Triggered after each assistant response.

- Parses response text
- Extracts `Summary` sections incrementally
- Appends to `summary_bullets` during the session

This allows summaries to build over time instead of only at the end.

---

## Notifications

Cursor already provides **built-in editor notifications**, so this package does **not implement separate notification hooks**.

This avoids duplication and keeps behavior consistent with the Cursor UI. 

---

## Configuration

### Files

| File | Purpose |
|------|--------|
| `config.json` | Enables logging and storage behavior |
| `hooks.json` | Maps Cursor events → hook scripts |

---

## Sounds

These are configurable options for notifications 
- Set `sounds_directory` to your preferred audio files
- Each notify hook maps to a sound (success / failure / permission)
- If not configured, default sounds are used or playback is skipped


### Session tracking options

| Key | Meaning |
|-----|--------|
| `enabled` | Enables/disables logging |
| `store_directory` | Where logs are stored (default `work-logs/`) |
| `max_sessions` | Max completed sessions retained |
| `max_bullets` | Max summary bullets stored |
| `stale_session_days` | Auto-close inactive sessions |

---

## Logging model

- Logs are written to `work-logs/` (configurable)
- One JSON file per day
- One entry per `session_id`

Each session includes:
- timestamps (`started_at`, `ended_at`)
- duration
- project info
- accumulated `summary_bullets`
- optional resume events

---

## Example

```json
{
  "sessions": [
    {
      "session_id": "xyz789",
      "tool": "cursor",
      "started_at": "...",
      "ended_at": "...",
      "duration_minutes": 25,
      "summary_bullets": ["..."],
      "resume_events": []
    }
  ]
}