#!/usr/bin/env node

const fs = require("fs");
const {
  loadTrackerConfig,
  resolveStoreFileForToday,
  findStoreFileForSession,
  isSessionTrackingEnabled,
  readStore,
  writeStoreAtomic,
  findOpenSessionIndex,
  loadConversationTurns,
  tryExtractSummaryHeadingBullets,
} = require("./session-tracker-utils");

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    if (process.env.DEBUG) {
      process.stderr.write(`[session-end] stdin parse error: ${err.message}\n`);
    }
    return {};
  }
}

function parseIsoMs(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function computeDuration(startedAt, endedAt) {
  const startedMs = parseIsoMs(startedAt);
  const endedMs = parseIsoMs(endedAt);
  if (startedMs != null && endedMs != null && endedMs >= startedMs) {
    return Math.round(((endedMs - startedMs) / 60000) * 100) / 100;
  }
  return null;
}

/**
 * Finalize a session row with all available data and persist it.
 * Re-reads the store to avoid clobbering concurrent writes.
 * The transcript is the source of truth — bullets are replaced, not merged.
 */
function finalizeSession(storePath, sessionId, updates) {
  const freshStore = readStore(storePath);
  if (!Array.isArray(freshStore.sessions)) freshStore.sessions = [];

  const freshIdx = findOpenSessionIndex(freshStore.sessions, sessionId);
  if (freshIdx < 0) {
    process.stderr.write(
      `[session-end] session ${sessionId} disappeared from store before finalize; ` +
        "saving as new record.\n",
    );
    freshStore.sessions.push({ session_id: sessionId, ...updates });
  } else {
    Object.assign(freshStore.sessions[freshIdx], updates);
  }

  writeStoreAtomic(storePath, freshStore);
}

async function main() {
  const input = readStdinJson();
  const config = loadTrackerConfig();

  if (!isSessionTrackingEnabled(config)) {
    process.stdout.write("{}\n");
    return;
  }

  const sessionId = input.session_id || null;
  const endedAt = new Date().toISOString();

  if (!sessionId) {
    process.stdout.write("{}\n");
    return;
  }

  // Find which daily file contains this session (may be today or a previous day)
  const storePath =
    findStoreFileForSession(config, sessionId) ||
    resolveStoreFileForToday(config);

  const store = readStore(storePath);
  if (!Array.isArray(store.sessions)) {
    process.stdout.write("{}\n");
    return;
  }

  const idx = findOpenSessionIndex(store.sessions, sessionId);
  if (idx < 0) {
    if (process.env.DEBUG) {
      process.stderr.write(
        `[session-end] no open session for session_id=${sessionId}\n`,
      );
    }
    process.stdout.write("{}\n");
    return;
  }

  const row = store.sessions[idx];
  const totalDuration = computeDuration(row.started_at, endedAt);

  const transcriptPath = input.transcript_path || null;
  let summaryBullets = [];

  try {
    const parsed = await loadConversationTurns(transcriptPath);
    summaryBullets = tryExtractSummaryHeadingBullets(parsed.turns) || [];
  } catch (err) {
    process.stderr.write(
      `[session log] Could not read transcript (${err.message}); saving session with minimal data.\n`,
    );
  }

  if (!summaryBullets.length && process.env.DEBUG) {
    process.stderr.write(
      "[session log] No Summary section found in assistant messages.\n",
    );
  }

  const hasSummary = summaryBullets.length > 0;

  finalizeSession(storePath, sessionId, {
    ended_at: endedAt,
    duration_minutes: totalDuration,
    summary_bullets: hasSummary ? summaryBullets : null,
  });

  process.stdout.write("{}\n");
}

main().catch((err) => {
  process.stderr.write(`[session-end] ${err.stack || err}\n`);
  process.stdout.write("{}\n");
  process.exit(0);
});
