# Claude Code hooks

Hooks run as Node scripts configured in [`.claude/settings.json`](../.claude/settings.json). They read JSON from **stdin** and write hook responses to **stdout** (session hooks emit `{}`).

## Configuration

| File | Role |
|------|------|
| [`.claude/config.json`](../.claude/config.json) | Master switch, sounds, **`session_tracking`** (store path, limits, retention) |
| [`.claude/settings.json`](../.claude/settings.json) | Which Claude events run which commands |

### Session tracking (`session_tracking`)

| Key | Default | Meaning |
|-----|---------|--------|
| `enabled` | — | Must be `true` for session hooks to write logs |
| `store_directory` | `work-logs` | Directory **under the project root** for daily JSON files |
| `store_name_prefix` | `session-work-log` | Filename prefix: `{prefix}-{YYYY-MM-DD}.json` |
| `max_sessions` | `200` | Cap completed rows per file (open sessions kept) |
| `max_bullets` | `50` | Max summary bullets retained per session |
| `stale_session_days` | `7` | Auto-close “open” rows older than this |

Shared implementation: [`.claude/hooks/session-tracker-utils.js`](../.claude/hooks/session-tracker-utils.js).

### Sound / notification hooks

`task_done`, `task_failed`, `permission_needed` in config control [notify hooks](#notify-hooks) (sounds path, enable/disable). Disable all Claude hooks with top-level `"enabled": false` in config.

---

## Hooks reference

### `SessionStart` → `session-start.js`

**When:** Session begins or resumes (Claude passes `source`, e.g. startup / resume).

**Stdin (typical):** `session_id`, `cwd`, `transcript_path`, `source`, `model`, optional `agent_type`.

**Behavior:**

- If session tracking is disabled → no-op, `{}` on stdout.
- Opens or creates a row for `session_id`: records `started_at`, `project_name`, `project_path`, `branch_name` (from `cwd` via git / `package.json` / folder name).
- **Resume:** Same `session_id` already in the store → appends a `resume_events[]` entry (with `source`) instead of duplicating the row.
- **Housekeeping:** Stale open sessions, trim old completed rows, cleanup orphaned `.tmp` files next to the store.

**Stdout:** `{}` (empty JSON).

---

### `SessionEnd` → `session-end.js`

**When:** Session terminates.

**Stdin (typical):** `session_id`, `transcript_path`, `cwd`, `reason`.

**Behavior:**

- Finds the **open** row for `session_id` (possibly in a previous day’s file if the session crossed midnight).
- Sets `ended_at`, `duration_minutes` (from stored `started_at` to end time).
- Parses **`transcript_path`** JSONL (best-effort) and extracts bullets under a **Summary** heading (see [Summary formats](#summary-heading-formats)).
- If the transcript cannot be read, the session row is still closed with minimal data; a message goes to **stderr**.

**Timeout:** Set to **30 seconds** in `settings.json` so transcript parsing can finish (Claude’s default for `SessionEnd` is short).

**Stdout:** `{}`.

---

### Notify hooks

| Claude event | Script | Role |
|--------------|--------|------|
| `Stop` | `notify-stop.js` | Task completed sound / notification |
| `StopFailure` | `notify-failure.js` | Failure |
| `PermissionRequest` | `notify-permission.js` | Approval needed |

Notifications are suppressed when a dev-focused app is frontmost (for example Cursor, Terminal, VS Code, iTerm2, Warp, common Linux terminals, or Windows Terminal). They run when another app is active.

| OS | Notification | Sound |
|----|--------------|-------|
| **macOS** | `osascript` (`display notification`) | `afplay` |
| **Linux** | `notify-send` (if available) | `mpg123` or `ffplay` (first found) |
| **Windows** | PowerShell tray balloon | PowerShell `MediaPlayer` |

Frontmost-app detection: **macOS** uses AppleScript / System Events; **Linux** uses `xdotool` when installed. **Windows** has no frontmost check unless you extend [`platform.js`](../.claude/hooks/platform.js).

Custom sounds: set `sound` per hook and place `.mp3` files under `sounds_directory` (default `.claude/sounds`). Set `DEBUG=1` to surface errors on stderr; hook stdout stays clean for Claude.

---

## Edge cases (session tracker)

These are intentional behaviors worth knowing when reading `work-logs/`.

| Situation | Behavior |
|-----------|----------|
| **Missing `session_id`** | Start/end skip writes (debug log if `DEBUG` set). |
| **Resume** | Same id → `resume_events` updated; cleared `ended_at` when reopening a closed row. |
| **Session crosses midnight** | Row may live in yesterday’s file; end hook finds it via `findStoreFileForSession`. |
| **Corrupt store JSON** | File renamed to `*.corrupt.<timestamp>.bak`; empty store used so the next write does not silently drop history. |
| **Concurrent writes** | End path re-reads the store before finalize to reduce clobber risk (same pattern as Cursor). |
| **`store_directory` escapes project root** | Resolved path must stay under project root; otherwise falls back to `work-logs` under project root. |
| **Stale “open” sessions** | Rows with no `ended_at` older than `stale_session_days` get auto-closed with `duration_minutes: 0`. |
| **Too many rows** | Oldest **completed** sessions trimmed; **open** rows are not removed by the cap. |
| **Summary missing** | `summary_bullets` may be null; stderr may note “No Summary section” in debug. |
| **Claude `SessionEnd` budget** | Large transcripts + slow disk: rely on configured **timeout** in settings. |

### Summary heading formats

The tracker recognizes several “Summary” line shapes (Markdown `## Summary`, `**Summary:**`, plain `Summary:`, etc.). Extraction logic is centralized in `session-tracker-utils.js` so Claude and Cursor stay consistent.

---

## Security and filesystem scope

**What the repo controls**

- Hook **code** lives under [`.claude/hooks/`](../.claude/hooks/).
- **Config** is [`.claude/config.json`](../.claude/config.json).

**Writes (session logs)**

- Default: **`work-logs/`** at the **project root** (sibling to `.claude/`), not inside `.claude/` only.
- Paths are **restricted to the project root**: a relative `store_directory` cannot point outside the project; an absolute path outside the project is rejected and the default directory is used.

**Reads**

- **`transcript_path`** comes from Claude on stdin. Hooks **only read that path** (streaming JSONL) to extract summaries — typically under `~/.claude/projects/...`. They do not scan your home directory arbitrarily.
- **Git / `package.json`** are read from **`cwd`** (session payload) for branch and project name.

**Permissions**

- New log files use mode `0o600` where the atomic write path applies.

**Threat model**

- Hooks trust **Claude Code** to pass sane `transcript_path` values. Do not point untrusted stdin at these scripts.

---

## Debugging

Set `DEBUG=1` (or any non-empty value) for extra **stderr** lines from hooks. Normal **stdout** should remain valid JSON for Claude.

---

## Tests

[`session-tracker-utils.test.js`](../.claude/hooks/__tests__/session-tracker-utils.test.js) covers parsing and store helpers. Run with your preferred Node test runner if configured.

---

## Adding a new Claude hook

1. Add a script under [`.claude/hooks/`](../.claude/hooks/) (Node shebang, `chmod +x` optional if invoked via `node`).
2. Register the event in [`.claude/settings.json`](../.claude/settings.json) under `hooks` → event name → `command`.
3. Read stdin JSON, write stdout JSON per [Claude Code hook docs](https://docs.anthropic.com/en/docs/claude-code/hooks) for that event.
4. Document the event and script in this file so the repo stays the single source of truth (see Claude Code’s official hooks documentation for stdin/stdout per event).
