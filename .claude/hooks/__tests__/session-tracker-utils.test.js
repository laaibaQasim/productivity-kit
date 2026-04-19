const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const utils = require("../session-tracker-utils");

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sess-test-"));
}

function rmrf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// =============================================================================
// A. Store read/write
// =============================================================================
describe("readStore", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmrf(tmpDir); });

  it("returns valid data from existing file", () => {
    const p = path.join(tmpDir, "store.json");
    const data = { version: 1, sessions: [{ session_id: "abc", started_at: "2026-01-01T00:00:00Z" }] };
    fs.writeFileSync(p, JSON.stringify(data));
    const result = utils.readStore(p);
    assert.equal(result.version, 1);
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].session_id, "abc");
  });

  it("returns empty store for missing file (ENOENT)", () => {
    const p = path.join(tmpDir, "does-not-exist.json");
    const result = utils.readStore(p);
    assert.equal(result.version, utils.TRACKER_VERSION);
    assert.deepEqual(result.sessions, []);
  });

  it("archives corrupt JSON and returns empty store", () => {
    const p = path.join(tmpDir, "store.json");
    fs.writeFileSync(p, "NOT VALID JSON {{{");
    const result = utils.readStore(p);
    assert.equal(result.version, utils.TRACKER_VERSION);
    assert.deepEqual(result.sessions, []);
    assert.equal(fs.existsSync(p), false, "original corrupt file should be renamed");
    const files = fs.readdirSync(tmpDir);
    const bakFile = files.find((f) => f.includes(".corrupt.") && f.endsWith(".bak"));
    assert.ok(bakFile, "backup file should exist");
  });

  it("initializes missing sessions array", () => {
    const p = path.join(tmpDir, "store.json");
    fs.writeFileSync(p, JSON.stringify({ version: 1 }));
    const result = utils.readStore(p);
    assert.ok(Array.isArray(result.sessions));
  });
});

describe("writeStoreAtomic", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmrf(tmpDir); });

  it("writes valid JSON with version and updated_at", () => {
    const p = path.join(tmpDir, "store.json");
    const data = { sessions: [{ session_id: "x" }] };
    utils.writeStoreAtomic(p, data);
    const written = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.equal(written.version, utils.TRACKER_VERSION);
    assert.ok(written.updated_at, "should have updated_at");
    assert.equal(written.sessions.length, 1);
  });

  it("creates parent directories if missing", () => {
    const nested = path.join(tmpDir, "a", "b", "c", "store.json");
    utils.writeStoreAtomic(nested, { sessions: [] });
    assert.ok(fs.existsSync(nested));
    const written = JSON.parse(fs.readFileSync(nested, "utf8"));
    assert.deepEqual(written.sessions, []);
  });

});

// =============================================================================
// B. Session lifecycle
// =============================================================================
describe("findOpenSessionIndex", () => {
  it("returns index of last matching open session", () => {
    const sessions = [
      { session_id: "a", ended_at: null },
      { session_id: "a", ended_at: null },
    ];
    assert.equal(utils.findOpenSessionIndex(sessions, "a"), 1);
  });

  it("returns -1 for already-ended session", () => {
    const sessions = [
      { session_id: "a", ended_at: "2026-01-01T00:00:00Z" },
    ];
    assert.equal(utils.findOpenSessionIndex(sessions, "a"), -1);
  });

  it("returns -1 for unknown session ID", () => {
    const sessions = [{ session_id: "a", ended_at: null }];
    assert.equal(utils.findOpenSessionIndex(sessions, "unknown"), -1);
  });

  it("returns -1 for empty sessions array", () => {
    assert.equal(utils.findOpenSessionIndex([], "a"), -1);
  });
});

describe("closeStaleOpenSessions", () => {
  it("closes sessions older than cutoff", () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sessions = [{ session_id: "old", started_at: old, ended_at: null }];
    const closed = utils.closeStaleOpenSessions(sessions, 7);
    assert.equal(closed, 1);
    assert.ok(sessions[0].ended_at, "should have ended_at set");
    assert.equal(sessions[0].duration_minutes, 0);
  });

  it("leaves recent open sessions untouched", () => {
    const recent = new Date().toISOString();
    const sessions = [{ session_id: "new", started_at: recent, ended_at: null }];
    const closed = utils.closeStaleOpenSessions(sessions, 7);
    assert.equal(closed, 0);
    assert.equal(sessions[0].ended_at, null);
  });

  it("skips already-ended sessions", () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sessions = [{ session_id: "done", started_at: old, ended_at: old }];
    const closed = utils.closeStaleOpenSessions(sessions, 7);
    assert.equal(closed, 0);
  });

  it("uses default 7 days when staleDays is invalid", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const sessions = [
      { session_id: "old", started_at: eightDaysAgo, ended_at: null },
      { session_id: "recent", started_at: sixDaysAgo, ended_at: null },
    ];
    const closed = utils.closeStaleOpenSessions(sessions, null);
    assert.equal(closed, 1);
    assert.ok(sessions[0].ended_at);
    assert.equal(sessions[1].ended_at, null);
  });
});

describe("trimOldSessions", () => {
  it("removes oldest completed sessions when over limit", () => {
    const sessions = [
      { session_id: "1", ended_at: "2026-01-01" },
      { session_id: "2", ended_at: "2026-01-02" },
      { session_id: "3", ended_at: "2026-01-03" },
    ];
    const removed = utils.trimOldSessions(sessions, 2);
    assert.equal(removed, 1);
    assert.equal(sessions.length, 2);
  });

  it("preserves open sessions even when over limit", () => {
    const sessions = [
      { session_id: "open1", ended_at: null },
      { session_id: "open2", ended_at: null },
      { session_id: "closed", ended_at: "2026-01-01" },
    ];
    const removed = utils.trimOldSessions(sessions, 2);
    assert.equal(removed, 1);
    assert.equal(sessions.length, 2);
    assert.ok(sessions.every((s) => s.ended_at === null), "only open sessions remain");
  });

  it("does nothing when under limit", () => {
    const sessions = [{ session_id: "1", ended_at: "2026-01-01" }];
    const removed = utils.trimOldSessions(sessions, 10);
    assert.equal(removed, 0);
    assert.equal(sessions.length, 1);
  });
});

// =============================================================================
// C. Session ID consistency (start ↔ end) and resume
// =============================================================================
describe("findLastSessionIndexById", () => {
  it("finds a closed session by ID", () => {
    const sessions = [
      { session_id: "a", ended_at: "2026-01-01T00:00:00Z" },
      { session_id: "b", ended_at: null },
    ];
    assert.equal(utils.findLastSessionIndexById(sessions, "a"), 0);
  });

  it("returns last match when duplicates exist", () => {
    const sessions = [
      { session_id: "a", ended_at: "2026-01-01" },
      { session_id: "a", ended_at: null },
    ];
    assert.equal(utils.findLastSessionIndexById(sessions, "a"), 1);
  });

  it("returns -1 for unknown ID", () => {
    const sessions = [{ session_id: "a", ended_at: null }];
    assert.equal(utils.findLastSessionIndexById(sessions, "unknown"), -1);
  });

  it("returns -1 for empty array", () => {
    assert.equal(utils.findLastSessionIndexById([], "a"), -1);
  });
});

describe("session_id consistency between start and end", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmrf(tmpDir); });

  it("session-end finds a session created by session-start using the same session_id", () => {
    const storePath = path.join(tmpDir, "store.json");
    const sessionId = "test-session-abc-123";

    const store = { version: 1, sessions: [] };
    store.sessions.push({
      session_id: sessionId,
      started_at: new Date().toISOString(),
      ended_at: null,
    });
    utils.writeStoreAtomic(storePath, store);

    const loaded = utils.readStore(storePath);
    const idx = utils.findOpenSessionIndex(loaded.sessions, sessionId);
    assert.ok(idx >= 0, "session-end should find the open session by session_id");
    assert.equal(loaded.sessions[idx].session_id, sessionId);
  });

  it("round-trip: create open session, finalize it, verify it is closed", () => {
    const storePath = path.join(tmpDir, "store.json");
    const sessionId = "roundtrip-session-456";
    const startedAt = new Date().toISOString();

    const store = { version: 1, sessions: [] };
    store.sessions.push({
      session_id: sessionId,
      started_at: startedAt,
      ended_at: null,
      title: null,
    });
    utils.writeStoreAtomic(storePath, store);

    const freshStore = utils.readStore(storePath);
    const idx = utils.findOpenSessionIndex(freshStore.sessions, sessionId);
    assert.ok(idx >= 0);
    Object.assign(freshStore.sessions[idx], {
      ended_at: new Date().toISOString(),
      title: "Test session",
      ticket: "No ticket",
    });
    utils.writeStoreAtomic(storePath, freshStore);

    const final = utils.readStore(storePath);
    assert.equal(final.sessions.length, 1);
    assert.equal(final.sessions[0].session_id, sessionId);
    assert.ok(final.sessions[0].ended_at, "session should now be finalized");
    assert.equal(final.sessions[0].title, "Test session");

    const reopenIdx = utils.findOpenSessionIndex(final.sessions, sessionId);
    assert.equal(reopenIdx, -1, "finalized session should not appear as open");
  });

  it("resuming a closed session reopens it instead of creating a duplicate", () => {
    const storePath = path.join(tmpDir, "store.json");
    const sessionId = "resume-after-close";

    const store = { version: 1, sessions: [] };
    store.sessions.push({
      session_id: sessionId,
      started_at: "2026-04-18T10:00:00Z",
      ended_at: "2026-04-18T10:30:00Z",
      title: "Original title",
      duration_minutes: 30,
    });
    utils.writeStoreAtomic(storePath, store);

    const loaded = utils.readStore(storePath);
    const openIdx = utils.findOpenSessionIndex(loaded.sessions, sessionId);
    assert.equal(openIdx, -1, "closed session should not match findOpenSessionIndex");

    const closedIdx = utils.findLastSessionIndexById(loaded.sessions, sessionId);
    assert.ok(closedIdx >= 0, "findLastSessionIndexById should find the closed session");

    const row = loaded.sessions[closedIdx];
    row.resume_events = row.resume_events || [];
    row.resume_events.push({ at: "2026-04-18T11:00:00Z", source: null });
    row.ended_at = null;
    row.duration_minutes = null;
    utils.writeStoreAtomic(storePath, loaded);

    const final = utils.readStore(storePath);
    assert.equal(final.sessions.length, 1, "should NOT have created a duplicate");
    assert.equal(final.sessions[0].session_id, sessionId);
    assert.equal(final.sessions[0].ended_at, null, "should be reopened");
    assert.equal(final.sessions[0].title, "Original title", "should preserve previous title");
    assert.equal(final.sessions[0].resume_events.length, 1);
  });

});

// =============================================================================
// D. Summary extraction
// =============================================================================
describe("parseSummaryHeadingLine", () => {
  it('recognizes "## Summary"', () => {
    const result = utils.parseSummaryHeadingLine("## Summary");
    assert.ok(result !== null);
  });

  it('recognizes "**Summary:**"', () => {
    const result = utils.parseSummaryHeadingLine("**Summary:**");
    assert.ok(result !== null);
  });

  it('recognizes "Summary:"', () => {
    const result = utils.parseSummaryHeadingLine("Summary:");
    assert.ok(result !== null);
  });

  it("returns null for non-summary headings", () => {
    assert.equal(utils.parseSummaryHeadingLine("## Introduction"), null);
    assert.equal(utils.parseSummaryHeadingLine("Other text"), null);
    assert.equal(utils.parseSummaryHeadingLine(""), null);
    assert.equal(utils.parseSummaryHeadingLine(null), null);
  });
});

describe("extractBodyAfterSummaryHeading", () => {
  it("extracts body text after heading", () => {
    const text = "## Summary\nThis is the body.\nAnother line.";
    const body = utils.extractBodyAfterSummaryHeading(text);
    assert.ok(body.includes("This is the body."));
    assert.ok(body.includes("Another line."));
  });

  it("stops at next same-or-higher level heading", () => {
    const text = "## Summary\nBody here.\n## Next Section\nNot included.";
    const body = utils.extractBodyAfterSummaryHeading(text);
    assert.ok(body.includes("Body here."));
    assert.ok(!body.includes("Not included."));
  });

  it("returns null when no summary found", () => {
    const body = utils.extractBodyAfterSummaryHeading("## Introduction\nSome text.");
    assert.equal(body, null);
  });
});

describe("summaryBodyToBullets", () => {
  it("strips -, *, and numbered list markers", () => {
    const bullets = utils.summaryBodyToBullets("- First\n* Second\n1. Third\n2) Fourth");
    assert.deepEqual(bullets, ["First", "Second", "Third", "Fourth"]);
  });

  it("skips empty lines", () => {
    const bullets = utils.summaryBodyToBullets("- First\n\n- Second\n\n");
    assert.deepEqual(bullets, ["First", "Second"]);
  });
});

describe("tryExtractSummaryHeadingBullets", () => {
  it("collects bullets from all assistant messages (oldest to newest)", () => {
    const turns = [
      { role: "assistant", text: "## Summary\n- Old bullet" },
      { role: "user", text: "thanks" },
      { role: "assistant", text: "## Summary\n- New bullet" },
    ];
    const bullets = utils.tryExtractSummaryHeadingBullets(turns);
    assert.deepEqual(bullets, ["Old bullet", "New bullet"]);
  });

  it("extracts summary from multi-line text with Implementation Details preceding it", () => {
    const text = [
      "**Implementation Details:**",
      "- Created Modal.js — a reusable React Modal component",
      "- Created Modal.css — styling with overlay",
      "",
      "**Summary:**",
      "Created a React Modal component with props for title, children, onClose, and",
      "isOpen. The modal includes a styled overlay, header with close button.",
    ].join("\n");
    const turns = [{ role: "assistant", text }];
    const bullets = utils.tryExtractSummaryHeadingBullets(turns);
    assert.ok(bullets, "should find summary bullets");
    assert.ok(bullets.length > 0, "should have at least one bullet");
    assert.ok(
      bullets[0].includes("React Modal"),
      `first bullet should mention React Modal, got: ${bullets[0]}`,
    );
  });

  it("extracts plain 'Summary:' heading (no bold)", () => {
    const text = "Some preamble.\n\nSummary:\nDid the thing.\nFixed the bug.";
    const turns = [{ role: "assistant", text }];
    const bullets = utils.tryExtractSummaryHeadingBullets(turns);
    assert.ok(bullets);
    assert.ok(bullets.length >= 1);
  });
});

// =============================================================================
// E. Title derivation
// =============================================================================
describe("deriveTitleFromSummaryBullets", () => {
  it("uses first bullet as title", () => {
    const title = utils.deriveTitleFromSummaryBullets(["Added auth feature", "Fixed tests"]);
    assert.equal(title, "Added auth feature");
  });

  it("truncates long titles at 100 chars", () => {
    const longBullet = "A".repeat(150);
    const title = utils.deriveTitleFromSummaryBullets([longBullet]);
    assert.equal(title.length, 100);
    assert.ok(title.endsWith("…"));
  });

  it('falls back to "Session YYYY-MM-DD"', () => {
    const title = utils.deriveTitleFromSummaryBullets([], "2026-04-18T12:00:00Z");
    assert.equal(title, "Session 2026-04-18");
  });
});

// =============================================================================
// F. Path resolution — daily file scheme
// =============================================================================
describe("todayDateString", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = utils.todayDateString();
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("resolveStoreDirectory", () => {
  it("uses configured directory", () => {
    const config = { session_tracking: { store_directory: "my-logs" } };
    const result = utils.resolveStoreDirectory(config);
    const repoRoot = path.resolve(__dirname, "../../..");
    assert.equal(result, path.join(repoRoot, "my-logs"));
  });

  it("falls back to work-logs when unconfigured", () => {
    const result = utils.resolveStoreDirectory({});
    const repoRoot = path.resolve(__dirname, "../../..");
    assert.equal(result, path.join(repoRoot, "work-logs"));
  });

  it("blocks directories escaping project root", () => {
    const config = { session_tracking: { store_directory: "../../../tmp" } };
    const result = utils.resolveStoreDirectory(config);
    const repoRoot = path.resolve(__dirname, "../../..");
    assert.equal(result, path.join(repoRoot, "work-logs"));
  });
});

describe("buildStoreFilePath", () => {
  it("builds prefix-date.json path", () => {
    const config = {
      session_tracking: {
        store_directory: "work-logs",
        store_name_prefix: "session-work-log",
      },
    };
    const result = utils.buildStoreFilePath(config, "2026-04-18");
    const repoRoot = path.resolve(__dirname, "../../..");
    assert.equal(
      result,
      path.join(repoRoot, "work-logs", "session-work-log-2026-04-18.json"),
    );
  });

  it("uses default prefix when unconfigured", () => {
    const result = utils.buildStoreFilePath({}, "2026-01-01");
    assert.ok(result.endsWith("session-work-log-2026-01-01.json"));
  });
});

describe("resolveStoreFileForToday", () => {
  it("returns path ending with today's date", () => {
    const config = {
      session_tracking: {
        store_directory: "work-logs",
        store_name_prefix: "session-work-log",
      },
    };
    const result = utils.resolveStoreFileForToday(config);
    const today = utils.todayDateString();
    assert.ok(
      result.endsWith(`session-work-log-${today}.json`),
      `expected path to end with today's date, got: ${result}`,
    );
  });
});

describe("resolveStoreFilePath (backward compat)", () => {
  it("returns same as resolveStoreFileForToday", () => {
    const config = {
      session_tracking: {
        store_directory: "work-logs",
        store_name_prefix: "session-work-log",
      },
    };
    assert.equal(
      utils.resolveStoreFilePath(config),
      utils.resolveStoreFileForToday(config),
    );
  });
});

// =============================================================================
// G. Misc edge cases
// =============================================================================
describe("buildChunks", () => {
  it("handles zero duration", () => {
    const chunks = utils.buildChunks([], 0, ["Did stuff"]);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].minutes, 0.05);
  });

  it("handles NaN duration (floors to 0.05)", () => {
    const chunks = utils.buildChunks([], NaN, ["Did stuff"]);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].minutes, 0.05);
  });
});

describe("cleanupOrphanedTmpFiles", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmrf(tmpDir); });

  it("removes .tmp files matching store base name", () => {
    const storePath = path.join(tmpDir, "store.json");
    fs.writeFileSync(path.join(tmpDir, "store.json.123.456.tmp"), "junk");
    fs.writeFileSync(path.join(tmpDir, "store.json.789.000.tmp"), "junk");
    utils.cleanupOrphanedTmpFiles(storePath);
    const remaining = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".tmp"));
    assert.equal(remaining.length, 0);
  });

  it("ignores non-matching files", () => {
    const storePath = path.join(tmpDir, "store.json");
    fs.writeFileSync(path.join(tmpDir, "other.tmp"), "keep");
    fs.writeFileSync(path.join(tmpDir, "data.json"), "keep");
    utils.cleanupOrphanedTmpFiles(storePath);
    const files = fs.readdirSync(tmpDir);
    assert.equal(files.length, 2);
  });
});
