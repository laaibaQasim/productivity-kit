#!/usr/bin/env node

/**
 * Finalizes the open session when the Cursor agent stops.
 * First tries bullets already captured incrementally by capture-summary.js.
 * Falls back to scanning the transcript_path Cursor provides (same as Claude).
 */

const fs = require("fs");
const path = require("path");
const {
  loadTrackerConfig,
  isSessionTrackingEnabled,
  resolveStoreFileForToday,
  readStore,
  writeStoreAtomic,
  findOpenSessionIndex,
  loadConversationTurns,
  tryExtractSummaryHeadingBullets,
} = require("../../.claude/hooks/session-tracker-utils");

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    if (process.env.DEBUG) {
      process.stderr.write(`[cursor:session-end] stdin parse error: ${err.message}\n`);
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
  const startMs = parseIsoMs(startedAt);
  const endMs = parseIsoMs(endedAt);
  if (startMs != null && endMs != null && endMs >= startMs) {
    return Math.round(((endMs - startMs) / 60000) * 100) / 100;
  }
  return null;
}

const CONFIG_PATH = path.resolve(__dirname, "../config.json");

async function main() {
  const input = readStdinJson();
  const config = loadTrackerConfig(CONFIG_PATH);

  if (!isSessionTrackingEnabled(config)) {
    process.stdout.write("{}\n");
    return;
  }

  const sessionId = input.session_id || null;
  const transcriptPath = input.transcript_path || null;
  const endedAt = new Date().toISOString();

  if (!sessionId) {
    process.stdout.write("{}\n");
    return;
  }

  // Always finalize in today's file (daily view: all activity on a given day goes in that day's file)
  const STORE_PATH = resolveStoreFileForToday(config);

  // Early check — bail fast if session is already closed
  const store = readStore(STORE_PATH);
  if (!Array.isArray(store.sessions)) {
    process.stdout.write("{}\n");
    return;
  }
  const idx = findOpenSessionIndex(store.sessions, sessionId);
  if (idx < 0) {
    if (process.env.DEBUG) {
      process.stderr.write(`[cursor:session-end] no open session for session_id=${sessionId}\n`);
    }
    process.stdout.write("{}\n");
    return;
  }

  // Re-read fresh right before writing to avoid clobbering concurrent
  // capture-summary.js writes (race: afterAgentResponse + stop fire together).
  const freshStore = readStore(STORE_PATH);
  if (!Array.isArray(freshStore.sessions)) {
    process.stdout.write("{}\n");
    return;
  }
  const freshIdx = findOpenSessionIndex(freshStore.sessions, sessionId);
  if (freshIdx < 0) {
    process.stdout.write("{}\n");
    return;
  }

  const row = freshStore.sessions[freshIdx];
  const duration = computeDuration(row.started_at, endedAt);

  let summaryBullets =
    Array.isArray(row.summary_bullets) && row.summary_bullets.length
      ? row.summary_bullets
      : null;

  if (!summaryBullets && transcriptPath) {
    try {
      const { turns } = await loadConversationTurns(transcriptPath);
      const extracted = tryExtractSummaryHeadingBullets(turns);
      if (extracted && extracted.length) {
        summaryBullets = extracted;
      }
    } catch (err) {
      if (process.env.DEBUG) {
        process.stderr.write(`[cursor:session-end] transcript scan failed: ${err.message}\n`);
      }
    }
  }

  Object.assign(row, {
    ended_at: endedAt,
    duration_minutes: duration,
    ...(summaryBullets && { summary_bullets: summaryBullets }),
  });

  writeStoreAtomic(STORE_PATH, freshStore);
  process.stdout.write("{}\n");
}

main().catch((err) => {
  process.stderr.write(`[cursor:session-end] ${err.stack || err}\n`);
  process.stdout.write("{}\n");
  process.exit(0);
});
