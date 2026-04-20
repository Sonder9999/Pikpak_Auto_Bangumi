import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { sql } from "drizzle-orm";
import {
  createRule,
  getAllRules,
  getRuleById,
  getRulesBySourceId,
  updateRule,
  deleteRule,
} from "../../src/core/filter/rule-crud.ts";
import { applyFilters } from "../../src/core/filter/filter-engine.ts";
import { createSource } from "../../src/core/rss/source-crud.ts";
import { getDb, closeDb } from "../../src/core/db/connection.ts";

const TEST_DB = ":memory:";

function initTestDb() {
  const db = getDb(TEST_DB);
  db.run(sql`CREATE TABLE IF NOT EXISTS rss_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    poll_interval_ms INTEGER NOT NULL DEFAULT 300000,
    last_success_at TEXT,
    last_error_at TEXT,
    last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS rss_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES rss_sources(id) ON DELETE CASCADE,
    guid TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT,
    magnet_url TEXT,
    torrent_url TEXT,
    homepage TEXT,
    processed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS filter_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    mode TEXT NOT NULL,
    source_id INTEGER REFERENCES rss_sources(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS pikpak_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rss_item_id INTEGER REFERENCES rss_items(id),
    magnet_url TEXT NOT NULL,
    pikpak_task_id TEXT,
    pikpak_file_id TEXT,
    cloud_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    original_name TEXT,
    renamed_name TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  return db;
}

beforeEach(() => {
  closeDb();
  initTestDb();
});

afterEach(() => {
  closeDb();
});

describe("Filter rule CRUD", () => {
  test("create and list rules", () => {
    createRule({ name: "HD Only", pattern: "1080p|2160p", mode: "include" });
    createRule({ name: "No 720p", pattern: "720p", mode: "exclude" });

    const all = getAllRules();
    expect(all.length).toBe(2);
    expect(all[0]!.name).toBe("HD Only");
    expect(all[0]!.mode).toBe("include");
  });

  test("get rule by id", () => {
    const created = createRule({ name: "Test", pattern: "test", mode: "include" });
    const found = getRuleById(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Test");
  });

  test("update rule", () => {
    const created = createRule({ name: "Old", pattern: "old", mode: "include" });
    const updated = updateRule(created.id, { name: "New", pattern: "new", mode: "exclude" });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("New");
    expect(updated!.mode).toBe("exclude");
  });

  test("delete rule", () => {
    const created = createRule({ name: "Del", pattern: "del", mode: "include" });
    expect(deleteRule(created.id)).toBe(true);
    expect(getRuleById(created.id)).toBeUndefined();
  });

  test("rejects invalid regex", () => {
    expect(() => createRule({ name: "Bad", pattern: "[invalid", mode: "include" })).toThrow("Invalid regex");
  });

  test("rejects invalid regex on update", () => {
    const created = createRule({ name: "Good", pattern: "good", mode: "include" });
    expect(() => updateRule(created.id, { pattern: "(unclosed" })).toThrow("Invalid regex");
  });

  test("get rules by source id", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });
    createRule({ name: "Global", pattern: "global", mode: "include" });
    createRule({ name: "Source-specific", pattern: "specific", mode: "exclude", sourceId: source.id });

    const sourceRules = getRulesBySourceId(source.id);
    expect(sourceRules.length).toBe(1);
    expect(sourceRules[0]!.name).toBe("Source-specific");
  });

  test("create rule with enabled=false", () => {
    const rule = createRule({ name: "Disabled", pattern: "test", mode: "include", enabled: false });
    expect(rule.enabled).toBe(false);
  });
});

describe("Filter engine", () => {
  const items = [
    { title: "[LoliHouse] Anime A - 01 [1080p] [HEVC]" },
    { title: "[SubGroup] Anime B - 02 [720p] [AVC]" },
    { title: "[Sakura] Anime C - 03 [2160p] [HEVC]" },
    { title: "[Raw] Anime D - 04 [480p]" },
    { title: "[LoliHouse] Anime E - 05 [1080p] [AVC]" },
  ];

  test("no rules returns all items", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });
    const result = applyFilters(items, source.id);
    expect(result.length).toBe(5);
  });

  test("include rule filters to matching only", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });
    createRule({ name: "HD", pattern: "1080p|2160p", mode: "include" });

    const result = applyFilters(items, source.id);
    expect(result.length).toBe(3);
    expect(result.map((r) => r.title)).toEqual([
      "[LoliHouse] Anime A - 01 [1080p] [HEVC]",
      "[Sakura] Anime C - 03 [2160p] [HEVC]",
      "[LoliHouse] Anime E - 05 [1080p] [AVC]",
    ]);
  });

  test("exclude rule removes matching", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });
    createRule({ name: "No Low Res", pattern: "720p|480p", mode: "exclude" });

    const result = applyFilters(items, source.id);
    expect(result.length).toBe(3);
  });

  test("include + exclude combined", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });
    createRule({ name: "HD Only", pattern: "1080p", mode: "include" });
    createRule({ name: "No HEVC", pattern: "HEVC", mode: "exclude" });

    const result = applyFilters(items, source.id);
    // 1080p items: A (HEVC) and E (AVC); exclude HEVC → only E
    expect(result.length).toBe(1);
    expect(result[0]!.title).toBe("[LoliHouse] Anime E - 05 [1080p] [AVC]");
  });

  test("global rules apply to all sources", () => {
    const source1 = createSource({ name: "Feed 1", url: "https://example.com/rss1" });
    const source2 = createSource({ name: "Feed 2", url: "https://example.com/rss2" });

    // Global rule (no sourceId)
    createRule({ name: "No 480p", pattern: "480p", mode: "exclude" });

    const result1 = applyFilters(items, source1.id);
    const result2 = applyFilters(items, source2.id);
    expect(result1.length).toBe(4);
    expect(result2.length).toBe(4);
  });

  test("source-specific rules only apply to bound source", () => {
    const source1 = createSource({ name: "Feed 1", url: "https://example.com/rss1" });
    const source2 = createSource({ name: "Feed 2", url: "https://example.com/rss2" });

    // Rule specific to source1 only
    createRule({ name: "No 720p", pattern: "720p", mode: "exclude", sourceId: source1.id });

    const result1 = applyFilters(items, source1.id);
    const result2 = applyFilters(items, source2.id);
    expect(result1.length).toBe(4); // 720p excluded
    expect(result2.length).toBe(5); // no rules for source2
  });

  test("disabled rules are ignored", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });
    createRule({ name: "Disabled", pattern: ".*", mode: "exclude", enabled: false });

    const result = applyFilters(items, source.id);
    expect(result.length).toBe(5); // disabled rule has no effect
  });

  test("case insensitive matching", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });
    createRule({ name: "HEVC", pattern: "hevc", mode: "include" });

    const result = applyFilters(items, source.id);
    expect(result.length).toBe(2); // matches HEVC despite lowercase pattern
  });
});
