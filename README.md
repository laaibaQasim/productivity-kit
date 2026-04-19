# ai-dump

## What this repo is

A small **Claude Code** and **Cursor** toolkit you can drop into a project: hook scripts (Node, no extra install), optional session work logs under `work-logs/`, and optional desktop sounds when Claude finishes or needs attention (Cursor has these built-in). Detailed behavior lives in [`docs/`](docs/).

## What problems it solves

- **Visibility:** Append-only style logs of **sessions** (start/end, project/branch, **Summary** bullets) so you can see what you were doing across days.
- **Cursor + Claude parity:** Same session-tracker logic for both tools where it makes sense.
- **Feedback:** Optional macOS/Linux/Windows notifications and sounds on Claude task events.
- **Private by default on your machine:** You can keep logs and local tooling out of Git without touching a shared `.gitignore` (see [Quick start](#quick-start)).

## Hooks in this repo

| Tool | Events | Role |
|------|--------|------|
| **Claude Code** | `SessionStart`, `SessionEnd` | Record sessions in daily JSON; read transcript for `**Summary:**` bullets on end. |
| **Claude Code** | `Stop`, `StopFailure`, `PermissionRequest` | Optional sound + notification. |
| **Cursor** | `sessionStart`, `sessionEnd` | Same session log model; end can fall back to transcript if bullets missing. |
| **Cursor** | `afterAgentResponse` | Incremental capture of `**Summary:**` bullets from assistant replies. |

Scripts live under [`.claude/hooks/`](.claude/hooks/) and [`.cursor/hooks/`](.cursor/hooks/); wiring is in [`.claude/settings.json`](.claude/settings.json) and [`.cursor/hooks.json`](.cursor/hooks.json).

## Quick start

Copy this repo into your project or system level root folders (~/.claude) and ensure **Node** is on your `PATH` (hooks use Node built-ins only).

Session logging is controlled by **`session_tracking.enabled`** in [`.claude/config.json`](.claude/config.json) and [`.cursor/config.json`](.cursor/config.json) (defaults target `work-logs/`). Full options are in the docs below.

**Keep logs and local tooling out of Git (no commit to `.gitignore`):** use **`.git/info/exclude`** — local to your clone, not shared. From the **repository root**:

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && {
  mkdir -p .git/info
  f=".git/info/exclude"
  for p in work-logs/ .claude/ .cursor/; do
    grep -qxF "$p" "$f" 2>/dev/null || echo "$p" >> "$f"
  done
}
```

Remove `work-logs/`, `.claude/`, or `.cursor/` from the loop if you only want to exclude some paths. **Exclude** only affects **untracked** files; (see [docs](docs/claude-hooks.md)).

## Security

Hooks **do not** invent paths to read or write: they **write** session JSON only under the **project root** (default `work-logs/`, with a guard against `store_directory` escaping the repo), and **read** transcripts only from paths **Claude Code** or **Cursor** pass on stdin. Treat hook stdin as trusted only as far as you trust those tools.

## Detailed docs

| Doc | Contents |
|-----|----------|
| [Claude hooks](docs/claude-hooks.md) | Config, each hook, edge cases, filesystem scope |
| [Cursor hooks](docs/cursor-hooks.md) | Config, each hook, edge cases, Cursor-specific notes |

## License

See [LICENSE](LICENSE).
