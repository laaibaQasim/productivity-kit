# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest on `main` | Yes |
| Older commits | No |

## Reporting a Vulnerability

If you discover a security issue, **please do not open a public GitHub issue.**

Instead, report it privately:

1. Email the maintainers directly (see profile or repo contact info)
2. Include a description of the issue, steps to reproduce, and potential impact
3. Allow reasonable time for a fix before any public disclosure

## What to Report

- Hooks that could leak sensitive data (API keys, tokens, credentials)
- Path traversal or file write outside the expected project scope
- Injection risks in stdin JSON parsing
- Any way for untrusted input to execute arbitrary code

## Scope

This project runs **locally** as CLI hooks. It does not expose network services. The primary risk surface is:

- **File system access** — hooks write to `work-logs/` and read transcript paths from stdin
- **stdin payloads** — hooks trust JSON from Claude Code / Cursor to the extent you trust those tools
- **Environment variables** — `.env` files may contain API keys (for log-analysis)

## Response

We aim to acknowledge reports within 48 hours and provide a fix or mitigation plan within 7 days for confirmed issues.
