import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { sql } from "drizzle-orm";
import { renderTemplate, buildRenamedName } from "../../src/core/renamer/renamer.ts";
import { loadConfig, saveConfig } from "../../src/core/config/config.ts";
import { getDb, closeDb } from "../../src/core/db/connection.ts";
import type { Episode } from "../../src/core/parser/types.ts";

const TEST_CONFIG_PATH = "data/test-renamer-config.json";

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

beforeEach(() => {
  mkdirSync("data", { recursive: true });
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  closeDb();
  initTestDb();
  loadConfig(TEST_CONFIG_PATH);
});

afterEach(() => {
  closeDb();
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
});

// ─── Template rendering ─────────────────────────────────────────

describe("renderTemplate", () => {
  const baseEp: Episode = {
    nameEn: "My Anime",
    nameZh: null,
    nameJp: null,
    season: 1,
    seasonRaw: "01",
    episode: 5,
    sub: "CHS",
    group: "SubGroup",
    resolution: "1080P",
    source: "WebRip",
  };

  test("default template S{season}E{episode}.{ext}", () => {
    const result = renderTemplate("S{season}E{episode}.{ext}", baseEp, "mkv");
    expect(result).toBe("S01E05.mkv");
  });

  test("custom template with title", () => {
    const result = renderTemplate("{title} - S{season}E{episode}.{ext}", baseEp, "mp4");
    expect(result).toBe("My Anime - S01E05.mp4");
  });

  test("template with group and resolution", () => {
    const result = renderTemplate("[{group}] S{season}E{episode} [{resolution}].{ext}", baseEp, "mkv");
    expect(result).toBe("[SubGroup] S01E05 [1080P].mkv");
  });

  test("pads season and episode to 2 digits", () => {
    const ep = { ...baseEp, season: 2, episode: 3 };
    const result = renderTemplate("S{season}E{episode}.{ext}", ep, "mkv");
    expect(result).toBe("S02E03.mkv");
  });

  test("handles large episode numbers", () => {
    const ep = { ...baseEp, episode: 125 };
    const result = renderTemplate("S{season}E{episode}.{ext}", ep, "mkv");
    expect(result).toBe("S01E125.mkv");
  });

  test("falls back to nameZh when nameEn is null", () => {
    const ep = { ...baseEp, nameEn: null, nameZh: "Chinese Title" };
    const result = renderTemplate("{title}.S{season}E{episode}.{ext}", ep, "mkv");
    expect(result).toBe("Chinese Title.S01E05.mkv");
  });

  test("falls back to 'Unknown' when all names null", () => {
    const ep = { ...baseEp, nameEn: null, nameZh: null, nameJp: null };
    const result = renderTemplate("{title} S{season}E{episode}.{ext}", ep, "mkv");
    expect(result).toBe("Unknown S01E05.mkv");
  });
});

// ─── buildRenamedName ───────────────────────────────────────────

describe("buildRenamedName", () => {
  test("parses and renames standard filename", () => {
    const result = buildRenamedName("[Lilith-Raws] Sousou no Frieren - 05 [Baha][WEB-DL][1080p][AVC AAC][CHT][MP4].mp4");
    expect(result).not.toBeNull();
    // Should contain S01E05 (season defaults to 1)
    expect(result!.name).toContain("E05");
    expect(result!.name).toEndWith(".mp4");
  });

  test("returns null for unparseable filename", () => {
    const result = buildRenamedName("random-text-no-episode-info.txt");
    expect(result).toBeNull();
  });

  test("handles filename with season info", () => {
    const result = buildRenamedName("[SubGroup] Title S02E10 [1080P].mkv");
    expect(result).not.toBeNull();
    expect(result!.name).toContain("S02");
    expect(result!.name).toContain("E10");
  });

  test("defaults season to 1 when not detected", () => {
    const result = buildRenamedName("[SubGroup] Some Anime - 03 [1080P].mkv");
    expect(result).not.toBeNull();
    expect(result!.name).toContain("S01");
    expect(result!.name).toContain("E03");
  });
});
