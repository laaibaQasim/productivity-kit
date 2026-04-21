# productivity-kit

**productivity-kit** wires **Claude Code** and **Cursor** into your day: you get alerted when something needs you or finishes, and you keep structured session logs for standups, time review, and debugging.

**At a glance**

- **Sound** (bundled MP3s) and **desktop notifications** when runs **stop**, **fail**, or need **permission**
- **Session logs** captured from assistant replies (`### Session Log`) into daily JSON under `work-logs/`
- Small **Node** scripts only (no extra packages); copy into a project or use from `~/.claude/`

## How it works

1. **Hooks** listen to Claude Code / Cursor lifecycle and UI events (session start/end, stop, failure, permission, after-agent reply).
2. **Scripts** under [`.claude/hooks/`](.claude/hooks/) and [`.cursor/hooks/`](.cursor/hooks/) play sounds / show notifications or parse replies and update the store.
3. **Logs** are written as one file per day, e.g. `work-logs/session-work-log-YYYY-MM-DD.json`, when session tracking is enabled.
4. **You** skim or query those files (and transcripts) to improve prompts, estimate time, and see what actually shipped.
5. It runs out of the box with the bundled hook wiring ([`.claude/settings.json`](.claude/settings.json), [`.cursor/hooks.json`](.cursor/hooks.json)). For behavior, config keys, and edge cases, see [`docs/`](docs/).

## What this solves

- **Don’t miss important events** — Finish, failure, and approval prompts surface without watching the terminal.
- **Avoid babysitting long runs** — Step away; get alerted when something matters.
- **Understand failures faster** — Logs and transcripts help pinpoint errors and delays.
- **Improve prompts over time** — Review what the model did vs. what you asked for.
- **Keep a history of work** — Daily files preserve context after sessions end.

## Hooks in this repo

These hooks power **notifications** and **session tracking**:

| Tool | Events | Role |
|------|--------|------|
| **Claude Code** | `SessionStart`, `SessionEnd` | Daily JSON session logs. Works with project rules that ask for a `### Session Log` (and optional `**Summary:**`) on coding tasks. |
| **Claude Code** | `Stop`, `StopFailure`, `PermissionRequest` | Desktop notifications when a run completes, fails, or needs approval. |
| **Cursor** | `sessionStart`, `sessionEnd` | Same session log model as Claude Code (finalize + transcript fallback). |
| **Cursor** | `afterAgentResponse` | **Appends** a timestamped entry to `session_logs` while the session is open. |

Scripts live under [`.claude/hooks/`](.claude/hooks/) and [`.cursor/hooks/`](.cursor/hooks/). Wiring is in [`.claude/settings.json`](.claude/settings.json) and [`.cursor/hooks.json`](.cursor/hooks.json).

### What gets logged

When session tracking is enabled, each session row stores **`session_logs`**: an array of objects, one per captured reply, each with:

- **`captured_at`** — ISO timestamp when the entry was written  
- **`user_intent`**, **`prompt_summary`**, **`provided_context`**, **`what_i_did`**, **`open_issues`**, **`next_best_step`** (see project rules in `CLAUDE.md` / `.cursor/rules/task-summary.md`)

### Example: one `session_logs` entry

```json
{
  "captured_at": "2026-04-19T12:34:56.789Z",
  "user_intent": "Ship the README refresh.",
  "prompt_summary": "Restructure intro, add How it works, tighten Quick start.",
  "provided_context": "README.md and prior feedback bullets.",
  "what_i_did": "Rewrote sections and added an example JSON block.",
  "open_issues": "None.",
  "next_best_step": "Optional: add a real screenshot path under docs/."
}
```

## Commands

This repo ships two Cursor project commands (in [`.cursor/commands/`](.cursor/commands/)):

| Command | File | What it does |
|---------|------|-------------|
| **setup** | [`setup.md`](.cursor/commands/setup.md) | One-time setup: creates `work-logs/`, copies example configs, updates `.git/info/exclude`, runs hook tests. |
| **/logger** | [`logger.md`](.cursor/commands/logger.md) | Reads your session log for a given date, groups entries into 4–5 major tasks with time estimates, and outputs a standup-ready daily summary. |

### /logger — daily work summary

Run **/logger** in Cursor chat at any point during or at the end of your day. It will:

- Parse the daily `session-work-log-YYYY-MM-DD.json` for a date you choose (defaults to today)
- Cluster related log entries into major tasks, ignoring noise and trivial retries
- Estimate time per task using `captured_at` timestamps, deduplicating overlapping Claude + Cursor sessions
- Output a clean summary in this shape:

```
## Daily Log — 2026-04-19

**Total active time:** 8h 9m

### Major Tasks
1. **Session hook refactoring** — ~50 min
   Summary: Simplified session lookup and centralized shared utilities...

### Other minor work
- Re-read rules file to confirm session tracking was enabled
```

The output is human-readable and ready to paste.

## Quick start

1. **Copy** this repo into your project, or copy **`.claude/`** into your user-level config (**`~/.claude/`**).
2. **Install Node.js** and ensure **`node`** is on your `PATH` (hooks use Node built-ins only).
3. In **Cursor**, run the project custom command **setup** ([`.cursor/commands/setup.md`](.cursor/commands/setup.md)) from the commands menu or chat.
4. Run a **short test task** in Cursor and Claude Code; optionally trigger a **permission** flow to hear/see the approval hook.

### Quick start — details

- **setup** creates `work-logs/`, copies example configs when missing, optionally updates **`.git/info/exclude`**, runs hook tests, and asks whether local configs and logs should be tracked in git so changes stay explicit.
- Session logging is toggled with **`session_tracking.enabled`** in [`.claude/config.json`](.claude/config.json) and [`.cursor/config.json`](.cursor/config.json) (defaults write under `work-logs/`). Full options: [detailed docs](#detailed-docs).

### Keep local files out of Git (manual alternative)

If you skip **setup** or need extra paths, append to **`.git/info/exclude`**: `work-logs/`, `.claude/config.json`, `.cursor/config.json` as needed (machine-local ignores, no shared `.gitignore`).

### Smoke-test the hooks

To exercise the permission hook, ask the agent to do something that requires approval (for example, create a small file in a path the tool must confirm).

**Filesystem scope:** hooks **write** only under the project root (default `work-logs/`, with path safeguards) and **read** only transcript paths supplied by Claude Code or Cursor. Treat hook stdin as trusted only to the extent you trust those tools.

## Log analysis

The [`log-analysis/`](log-analysis/) module turns your `work-logs/` files into actionable insights. It runs four LLM passes over your session logs — prompt quality, model cost, reusable skills, and durable rules — then synthesizes them into a single report.

Run `/setup-analysis` in Cursor to install dependencies and configure your API key, then:

```bash
python log-analysis/log_analysis.py prepare
python log-analysis/log_analysis.py run-all --out-dir analysis
```

Full setup and command reference: [log-analysis/README.md](log-analysis/README.md)

## Vision

Longer term, this kit is meant to help you spot inefficiencies, tighten prompts, and move toward more agentic workflows—while building intuition for which models and patterns save time and cost.

## Detailed docs

| Doc | Contents |
|-----|----------|
| [Claude hooks](docs/claude-hooks.md) | Config, each hook, edge cases, filesystem scope |
| [Cursor hooks](docs/cursor-hooks.md) | Config, each hook, edge cases, filesystem scope |

## License

See [LICENSE](LICENSE).

Analysis features are still evolving, so feedback and ideas are welcome. If this is useful, consider starring the repo to follow updates.
