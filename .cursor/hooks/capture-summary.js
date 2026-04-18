#!/usr/bin/env node

/**
 * Fires on afterAgentResponse. Scans the agent reply for a **Summary:** block
 * and, if found, appends bullets to the open session record.
 */

const path = require("path");
const fs = require("fs");
const {
  loadTrackerConfig,
  isSessionTrackingEnabled,
  resolveStoreFileForToday,
  findStoreFileForSession,
  readStore,
  writeStoreAtomic,
  findOpenSessionIndex,
  extractBodyAfterSummaryHeading,
  summaryBodyToBullets,
  getMaxBullets,
} = require("../../.claude/hooks/session-tracker-utils");

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    if (process.env.DEBUG) {
      process.stderr.write(`[cursor:capture-summary] stdin parse error: ${err.message}\n`);
    }
    return {};
  }
}

const CONFIG_PATH = path.resolve(__dirname, "../config.json");

function main() {
  const input = readStdinJson();
  const config = loadTrackerConfig(CONFIG_PATH);

  if (!isSessionTrackingEnabled(config)) {
    process.stdout.write("{}\n");
    return;
  }

  const sessionId = input.session_id || null;
  const responseText = input.text || null;

  if (!sessionId || !responseText || typeof responseText !== "string") {
    process.stdout.write("{}\n");
    return;
  }

  const body = extractBodyAfterSummaryHeading(responseText);
  if (!body) {
    process.stdout.write("{}\n");
    return;
  }

  const bullets = summaryBodyToBullets(body);
  if (!bullets.length) {
    process.stdout.write("{}\n");
    return;
  }

  // Find the file containing this session (today's or a prior day's)
  const STORE_PATH =
    findStoreFileForSession(config, sessionId) ||
    resolveStoreFileForToday(config);

  const store = readStore(STORE_PATH);
  if (!Array.isArray(store.sessions)) {
    process.stdout.write("{}\n");
    return;
  }

  const idx = findOpenSessionIndex(store.sessions, sessionId);
  if (idx < 0) {
    if (process.env.DEBUG) {
      process.stderr.write(
        `[cursor:capture-summary] no open session for session_id=${sessionId}\n`,
      );
    }
    process.stdout.write("{}\n");
    return;
  }

  const row = store.sessions[idx];

  const prior = Array.isArray(row.summary_bullets) ? row.summary_bullets : [];
  const combined = [...prior, ...bullets];
  row.summary_bullets = combined.slice(-getMaxBullets(config));

  writeStoreAtomic(STORE_PATH, store);
  process.stdout.write("{}\n");
}

main();
