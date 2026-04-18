# Cursor hooks

Project hooks are declared in [`.cursor/hooks.json`](../.cursor/hooks.json). Commands run from the **project root**; scripts live under [`.cursor/hooks/`](../.cursor/hooks/).

Cursor passes JSON on **stdin**; your scripts print JSON on **stdout**. Several events are **fire-and-forget** — Cursor does not wait for side effects, and some return values are ignored (see below).

---

## Configuration

Session tracking for Cursor uses [`.cursor/config.json`](../.cursor/config.json). The same keys as Claude’s `session_tracking` are supported (see [Claude hooks – session tracking](claude-hooks.md#session-tracking-session_tracking)), implemented by importing [`.claude/hooks/session-tracker-utils.js`](../.claude/hooks/session-tracker-utils.js).

| File | Role |
|------|------|
| [`.cursor/config.json`](../.cursor/config.json) | `session_tracking` only (relative path resolved from project root via shared utils) |
| [`.cursor/hooks.json`](../.cursor/hooks.json) | Event → command mapping and **timeouts** |

---

## Hooks reference

### `sessionStart` → `session-start.js`

**When:** A new Composer conversation is created.

**Stdin (documented by Cursor):** `session_id`, `is_background_agent`, `composer_mode` (e.g. `agent`, `ask`, `edit`). **`cwd` and `source` may be absent** (unlike Claude’s `SessionStart`).

**Behavior:**

- If session tracking is disabled → `{}` on stdout.
- **`cwd`:** Uses `input.cwd` when present, else **`process.cwd()`** (usually the project root for project hooks).
- **`source`:** Stored on `resume_events` when present; often **null** for Cursor.
- Same resume / midnight / housekeeping logic as [Claude `session-start`](claude-hooks.md#sessionstart--session-startjs), but rows are tagged `tool: "cursor"`.

**Stdout:** `{}`.  
Cursor may also support returning `env` / `additional_context` from this hook; these scripts do not set them.

---

### `afterAgentResponse` → `capture-summary.js`

**When:** After each full assistant message.

**Stdin:** Must include the assistant **`text`**. The hook also expects **`session_id`** to attach bullets to the correct open row.

**Behavior:**

- Scans `text` for a **Summary** block (same heading rules as [Claude](claude-hooks.md#summary-heading-formats)).
- Appends bullets to the open session (capped by `max_bullets`).

**Important:** If your Cursor build only passes `{ "text": "..." }` and **omits `session_id`**, this hook cannot update the store — verify the real payload (e.g. Hooks output channel or temporary logging). A workaround is to pass `session_id` via **`sessionStart` → `env`** (Cursor merges env into later hooks) if needed.

**Stdout:** `{}`.

---

### `sessionEnd` → `session-end.js`

**When:** The Composer conversation ends.

**Stdin (typical):** `session_id`, `reason`, `duration_ms`, `is_background_agent`, `final_status`, `error_message`. **`transcript_path` may or may not appear** depending on Cursor version.

**Behavior:**

- Finalizes the open row: `ended_at`, `duration_minutes` computed from **stored `started_at`** and end time (not currently preferring `duration_ms` from stdin — see [Possible improvements](#possible-improvements)).
- **Summary bullets:** Uses **incremental** bullets from `capture-summary.js` if present; otherwise tries **`transcript_path`** like Claude’s end hook.
- **Race:** Re-reads the store before write because **`afterAgentResponse` and `sessionEnd` can fire close together**.

**Timeout:** **30 seconds** in `hooks.json` for slow transcript reads.

**Stdout:** `{}` (Cursor may log it but not use it for control flow).

---

## Edge cases (important)

These mirror much of the [Claude list](claude-hooks.md#edge-cases-session-tracker), plus Cursor-specific points.

| Situation | Behavior |
|-----------|----------|
| **Missing `session_id`** | Start / capture / end skip safely. |
| **No `session_id` in `afterAgentResponse`** | Capture script no-ops — **confirm payload** in your Cursor version. |
| **`cwd` omitted** | Falls back to `process.cwd()`. |
| **`transcript_path` omitted on end** | Relies on bullets from `capture-summary.js`; otherwise summary may be empty. |
| **`sessionEnd` + `afterAgentResponse` race** | End hook re-reads store before writing to avoid losing incremental bullets. |
| **Fire-and-forget** | Do not rely on hooks for mandatory gating; they are best-effort for logging. |
| **Store corruption / caps / stale rows** | Same as shared `session-tracker-utils` (see Claude doc). |

### Possible improvements

- Prefer **`duration_ms`** from `sessionEnd` stdin when present, for parity with Cursor’s clock.
- Persist **`reason`**, **`error_message`**, **`composer_mode`** if you want richer analytics.

---

## Security and filesystem scope

**What the repo controls**

- Hook **code** under [`.cursor/hooks/`](../.cursor/hooks/).
- **Config** in [`.cursor/config.json`](../.cursor/config.json).

**Writes**

- Same as Claude: daily JSON under **`work-logs/`** (default), **under the project root**, with the same “no escape outside project root” rule for `store_directory`.

**Reads**

- **`transcript_path`** (when provided): read-only, single file from stdin.
- No broad directory walks beyond the **store directory** for log files (`findStoreFileForSession` lists `*.json` under the configured store).

**Trust model**

- stdin is produced by **Cursor**; same caution as for any hook: only read paths Cursor supplies.

---

## Debugging

Use `DEBUG=1` for stderr diagnostics from `.cursor/hooks/*.js`. Check Cursor’s **Hooks** UI / output channel if a hook does not run.

---

## Related

- [Claude hooks](claude-hooks.md) — shared utilities, Summary formats, store semantics.
- [`.cursor/rules/`](../.cursor/rules/) — project rules for the agent (not hook scripts).

---

## Adding a new Cursor hook

1. Add a script under [`.cursor/hooks/`](../.cursor/hooks/).
2. Register it in [`.cursor/hooks.json`](../.cursor/hooks.json) under the right event name; set `timeout` (seconds) if the hook can do I/O-heavy work.
3. Prefer **project hooks** (paths like `.cursor/hooks/foo.js` relative to repo root).
4. Document stdin/stdout and behavior here after you confirm them in Cursor’s Hooks output / docs.
