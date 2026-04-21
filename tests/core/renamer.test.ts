import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { sql } from "drizzle-orm";
import { buildRenamedName, renderTemplate } from "../../src/core/renamer/renamer.ts";
import { loadConfig, updateConfig } from "../../src/core/config/config.ts";
import { getDb, closeDb } from "../../src/core/db/connection.ts";
import { initBangumi } from "../../src/core/bangumi/client.ts";
import type { Episode } from "../../src/core/parser/types.ts";

const TEST_CONFIG_PATH = "data/test-renamer-config.json";
const originalFetch = globalThis.fetch;

function initTestDb() {
  const db = getDb(":memory:");
  db.run(sql`CREATE TABLE IF NOT EXISTS rss_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    poll_interval_ms INTEGER NOT NULL DEFAULT 300000,
    bangumi_subject_id INTEGER,
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
  initBangumi("");
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  closeDb();
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  globalThis.fetch = originalFetch;
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
  test("parses and renames standard filename", async () => {
    const result = await buildRenamedName("[Lilith-Raws] Sousou no Frieren - 05 [Baha][WEB-DL][1080p][AVC AAC][CHT][MP4].mp4");
    expect(result).not.toBeNull();
    expect(result!.name).toContain("E05");
    expect(result!.name).toEndWith(".mp4");
  });

  test("returns null for unparseable filename", async () => {
    const result = await buildRenamedName("random-text-no-episode-info.txt");
    expect(result).toBeNull();
  });

  test("handles filename with season info", async () => {
    const result = await buildRenamedName("[SubGroup] Title S02E10 [1080P].mkv");
    expect(result).not.toBeNull();
    expect(result!.name).toContain("S02");
    expect(result!.name).toContain("E10");
  });

  test("defaults season to 1 when not detected", async () => {
    const result = await buildRenamedName("[SubGroup] Some Anime - 03 [1080P].mkv");
    expect(result).not.toBeNull();
    expect(result!.name).toContain("S01");
    expect(result!.name).toContain("E03");
  });

  test("prefers Bangumi metadata over TMDB when bound subject id is provided", async () => {
    initBangumi("bangumi-token");
    updateConfig({ bangumi: { token: "bangumi-token" } });

    globalThis.fetch = (async (input) => {
      expect(String(input)).toContain("/subjects/576351");

      return new Response(JSON.stringify({
        id: 576351,
        name: "Kuroneko to Majo no Kyoushitsu",
        name_cn: "黑猫与魔女的教室",
        date: "2026-04-12",
        images: { large: "https://lain.bgm.tv/pic/cover/l/example.jpg" },
        rating: { score: 7.4, total: 1499 },
        tags: [],
        summary: "summary",
        eps: 12,
        url: "https://bgm.tv/subject/576351",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await buildRenamedName(
      "[SubGroup] Kuroneko to Majo no Kyoushitsu - 02 [1080P].mkv",
      { bangumiSubjectId: 576351 }
    );

    expect(result).not.toBeNull();
    expect(result!.name).toContain("黑猫与魔女的教室");
    expect(result!.episode.year).toBe("2026");
  });
});
