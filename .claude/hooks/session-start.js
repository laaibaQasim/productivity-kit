#!/usr/bin/env node

const fs = require("fs");
const {
  loadTrackerConfig,
  resolveStoreFileForToday,
  isSessionTrackingEnabled,
  readStore,
  writeStoreAtomic,
  findOpenSessionIndex,
  findLastSessionIndexById,
  closeStaleOpenSessions,
  trimOldSessions,
  cleanupOrphanedTmpFiles,
  getBranchName,
  getProjectName,
  resolveProjectPath,
} = require("./session-tracker-utils");

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    if (process.env.DEBUG) {
      process.stderr.write(`[session-start] stdin parse error: ${err.message}\n`);
    }
    return {};
  }
}

function main() {
  const input = readStdinJson();
  const config = loadTrackerConfig();

  if (!isSessionTrackingEnabled(config)) {
    process.stdout.write("{}\n");
    return;
  }

  const todayStorePath = resolveStoreFileForToday(config);
  const cwd = input.cwd || process.cwd();
  const sessionId = input.session_id || null;
  const now = new Date().toISOString();

  cleanupOrphanedTmpFiles(todayStorePath);

  const store = readStore(todayStorePath);
  if (!Array.isArray(store.sessions)) store.sessions = [];

  const staleClosed = closeStaleOpenSessions(
    store.sessions,
    config?.session_tracking?.stale_session_days,
  );
  const trimmed = trimOldSessions(
    store.sessions,
    config?.session_tracking?.max_sessions,
  );
  if ((staleClosed || trimmed) && process.env.DEBUG) {
    process.stderr.write(
      `[session-start] housekeeping: closed ${staleClosed} stale, trimmed ${trimmed} old sessions\n`,
    );
  }

  if (!sessionId) {
    if (process.env.DEBUG) {
      process.stderr.write("[session-start] missing session_id; skipping write\n");
    }
    process.stdout.write("{}\n");
    return;
  }

  // Check today's file for any existing session (open or closed) with this ID
  let existingIdx = findOpenSessionIndex(store.sessions, sessionId);
  if (existingIdx < 0) {
    existingIdx = findLastSessionIndexById(store.sessions, sessionId);
  }

  if (existingIdx >= 0) {
    // Session exists in today's file — record resume event and reopen if closed
    const row = store.sessions[existingIdx];
    row.resume_events = row.resume_events || [];
    row.resume_events.push({
      at: now,
      source: input.source ?? null,
    });
    if (row.ended_at) {
      row.ended_at = null;
      row.duration_minutes = null;
    }
    writeStoreAtomic(todayStorePath, store);
    process.stdout.write("{}\n");
    return;
  }

  // New session — write to today's file
  store.sessions.push({
    session_id: sessionId,
    tool: "claude",
    started_at: now,
    project_name: getProjectName(cwd),
    project_path: resolveProjectPath(cwd),
    branch_name: getBranchName(cwd),
    ended_at: null,
    duration_minutes: null,
    summary_bullets: null,
  });

  writeStoreAtomic(todayStorePath, store);

  // SessionStart: stdout becomes model context if non-JSON; emit empty JSON only.
  process.stdout.write("{}\n");
}

main();
