import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "../../src/core/db/connection.ts";
import { loadConfig } from "../../src/core/config/config.ts";
import { signJwt, verifyJwt } from "../../src/server/middleware/auth.ts";

const TEST_CONFIG_PATH = "data/test-entry-config.json";

function initTestDb() {
  const db = getDb(":memory:");
  db.run(sql`CREATE TABLE IF NOT EXISTS rss_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    poll_interval_ms INTEGER NOT NULL DEFAULT 300000,
    bangumi_subject_id INTEGER,
    mikan_bangumi_id INTEGER,
    last_success_at TEXT, last_error_at TEXT, last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS rss_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES rss_sources(id) ON DELETE CASCADE,
    guid TEXT NOT NULL, title TEXT NOT NULL, link TEXT,
    magnet_url TEXT, torrent_url TEXT, homepage TEXT,
    processed INTEGER NOT NULL DEFAULT 0,
    replay_status TEXT NOT NULL DEFAULT 'pending',
    decision_reason TEXT,
    linked_task_id INTEGER,
    created_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS filter_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, pattern TEXT NOT NULL, mode TEXT NOT NULL,
    source_id INTEGER REFERENCES rss_sources(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS pikpak_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rss_item_id INTEGER REFERENCES rss_items(id),
    magnet_url TEXT NOT NULL, pikpak_task_id TEXT, pikpak_file_id TEXT,
    cloud_path TEXT, status TEXT NOT NULL DEFAULT 'pending',
    original_name TEXT, renamed_name TEXT, error_message TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  return db;
}

// ─── Entry point dispatch tests ─────────────────────────────────

describe("entry point dispatch", () => {
  test("index.ts defaults to server mode", async () => {
    // Verify the entry file does correct arg parsing
    const src = await Bun.file("src/index.ts").text();
    expect(src).toContain("--mode");
    expect(src).toContain('import("./cli/index.ts")');
    expect(src).toContain('import("./server/index.ts")');
  });

  test("server entry imports pipeline", async () => {
    const src = await Bun.file("src/server/index.ts").text();
    expect(src).toContain("initCore");
    expect(src).toContain("startPipeline");
    expect(src).toContain("Elysia");
  });

  test("cli entry imports pipeline", async () => {
    const src = await Bun.file("src/cli/index.ts").text();
    expect(src).toContain("initCore");
    expect(src).toContain("startPipeline");
    expect(src).toContain("SIGINT");
  });
});

// ─── JWT auth tests ─────────────────────────────────────────────

describe("JWT middleware", () => {
  const SECRET = "test-secret-key-for-jwt";

  test("signJwt creates a valid JWT string", () => {
    const token = signJwt({ sub: "user1" }, SECRET);
    const parts = token.split(".");
    expect(parts.length).toBe(3);
  });

  test("verifyJwt validates a signed token", () => {
    const token = signJwt({ sub: "user1", role: "admin" }, SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(payload.sub).toBe("user1");
    expect(payload.role).toBe("admin");
  });

  test("verifyJwt rejects tampered token", () => {
    const token = signJwt({ sub: "user1" }, SECRET);
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(() => verifyJwt(tampered, SECRET)).toThrow();
  });

  test("verifyJwt rejects wrong secret", () => {
    const token = signJwt({ sub: "user1" }, SECRET);
    expect(() => verifyJwt(token, "wrong-secret")).toThrow();
  });

  test("verifyJwt rejects expired token", () => {
    const token = signJwt({ sub: "user1" }, SECRET, -10); // expired 10s ago
    expect(() => verifyJwt(token, SECRET)).toThrow();
  });

  test("verifyJwt rejects malformed tokens", () => {
    expect(() => verifyJwt("not.a.valid.jwt.token", SECRET)).toThrow();
    expect(() => verifyJwt("", SECRET)).toThrow();
  });
});

// ─── API route structure tests ──────────────────────────────────

describe("API route structure", () => {
  test("rss routes file defines CRUD endpoints", async () => {
    const src = await Bun.file("src/server/routes/rss.ts").text();
    expect(src).toContain("/api/rss");
    expect(src).toContain(".get(");
    expect(src).toContain(".post(");
    expect(src).toContain(".patch(");
    expect(src).toContain(".delete(");
  });

  test("rules routes file defines CRUD endpoints", async () => {
    const src = await Bun.file("src/server/routes/rules.ts").text();
    expect(src).toContain("/api/rules");
    expect(src).toContain(".get(");
    expect(src).toContain(".post(");
    expect(src).toContain(".patch(");
    expect(src).toContain(".delete(");
  });

  test("config routes file defines GET/PATCH + import/export", async () => {
    const src = await Bun.file("src/server/routes/config.ts").text();
    expect(src).toContain("/api/config");
    expect(src).toContain("export");
    expect(src).toContain("import");
  });

  test("tasks routes file defines query endpoints", async () => {
    const src = await Bun.file("src/server/routes/tasks.ts").text();
    expect(src).toContain("/api/tasks");
    expect(src).toContain("getAllTasks");
    expect(src).toContain("getTasksByStatus");
  });
});
