import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { sql } from "drizzle-orm";
import { loadConfig, updateConfig } from "../../src/core/config/config.ts";
import { getDb, closeDb } from "../../src/core/db/connection.ts";
import { getCachedDanmaku } from "../../src/core/danmaku/service.ts";
import { danmakuCache } from "../../src/core/db/schema.ts";

const TEST_CONFIG_PATH = "data/test-danmaku-api-config.json";

function initTestDb() {
  const db = getDb(":memory:");
  db.run(sql`CREATE TABLE IF NOT EXISTS danmaku_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    anime_title TEXT NOT NULL,
    episode_title TEXT,
    pikpak_file_id TEXT,
    xml_file_id TEXT,
    downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db;
}

beforeEach(() => {
  mkdirSync("data", { recursive: true });
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  closeDb();
  initTestDb();
  loadConfig(TEST_CONFIG_PATH);
  updateConfig({ dandanplay: { enabled: true, appId: "testId", appSecret: "testSecret" } });
});

afterEach(() => {
  closeDb();
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  mock.restore();
});

describe("Danmaku API: GET /api/danmaku/status", () => {
  test("returns empty array when no cache records", () => {
    const records = getCachedDanmaku();
    expect(records).toEqual([]);
  });

  test("returns cached records after insertion", () => {
    const db = getDb();
    db.insert(danmakuCache).values({
      episodeId: 50001,
      animeTitle: "Frieren",
      episodeTitle: "Episode 5",
      pikpakFileId: null,
      xmlFileId: "xml_001",
    }).run();

    const records = getCachedDanmaku();
    expect(records.length).toBe(1);
    expect(records[0].episodeId).toBe(50001);
    expect(records[0].animeTitle).toBe("Frieren");
    expect(records[0].xmlFileId).toBe("xml_001");
  });

  test("returns multiple cached records", () => {
    const db = getDb();
    db.insert(danmakuCache).values([
      { episodeId: 50001, animeTitle: "Frieren", episodeTitle: "Ep 5", pikpakFileId: null, xmlFileId: "xml_001" },
      { episodeId: 50002, animeTitle: "Frieren", episodeTitle: "Ep 6", pikpakFileId: null, xmlFileId: "xml_002" },
    ]).run();

    const records = getCachedDanmaku();
    expect(records.length).toBe(2);
  });
});
