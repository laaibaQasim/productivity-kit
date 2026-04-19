# Claude Code Instructions

## Response Summary Requirement

**When this applies:** Only when **`session_tracking.enabled`** is **`true`** in **`.claude/config.json`** for this project. If it is **`false`** or the key is missing, **do not** follow the structured Summary / Implementation Details rules below for hook logging—respond normally unless the user asks for a summary.

If unsure, read `.claude/config.json` in the workspace before assuming the format is required.

---

When **`session_tracking.enabled`** is **`true`**, and you are responding to task-based requests (coding, debugging, feature implementation, etc.):

1. **Always include summaries for coding tasks** — no exceptions, regardless of response length
2. **Skip summaries only for**: non-coding task responses that are 2-3 lines or less
3. **Format**: "You asked me to [X], here's a summary of what I did: [summary]"
4. **For all coding tasks**: Add "Implementation Details" section before summary with:
   - Key files changed (with line numbers where relevant)
   - Important changes or decisions made
5. **Summary length**: One paragraph maximum, concise
6. **Heading format** (for hook detection): Always use `**Summary:**` as the exact heading

### Example Format (Coding Task)
```
[... response content ...]

**Implementation Details:**
- Updated `src/components/Button.tsx:45-60` to add loading state
- Modified `utils/validate.ts` to fix input sanitization

**Summary:**
You asked me to add a loading state to the Button component. I updated the component to accept a `loading` prop that disables the button and shows a spinner, then fixed a related validation issue in the utils file that was preventing proper error handling.
```

### Example Format (Non-Coding Task)
```
[... response content ...]

**Summary:**
You asked me to investigate the build failures. I found that the TypeScript config was missing the `skipLibCheck` flag and updated it, which resolved 3 of the 5 failing type checks.
```
