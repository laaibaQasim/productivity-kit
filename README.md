# ai-dump

Personal automation for **Claude Code** and **Cursor**: session work logging, optional desktop sounds/notifications on Claude task events, and shared rules.

## What lives here

| Area | Purpose |
|------|--------|
| [`.claude/`](.claude/) | Claude Code hooks, config, sounds, skills |
| [`.cursor/`](.cursor/) | Cursor hooks and project rules |
| [`work-logs/`](work-logs/) | Daily JSON session logs (default; configurable) |

## Documentation

| Doc | Contents |
|-----|----------|
| [**Claude hooks**](docs/claude-hooks.md) | `SessionStart` / `SessionEnd`, notify hooks, config, edge cases, security |
| [**Cursor hooks**](docs/cursor-hooks.md) | `sessionStart` / `afterAgentResponse` / `sessionEnd`, config, edge cases, security |

Start with this README; use the two docs above for setup details and behavior.

## Quick use

1. **Clone or copy** this repo (or copy `.claude/` / `.cursor/` into another project).
2. **Claude Code**: hooks are wired in [`.claude/settings.json`](.claude/settings.json). Session logging reads [`session_tracking`](docs/claude-hooks.md#configuration) from [`.claude/config.json`](.claude/config.json).
3. **Cursor**: hooks are listed in [`.cursor/hooks.json`](.cursor/hooks.json). Cursor reads session settings from [`.cursor/config.json`](.cursor/config.json) (see [Cursor hooks doc](docs/cursor-hooks.md#configuration)).

No `npm install` for hooks — they use Node built-ins only.

## Adding hooks without cluttering the repo

- Keep **one concise** [`README.md`](README.md) (this file) and put **depth** in [`docs/claude-hooks.md`](docs/claude-hooks.md) and [`docs/cursor-hooks.md`](docs/cursor-hooks.md).
- Put **new hook scripts** only under [`.claude/hooks/`](.claude/hooks/) or [`.cursor/hooks/`](.cursor/hooks/); register them in the matching `settings.json` / `hooks.json`.
- Add a short bullet to the relevant **docs** file when you add or change behavior (edge cases, stdin fields, security).

### Local Git exclude (when you can’t or won’t use `.gitignore`)

Use **`.git/info/exclude`** for ignores that apply only on **your clone** and are **never committed** (unlike `.gitignore`). That fits `work-logs/` and, if you want the same privacy for tooling files, **`.claude/`** and **`.cursor/`** — for example when you copy hooks/config into a repo that must not list them in a shared `.gitignore`.

**Session logs only** — run from the **repository root**; it does nothing if the directory is not a Git work tree:

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && {
  mkdir -p .git/info
  f=".git/info/exclude"
  grep -qxF 'work-logs/' "$f" 2>/dev/null || echo 'work-logs/' >> "$f"
}
```

**Same idea for hooks and config directories** (append each path once; adjust the list to match what you keep local):

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && {
  mkdir -p .git/info
  f=".git/info/exclude"
  for p in work-logs/ .claude/ .cursor/; do
    grep -qxF "$p" "$f" 2>/dev/null || echo "$p" >> "$f"
  done
}
```

**Notes**

- **New/untracked files only:** patterns in `exclude` (and `.gitignore`) stop *untracked* paths from being added. Files **already tracked** by Git stay tracked until you remove them from the index (e.g. `git rm -r --cached .claude` — use with care).
- **Committed `.gitignore`:** if the team can share ignore rules, a root `.gitignore` entry is often simpler; use `exclude` when you need local-only rules or cannot change committed ignore files.

## License

See [LICENSE](LICENSE).
