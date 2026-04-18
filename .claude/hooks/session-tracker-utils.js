/**
 * Shared helpers for SessionStart / SessionEnd work tracking.
 * No external dependencies; paths are resolved from this repo's .claude layout.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");


const TRACKER_VERSION = 1;

function tryExecGit(cwd, args) {
  try {
    return (
      execFileSync("git", args, {
        cwd: cwd || undefined,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })?.trim() || ""
    );
  } catch {
    return "";
  }
}

function getBranchName(cwd) {
  if (!cwd) return null;
  const b = tryExecGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return b || null;
}

function readPackageName(cwd) {
  if (!cwd) return null;
  try {
    const p = path.join(cwd, "package.json");
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    if (j && typeof j.name === "string" && j.name.trim()) return j.name.trim();
  } catch {
    /* ignore */
  }
  return null;
}

function getProjectName(cwd) {
  if (!cwd) return null;
  const fromPkg = readPackageName(cwd);
  if (fromPkg) return fromPkg;
  try {
    return path.basename(path.resolve(cwd)) || null;
  } catch {
    return null;
  }
}

function resolveProjectPath(cwd) {
  if (!cwd) return null;
  try {
    return path.resolve(cwd);
  } catch {
    return null;
  }
}

const DEFAULT_STORE_DIR = "work-logs";
const DEFAULT_STORE_PREFIX = "session-work-log";

function getProjectRoot() {
  try {
    return fs.realpathSync(path.resolve(__dirname, "../.."));
  } catch {
    return path.resolve(__dirname, "../..");
  }
}

function loadTrackerConfig(configPath) {
  const resolved = configPath || path.join(__dirname, "../config.json");
  try {
    const raw = fs.readFileSync(resolved, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT" && process.env.DEBUG) {
      process.stderr.write(
        `[session-tracker] loadTrackerConfig failed for ${resolved}: ${err.message}\n`,
      );
    }
    return null;
  }
}

/**
 * Resolves the directory where daily log files are stored.
 * Falls back to <projectRoot>/work-logs if unconfigured.
 */
function resolveStoreDirectory(config) {
  const projectRoot = getProjectRoot();
  const rel = config?.session_tracking?.store_directory;
  const dirName = (typeof rel === "string" && rel.trim()) || DEFAULT_STORE_DIR;

  let resolved = path.isAbsolute(dirName)
    ? dirName
    : path.resolve(projectRoot, dirName);

  try {
    if (fs.existsSync(resolved)) {
      resolved = fs.realpathSync(resolved);
    }
  } catch {
    /* dir may not exist yet */
  }

  if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
    process.stderr.write(
      `[session-tracker] store_directory "${dirName}" escapes project root; using default\n`,
    );
    return path.resolve(projectRoot, DEFAULT_STORE_DIR);
  }
  return resolved;
}

function getStorePrefix(config) {
  const p = config?.session_tracking?.store_name_prefix;
  return (typeof p === "string" && p.trim()) || DEFAULT_STORE_PREFIX;
}

/**
 * Returns today's date as YYYY-MM-DD in the local timezone.
 */
function todayDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Builds the full path for a given date's log file.
 */
function buildStoreFilePath(config, dateStr) {
  const dir = resolveStoreDirectory(config);
  const prefix = getStorePrefix(config);
  return path.join(dir, `${prefix}-${dateStr}.json`);
}

/**
 * Returns the store file path for today.
 */
function resolveStoreFileForToday(config) {
  return buildStoreFilePath(config, todayDateString());
}

/**
 * Backward compat: resolves a single store file path.
 * New code should use resolveStoreFileForToday() instead.
 * Kept for the session-end hooks that may need to find a session opened on a previous day.
 */
function resolveStoreFilePath(config) {
  return resolveStoreFileForToday(config);
}

/**
 * Find the store file that contains a given session ID.
 * Searches today's file first, then scans other files in the store directory
 * (most recent first) until found.
 */
function findStoreFileForSession(config, sessionId) {
  if (!sessionId) return null;

  const todayFile = resolveStoreFileForToday(config);
  if (sessionExistsInFile(todayFile, sessionId)) return todayFile;

  const dir = resolveStoreDirectory(config);
  const prefix = getStorePrefix(config);
  let files;
  try {
    files = fs.readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json") && !f.endsWith(".tmp"))
      .sort()
      .reverse();
  } catch {
    return null;
  }

  for (const f of files) {
    const fp = path.join(dir, f);
    if (fp === todayFile) continue;
    if (sessionExistsInFile(fp, sessionId)) return fp;
  }
  return null;
}

function sessionExistsInFile(filePath, sessionId) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.sessions)) return false;
    return data.sessions.some((s) => s && s.session_id === sessionId);
  } catch {
    return false;
  }
}

function isSessionTrackingEnabled(config) {
  const st = config?.session_tracking;
  if (!st || typeof st !== "object") return false;
  return st.enabled === true;
}

/**
 * If the store file exists but is not valid JSON, move it aside so history is not
 * silently discarded. Returns true if the file was archived (or missing).
 */
function archiveCorruptStoreFile(storePath, err) {
  const base = path.basename(storePath);
  const dest = path.join(
    path.dirname(storePath),
    `${base}.corrupt.${Date.now()}.bak`,
  );
  try {
    fs.renameSync(storePath, dest);
    process.stderr.write(
      `[session-tracker] ${base} was invalid JSON (${err.message}); preserved as ${path.basename(dest)}\n`,
    );
    if (process.env.DEBUG) {
      process.stderr.write(`[session-tracker] readStore: ${String(err.stack || err)}\n`);
    }
    return true;
  } catch (moveErr) {
    process.stderr.write(
      `[session-tracker] CRITICAL: could not archive corrupt ${base} (${moveErr.message}). ` +
        `Repair or rename the file manually before the next session write.\n`,
    );
    if (process.env.DEBUG) {
      process.stderr.write(`[session-tracker] archiveCorruptStoreFile: ${String(moveErr.stack || moveErr)}\n`);
    }
    return false;
  }
}

function readStore(storePath) {
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") throw new Error("invalid root");
    if (!Array.isArray(data.sessions)) data.sessions = [];
    if (data.version == null) data.version = TRACKER_VERSION;
    return data;
  } catch (err) {
    if (err.code === "ENOENT") {
      return { version: TRACKER_VERSION, sessions: [] };
    }
    if (fs.existsSync(storePath)) {
      archiveCorruptStoreFile(storePath, err);
    } else if (process.env.DEBUG) {
      process.stderr.write(`[session-tracker] readStore failed: ${err.message}\n`);
    }
    return { version: TRACKER_VERSION, sessions: [] };
  }
}

function writeStoreAtomic(storePath, data) {
  const dir = path.dirname(storePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = {
    ...data,
    version: TRACKER_VERSION,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.renameSync(tmp, storePath);
  } catch (renameErr) {
    let copyErr;
    try {
      fs.copyFileSync(tmp, storePath);
    } catch (e) {
      copyErr = e;
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    if (copyErr) {
      process.stderr.write(
        `[session-tracker] CRITICAL: atomic write failed for ${path.basename(storePath)} ` +
          `(rename: ${renameErr.message}, copy: ${copyErr.message}). Data may be lost.\n`,
      );
    }
  }
}

function findOpenSessionIndex(sessions, sessionId) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s && s.session_id === sessionId && !s.ended_at) return i;
  }
  return -1;
}

/**
 * Find the most recent session with a given ID, regardless of open/closed state.
 * Returns the index or -1.
 */
function findLastSessionIndexById(sessions, sessionId) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i] && sessions[i].session_id === sessionId) return i;
  }
  return -1;
}

const FALLBACK_STALE_DAYS = 7;
const FALLBACK_MAX_SESSIONS = 200;
const FALLBACK_MAX_BULLETS = 50;

function getMaxBullets(config) {
  const v = config?.session_tracking?.max_bullets;
  return typeof v === "number" && v > 0 ? v : FALLBACK_MAX_BULLETS;
}

/**
 * Auto-close sessions older than staleDays that were never finalized.
 * Returns the number of sessions closed.
 */
function closeStaleOpenSessions(sessions, staleDays) {
  const days =
    typeof staleDays === "number" && staleDays > 0
      ? staleDays
      : FALLBACK_STALE_DAYS;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let closed = 0;
  for (const s of sessions) {
    if (!s || s.ended_at) continue;
    const startMs = Date.parse(s.started_at);
    if (!Number.isNaN(startMs) && startMs < cutoff) {
      s.ended_at = s.started_at;
      s.duration_minutes = 0;
      closed++;
    }
  }
  return closed;
}

/**
 * Trim the oldest completed sessions to stay within maxSessions.
 * Keeps all open (unfinalised) sessions regardless of the limit.
 */
function trimOldSessions(sessions, maxSessions) {
  const limit =
    typeof maxSessions === "number" && maxSessions > 0
      ? maxSessions
      : FALLBACK_MAX_SESSIONS;
  if (sessions.length <= limit) return 0;
  const excess = sessions.length - limit;
  let removed = 0;
  for (let i = 0; i < sessions.length && removed < excess; ) {
    if (sessions[i] && sessions[i].ended_at) {
      sessions.splice(i, 1);
      removed++;
    } else {
      i++;
    }
  }
  return removed;
}

/**
 * Remove leftover .tmp files from previous crashed writes.
 */
function cleanupOrphanedTmpFiles(storePath) {
  try {
    const dir = path.dirname(storePath);
    const base = path.basename(storePath);
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      if (name.startsWith(base) && name.endsWith(".tmp")) {
        try {
          fs.unlinkSync(path.join(dir, name));
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

/** Default title from first Summary bullet. */
function deriveTitleFromSummaryBullets(bullets, fallbackDateIso) {
  const first = bullets && bullets[0];
  if (first) {
    const t = normalizeOneLine(first);
    if (t.length) return truncate(t, 100);
  }
  const d = (fallbackDateIso || new Date().toISOString()).slice(0, 10);
  return `Session ${d}`;
}

function normalizeOneLine(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max) {
  const t = normalizeOneLine(text);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Recursively collect text from Anthropic-style content blocks.
 * Preserves newlines so downstream heading detection (e.g. "Summary:")
 * can match at the start of a line.
 */
function collectTextFromContent(content, out) {
  if (content == null) return;
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed) out.push(trimmed);
    return;
  }
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        collectTextFromContent(block.text, out);
      } else if (block.type === "tool_use" || block.type === "tool_result") {
        continue;
      } else if (typeof block.text === "string") {
        collectTextFromContent(block.text, out);
      } else if (block.content) {
        collectTextFromContent(block.content, out);
      }
    }
    return;
  }
  if (typeof content === "object") {
    if (typeof content.text === "string") collectTextFromContent(content.text, out);
    if (Array.isArray(content.content))
      collectTextFromContent(content.content, out);
  }
}

function normalizeDialogueRole(value) {
  const r = String(value || "")
    .trim()
    .toLowerCase();
  if (
    r === "user" ||
    r === "human" ||
    r === "humanmessage" ||
    r === "human_message"
  ) {
    return "user";
  }
  if (
    r === "assistant" ||
    r === "ai" ||
    r === "model" ||
    r === "assistantmessage"
  ) {
    return "assistant";
  }
  return null;
}

/**
 * Best-effort: Claude Code JSONL varies by version. We only pull plain dialogue text.
 * Unsupported shapes yield empty turns (caller should treat summary as low confidence).
 */
function extractTurnFromLine(obj) {
  if (!obj || typeof obj !== "object") return null;

  const topType = obj.type;
  if (topType === "tool_use" || topType === "tool_result") return null;

  let role = null;

  if (topType === "user" || topType === "human") role = "user";
  else if (topType === "assistant") role = "assistant";

  const msg = obj.message;

  if (topType === "message" && msg && typeof msg === "object") {
    role =
      role ||
      normalizeDialogueRole(msg.role) ||
      normalizeDialogueRole(msg.type);
  }

  if (typeof msg === "string") {
    const text = normalizeOneLine(msg);
    if (!text || !role) return null;
    return { role, text };
  }

  if (msg && typeof msg === "object") {
    if (!role) {
      role =
        normalizeDialogueRole(msg.role) ||
        normalizeDialogueRole(msg.type) ||
        (typeof msg.name === "string" ? normalizeDialogueRole(msg.name) : null);
    }
  }

  if (!role && typeof obj.role === "string") {
    role = normalizeDialogueRole(obj.role);
  }

  const parts = [];

  if (msg && typeof msg === "object") {
    if (typeof msg.content !== "undefined") collectTextFromContent(msg.content, parts);
    else if (typeof msg.text === "string") collectTextFromContent(msg.text, parts);
  }

  if (!parts.length && typeof obj.content !== "undefined") {
    collectTextFromContent(obj.content, parts);
  }
  if (!parts.length && typeof obj.text === "string") {
    collectTextFromContent(obj.text, parts);
  }

  const text = parts.join("\n").trim();
  if (!text) return null;
  if (!role) return null;

  return { role, text };
}

/**
 * Best-effort JSONL transcript parser (Claude Code–oriented). Not a guarantee of full
 * session fidelity; tool-only lines and unknown schemas are skipped.
 */
async function loadConversationTurns(transcriptPath) {
  const turns = [];
  if (!transcriptPath) return { turns, tool_use_lines: 0, parse_errors: 0 };

  let toolUseLines = 0;
  let parseErrors = 0;

  const stream = fs.createReadStream(transcriptPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      parseErrors++;
      continue;
    }
    const tt = obj?.type;
    if (
      tt === "tool_use" ||
      tt === "tool_result" ||
      tt === "tool_use_result" ||
      tt === "function_call" ||
      tt === "function_call_result"
    ) {
      toolUseLines++;
      continue;
    }
    const turn = extractTurnFromLine(obj);
    if (turn) turns.push(turn);
  }

  return { turns, tool_use_lines: toolUseLines, parse_errors: parseErrors };
}

/**
 * Recognizes Summary section starters (Markdown ##, plain Summary:, **Summary:**, etc.).
 * Returns { sameLineBody } when the heading has optional text after it on the same line.
 */
function parseSummaryHeadingLine(trimmed) {
  if (!trimmed) return null;

  if (/^#{1,6}\s*Summary\b/i.test(trimmed)) {
    return { sameLineBody: "" };
  }
  if (/^\*\*\s*Summary\s*\*\*\s*$/i.test(trimmed)) {
    return { sameLineBody: "" };
  }
  /**
   * Documented heading: `**Summary:**` (bold wraps "Summary:" — colon then closing **).
   * Optional text after the closing ** on the same line is part of the body.
   */
  const boldSummaryLabel = trimmed.match(/^\*\*\s*Summary\s*:\s*\*\*\s*(.*)$/i);
  if (boldSummaryLabel) {
    return { sameLineBody: (boldSummaryLabel[1] || "").trim() };
  }
  const plain = trimmed.match(/^Summary\s*:\s*(.*)$/i);
  if (plain) {
    return { sameLineBody: (plain[1] || "").trim() };
  }
  return null;
}

function isSummaryHeadingLine(trimmed) {
  return parseSummaryHeadingLine(trimmed) != null;
}

function markdownHeadingLevel(trimmed) {
  const m = trimmed.match(/^(#{1,6})(\s|$)/);
  return m ? m[1].length : 0;
}

/**
 * Returns body text after a Summary heading, or null.
 */
function extractBodyAfterSummaryHeading(text) {
  const lines = String(text || "").split(/\r?\n/);
  let i = 0;
  let found = false;
  let sameLinePrefix = "";
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    const parsed = parseSummaryHeadingLine(t);
    if (parsed) {
      sameLinePrefix = parsed.sameLineBody || "";
      i++;
      found = true;
      break;
    }
  }
  if (!found) return null;

  const summaryLine = lines[i - 1].trim();
  const summaryLevel = markdownHeadingLevel(summaryLine) || 2;

  const body = [];
  if (sameLinePrefix) {
    body.push(sameLinePrefix);
  }
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    const hl = markdownHeadingLevel(t);
    if (hl > 0 && hl <= summaryLevel && !isSummaryHeadingLine(t)) {
      break;
    }
    body.push(raw);
  }
  const joined = body.join("\n").trim();
  return joined || null;
}

/**
 * Turns a Summary body into bullet strings (list markers stripped).
 */
function summaryBodyToBullets(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let item = t.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
    if (item) out.push(item);
  }
  return out;
}

/**
 * Scans all assistant messages (oldest to newest), collecting bullets from every
 * message that contains a Summary section. Returns the combined array, or null.
 */
function tryExtractSummaryHeadingBullets(turns) {
  if (!turns.length) return null;
  const allBullets = [];
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].role !== "assistant") continue;
    const body = extractBodyAfterSummaryHeading(turns[i].text);
    if (!body) continue;
    const bullets = summaryBodyToBullets(body);
    if (bullets.length) {
      allBullets.push(...bullets);
      continue;
    }
    const fallback = normalizeOneLine(body);
    if (fallback.length >= 12) allBullets.push(fallback);
  }
  return allBullets.length ? allBullets : null;
}

/**
 * Summary bullets from assistant "## Summary" sections only (may be empty array).
 */
function buildSummaryBullets(turns) {
  return tryExtractSummaryHeadingBullets(turns) || [];
}

/**
 * One chunk from the Summary bullets; duration fills the session window.
 */
function buildChunks(_turns, totalMinutes, summaryBullets) {
  const safeMinutes = Math.max(
    0.05,
    typeof totalMinutes === "number" && !Number.isNaN(totalMinutes) ? totalMinutes : 0,
  );
  return [
    {
      title: "Summary",
      minutes: Math.round(safeMinutes * 100) / 100,
      bullets: Array.isArray(summaryBullets) ? summaryBullets : [],
    },
  ];
}

module.exports = {
  TRACKER_VERSION,
  getMaxBullets,
  getBranchName,
  getProjectName,
  resolveProjectPath,
  loadTrackerConfig,
  resolveStoreDirectory,
  resolveStoreFilePath,
  resolveStoreFileForToday,
  buildStoreFilePath,
  findStoreFileForSession,
  todayDateString,
  isSessionTrackingEnabled,
  readStore,
  writeStoreAtomic,
  findOpenSessionIndex,
  findLastSessionIndexById,
  closeStaleOpenSessions,
  trimOldSessions,
  cleanupOrphanedTmpFiles,
  deriveTitleFromSummaryBullets,
  loadConversationTurns,
  buildSummaryBullets,
  tryExtractSummaryHeadingBullets,
  buildChunks,
  truncate,
  parseSummaryHeadingLine,
  extractBodyAfterSummaryHeading,
  summaryBodyToBullets,
};
