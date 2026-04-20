Setup this project.
---
description: >-
  Initialize ai-dump: create work-logs, copy example configs,
  update .git/info/exclude, run hook tests.
---

# Setup

One-time local setup for Claude/Cursor hooks in this repo.

Set up this repository for local Claude/Cursor hook usage.

Follow this exact flow:

1. First, inspect the repo and confirm these paths:
   - `.claude/config.json.example`
   - `.cursor/config.json.example`
   - `.claude/hooks/__tests__`
   - `.cursor/hooks/__tests__` (optional)
   - `.git/` (optional, only if this is a git repo)

2. Do the setup work:
   - Create `work-logs/` in the repository root if it does not already exist.
   - If `.claude/config.json` does not exist and `.claude/config.json.example` exists, copy the example file to `.claude/config.json`.
   - If `.cursor/config.json` does not exist and `.cursor/config.json.example` exists, copy the example file to `.cursor/config.json`.
   - Never overwrite an existing `config.json` without asking.
   - If this repo has a `.git/` directory:
     - Ensure `.git/info/` exists.
     - Ensure `.git/info/exclude` contains these exact lines, adding only missing ones:
       - `work-logs/`
       - `.claude/config.json`
       - `.cursor/config.json`

3. Run tests:
   - If `.claude/hooks/__tests__` exists, run:
     `node --test .claude/hooks/__tests__`
   - If `.cursor/hooks/__tests__` exists, also run:
     `node --test .cursor/hooks/__tests__`
   - If Node is missing, stop and explain that Node is required.

4. When finished, give a concise summary that includes:
   - whether config files were created
   - whether `work-logs/` was created
   - whether `.git/info/exclude` was updated
   - whether tests passed

5. End with these smoke-test instructions:
   - Run one short task in Claude Code
   - Run one short task in Cursor
   - Trigger a permission request once
   - Confirm logs appear under `work-logs/`
   - Confirm Claude notifications behave as expected

Rules:
- Do not use npm.
- Do not install dependencies.
- Do not use sudo.
- Do not touch files outside this repository, except `.git/info/exclude` inside this repository.
- Prefer exact, minimal edits.
- If a required example config file is missing, report it clearly.
- If this is not a git repo, skip exclude-file setup and say so.
