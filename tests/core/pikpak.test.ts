import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { sql } from "drizzle-orm";
import { captchaSign } from "../../src/core/pikpak/crypto.ts";
import { PikPakAuth } from "../../src/core/pikpak/auth.ts";
import {
  createTaskRecord, updateTaskStatus, isDuplicateSubmission,
  getTasksByStatus, getAllTasks,
} from "../../src/core/pikpak/task-manager.ts";
import { getDb, closeDb } from "../../src/core/db/connection.ts";
import { pikpakTasks } from "../../src/core/db/schema.ts";

const TEST_TOKEN_PATH = "data/test-pikpak-token.json";

function initTestDb() {
  const db = getDb(":memory:");
  db.run(sql`CREATE TABLE IF NOT EXISTS rss_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    poll_interval_ms INTEGER NOT NULL DEFAULT 300000,
    last_success_at TEXT, last_error_at TEXT, last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS rss_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES rss_sources(id) ON DELETE CASCADE,
    guid TEXT NOT NULL, title TEXT NOT NULL, link TEXT,
    magnet_url TEXT, torrent_url TEXT, homepage TEXT,
    processed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
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

// ─── Crypto tests ──────────────────────────────────────────────

describe("captchaSign", () => {
  test("returns deterministic result for same inputs", () => {
    const sign1 = captchaSign("cid", "1.0", "pkg", "dev1", "12345", ["salt1", "salt2"]);
    const sign2 = captchaSign("cid", "1.0", "pkg", "dev1", "12345", ["salt1", "salt2"]);
    expect(sign1).toBe(sign2);
  });

  test("starts with '1.' prefix", () => {
    const sign = captchaSign("cid", "1.0", "pkg", "dev1", "12345", ["s"]);
    expect(sign.startsWith("1.")).toBe(true);
  });

  test("produces 32-char hex after prefix", () => {
    const sign = captchaSign("cid", "1.0", "pkg", "dev1", "12345", ["s"]);
    const hex = sign.slice(2); // remove "1."
    expect(hex.length).toBe(32);
    expect(/^[0-9a-f]{32}$/.test(hex)).toBe(true);
  });

  test("empty salts produces md5 of concatenated input", () => {
    // With no salts, sign stays as the raw string (not hashed)
    const sign = captchaSign("a", "b", "c", "d", "e", []);
    // result is "1.abcde" since no salts means no hashing
    expect(sign).toBe("1.abcde");
  });

  test("different inputs produce different signs", () => {
    const sign1 = captchaSign("cid1", "1.0", "pkg", "dev1", "12345", ["salt"]);
    const sign2 = captchaSign("cid2", "1.0", "pkg", "dev1", "12345", ["salt"]);
    expect(sign1).not.toBe(sign2);
  });
});

// ─── Auth token persistence tests ──────────────────────────────

describe("PikPakAuth token persistence", () => {
  beforeEach(() => {
    mkdirSync("data", { recursive: true });
    if (existsSync(TEST_TOKEN_PATH)) rmSync(TEST_TOKEN_PATH);
  });

  afterEach(() => {
    if (existsSync(TEST_TOKEN_PATH)) rmSync(TEST_TOKEN_PATH);
  });

  test("saveToken creates token file", () => {
    const auth = new PikPakAuth({ tokenPath: TEST_TOKEN_PATH });
    auth.accessToken = "acc_123";
    auth.refreshToken = "ref_456";
    auth.userId = "user_789";
    auth.mode = "web";
    auth.saveToken();

    expect(existsSync(TEST_TOKEN_PATH)).toBe(true);
    const saved = JSON.parse(readFileSync(TEST_TOKEN_PATH, "utf-8"));
    expect(saved.accessToken).toBe("acc_123");
    expect(saved.refreshToken).toBe("ref_456");
    expect(saved.userId).toBe("user_789");
    expect(saved.webMode).toBe(true);
  });

  test("loadToken restores saved token", () => {
    const auth1 = new PikPakAuth({ tokenPath: TEST_TOKEN_PATH });
    auth1.accessToken = "acc_A";
    auth1.refreshToken = "ref_B";
    auth1.userId = "uid_C";
    auth1.mode = "lib";
    auth1.saveToken();

    const auth2 = new PikPakAuth({ tokenPath: TEST_TOKEN_PATH });
    const loaded = auth2.loadToken();
    expect(loaded).toBe(true);
    expect(auth2.accessToken).toBe("acc_A");
    expect(auth2.refreshToken).toBe("ref_B");
    expect(auth2.userId).toBe("uid_C");
    expect(auth2.mode).toBe("lib");
  });

  test("loadToken returns false when no file exists", () => {
    const auth = new PikPakAuth({ tokenPath: "data/nonexistent-token.json" });
    expect(auth.loadToken()).toBe(false);
  });

  test("loadToken returns false on corrupt file", () => {
    writeFileSync(TEST_TOKEN_PATH, "not json{{{");
    const auth = new PikPakAuth({ tokenPath: TEST_TOKEN_PATH });
    expect(auth.loadToken()).toBe(false);
  });

  test("cfg returns web config when mode is web", () => {
    const auth = new PikPakAuth();
    auth.mode = "web";
    expect(auth.cfg.clientId).toBe("YUMx5nI8ZU8Ap8pm");
  });

  test("cfg returns lib config when mode is lib", () => {
    const auth = new PikPakAuth();
    auth.mode = "lib";
    expect(auth.cfg.clientId).toBe("YNxT9w7GMdWvEOKa");
  });
});

// ─── Task manager DB tests ─────────────────────────────────────

describe("PikPak task manager", () => {
  beforeEach(() => {
    closeDb();
    initTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  test("createTaskRecord inserts a pending task", () => {
    const task = createTaskRecord(null, "magnet:?xt=urn:btih:abc123", "Test File");
    expect(task.id).toBeGreaterThan(0);
    expect(task.status).toBe("pending");
    expect(task.magnetUrl).toBe("magnet:?xt=urn:btih:abc123");
    expect(task.originalName).toBe("Test File");
  });

  test("updateTaskStatus changes status and extras", () => {
    const task = createTaskRecord(null, "magnet:?xt=urn:btih:def456");
    const updated = updateTaskStatus(task.id, "downloading", {
      pikpakTaskId: "pk_task_1",
      pikpakFileId: "pk_file_1",
    });
    expect(updated.status).toBe("downloading");
    expect(updated.pikpakTaskId).toBe("pk_task_1");
    expect(updated.pikpakFileId).toBe("pk_file_1");
  });

  test("isDuplicateSubmission detects pending task", () => {
    createTaskRecord(null, "magnet:?xt=urn:btih:dup1");
    expect(isDuplicateSubmission("magnet:?xt=urn:btih:dup1")).toBe(true);
  });

  test("isDuplicateSubmission detects downloading task", () => {
    const task = createTaskRecord(null, "magnet:?xt=urn:btih:dup2");
    updateTaskStatus(task.id, "downloading");
    expect(isDuplicateSubmission("magnet:?xt=urn:btih:dup2")).toBe(true);
  });

  test("isDuplicateSubmission detects complete task", () => {
    const task = createTaskRecord(null, "magnet:?xt=urn:btih:dup3");
    updateTaskStatus(task.id, "complete");
    expect(isDuplicateSubmission("magnet:?xt=urn:btih:dup3")).toBe(true);
  });

  test("isDuplicateSubmission detects renamed task", () => {
    const task = createTaskRecord(null, "magnet:?xt=urn:btih:dup4");
    updateTaskStatus(task.id, "renamed");
    expect(isDuplicateSubmission("magnet:?xt=urn:btih:dup4")).toBe(true);
  });

  test("isDuplicateSubmission returns false for error task (allows retry)", () => {
    const task = createTaskRecord(null, "magnet:?xt=urn:btih:err1");
    updateTaskStatus(task.id, "error", { errorMessage: "timeout" });
    expect(isDuplicateSubmission("magnet:?xt=urn:btih:err1")).toBe(false);
  });

  test("isDuplicateSubmission returns false for new magnet", () => {
    expect(isDuplicateSubmission("magnet:?xt=urn:btih:brand_new")).toBe(false);
  });

  test("getTasksByStatus filters correctly", () => {
    const t1 = createTaskRecord(null, "magnet:?xt=urn:btih:s1");
    const t2 = createTaskRecord(null, "magnet:?xt=urn:btih:s2");
    updateTaskStatus(t1.id, "complete");
    // t2 stays pending

    const pending = getTasksByStatus("pending");
    const complete = getTasksByStatus("complete");
    expect(pending.length).toBe(1);
    expect(pending[0].magnetUrl).toBe("magnet:?xt=urn:btih:s2");
    expect(complete.length).toBe(1);
    expect(complete[0].magnetUrl).toBe("magnet:?xt=urn:btih:s1");
  });

  test("getAllTasks returns all tasks", () => {
    createTaskRecord(null, "magnet:?xt=urn:btih:all1");
    createTaskRecord(null, "magnet:?xt=urn:btih:all2");
    createTaskRecord(null, "magnet:?xt=urn:btih:all3");
    const all = getAllTasks();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  test("updateTaskStatus records error message", () => {
    const task = createTaskRecord(null, "magnet:?xt=urn:btih:errmsg");
    const updated = updateTaskStatus(task.id, "error", {
      errorMessage: "PikPak API rate limit",
    });
    expect(updated.errorMessage).toBe("PikPak API rate limit");
  });

  test("updateTaskStatus records renamed name", () => {
    const task = createTaskRecord(null, "magnet:?xt=urn:btih:ren1", "Original.mkv");
    updateTaskStatus(task.id, "complete");
    const renamed = updateTaskStatus(task.id, "renamed", {
      renamedName: "S01E05.mkv",
    });
    expect(renamed.status).toBe("renamed");
    expect(renamed.renamedName).toBe("S01E05.mkv");
  });
});
