# Cursor hooks

## Overview

**Project** hooks live in [`.cursor/hooks.json`](../.cursor/hooks.json); commands run with the **project root** as the working directory. Scripts under [`.cursor/hooks/`](../.cursor/hooks/) import [`.claude/hooks/session-tracker-utils.js`](../.claude/hooks/session-tracker-utils.js) so **logging matches Claude** where possible.

Cursor sends **JSON on stdin**; scripts print **JSON on stdout**. Several events are **fire-and-forget** — do not rely on hooks for mandatory gating.

---

## Supported hooks

| Cursor event | Script | Purpose |
|--------------|--------|---------|
| `sessionStart` | [`session-start.js`](../.cursor/hooks/session-start.js) | Open/update session row; same resume/housekeeping as Claude. |
| `afterAgentResponse` | [`capture-summary.js`](../.cursor/hooks/capture-summary.js) | Append **Summary** bullets from each assistant reply. |
| `sessionEnd` | [`session-end.js`](../.cursor/hooks/session-end.js) | Close row; prefer captured bullets, else transcript fallback. |

---

## What each hook does

### `sessionStart` (`session-start.js`)

Runs when a **Composer** chat starts. If session logging is enabled, it records the session in the same work log as Claude, tagged for Cursor. Does nothing when logging is turned off.

### `afterAgentResponse` (`capture-summary.js`)

Runs after each **assistant** reply. If the reply includes a **Summary** section (same style as in the [Claude logging doc](claude-hooks.md#logging-behavior)), those lines are saved as bullets on the current session.

### `sessionEnd` (`session-end.js`)

Runs when the chat **ends**. Saves end time and duration, and keeps any summary bullets gathered during the chat (or fills them from the transcript when needed).

---

## Installation

1. Open the repo (or copy [`.cursor/`](../.cursor/) into your project).
2. Ensure **`node`** is on your `PATH` (commands in [`.cursor/hooks.json`](../.cursor/hooks.json) call `node` or run scripts directly — match your setup).
3. Confirm [`.cursor/hooks.json`](../.cursor/hooks.json) is present; Cursor reloads it on save (restart Cursor if hooks do not appear).
4. Merge [`.cursor/config.json`](../.cursor/config.json) **`session_tracking`** as needed.

---

## Configuration

Cursor uses **two** project files: one tells the **editor** which hook scripts to run; the other tells those scripts **how to log** sessions.

### [`.cursor/hooks.json`](../.cursor/hooks.json)

**What it is:** Cursor’s hook manifest. It lists **which events** run **which commands** (paths to scripts under `.cursor/hooks/`), and optional **timeouts** in seconds so slow steps (for example reading a transcript on session end) do not get cut off.

**Use:** Register or change hooks without editing Cursor’s global settings. If this file is missing or invalid, project hooks from this repo will not run.

### [`.cursor/config.json`](../.cursor/config.json)

**What it is:** Settings read by **this repo’s** hook scripts only (not a full Cursor app settings dump). It currently holds a single object, **`session_tracking`**, with the same keys as in [Claude hooks – Configuration](claude-hooks.md#configuration): turn logging on or off, where to store daily JSON (`store_directory`, `store_name_prefix`), and limits (`max_sessions`, `max_bullets`, `stale_session_days`).

**Use:** Control **whether** Cursor sessions are written to `work-logs/` and **how large** those files can grow, independently of [`.claude/config.json`](../.claude/config.json).

---

## Logging behavior

- **Where / format:** Same daily JSON files as Claude — default **`work-logs/`**, `session-work-log-YYYY-MM-DD.json`, rows tagged `tool: "cursor"`.
- **Bullets:** Incremental from **`afterAgentResponse`**; **`sessionEnd`** keeps those or fills from **transcript** if needed.
- **Race:** End hook re-reads the store so late **`afterAgentResponse`** writes are not lost.
- **Debug:** `DEBUG=1` on stderr; use Cursor’s **Hooks** UI for delivery issues.

## Security

- **Writes:** Same as Claude — only under **project root** into the configured store (default `work-logs/`).
- **Reads:** **`transcript_path`** only when provided; listing the store directory is limited to configured **`*.json`** files for session lookup.
- **Trust:** stdin comes from **Cursor**; treat paths as you trust the app.

---

## Related

- [Claude hooks](claude-hooks.md) — shared session tracker and Claude notify hooks.
- [`.cursor/rules/`](../.cursor/rules/) — agent rules (not hooks).
