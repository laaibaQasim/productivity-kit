# Contributing

Thanks for your interest in contributing to **productivity-kit**! This guide covers how to get involved.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Style Guide](#style-guide)
- [Reporting Issues](#reporting-issues)

---

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Install Node.js** (hooks use Node built-ins only — no extra packages)
4. Run the **setup** command or follow the [Quick Start](README.md#quick-start) in the README

---

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```
2. Make your changes
3. Test your changes:
   - Run a short test task in Cursor or Claude Code
   - Verify hooks fire correctly (session start/end, notifications)
   - If modifying log-analysis, test with `--dry-run` first
4. Commit with a clear message:
   ```bash
   git commit -m "Add my feature"
   ```
5. Push and open a Pull Request:
   ```bash
   git push origin feature/my-feature
   ```

---

## Pull Request Guidelines

- **Keep PRs focused** — one feature or fix per PR
- **Describe what and why** in the PR description
- **Test your changes** before submitting
- **Link related issues** if applicable
- PRs require at least one maintainer review before merging

---

## Style Guide

- **No external dependencies** — hooks use Node.js built-ins only
- **Atomic file writes** — use temp file + rename to prevent corruption
- **Guard clauses** — check `session_tracking.enabled` before logging
- **JSON output** — hooks that Claude Code expects a response from must write `{}` to stdout
- Keep scripts small and focused — one hook, one job

---

## Reporting Issues

- Use [GitHub Issues](../../issues) to report bugs or request features
- Include steps to reproduce, expected vs. actual behavior, and your environment (OS, Node version, tool version)
- For security issues, see [SECURITY.md](SECURITY.md) instead
