import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { sql } from "drizzle-orm";
import { loadConfig, updateConfig } from "../../src/core/config/config.ts";
import { getDb, closeDb } from "../../src/core/db/connection.ts";
import { downloadDanmaku, getCachedDanmaku } from "../../src/core/danmaku/service.ts";
import { DandanplayClient } from "../../src/core/danmaku/client.ts";

const TEST_CONFIG_PATH = "data/test-danmaku-svc-config.json";

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

// Minimal mock PikPak client
function createMockPikPakClient() {
  return {
    uploadSmallFile: mock(() => Promise.resolve({ id: "xml_file_001", name: "test.xml", kind: "drive#file", parent_id: "folder1", size: "100", created_time: "", modified_time: "" })),
  } as any;
}

// Minimal mock DanDanPlay client
function createMockDdpClient(overrides?: Partial<DandanplayClient>) {
  return {
    isConfigured: () => true,
    searchEpisodes: mock(() =>
      Promise.resolve([
        {
          episodeId: 50001,
          animeId: 100,
          animeTitle: "Sousou no Frieren",
          episodeTitle: "Episode 5",
          type: "tvseries",
          typeDescription: "TV",
          shift: 0,
        },
      ])
    ),
    getComments: mock(() =>
      Promise.resolve([
        { cid: 1, p: "10.0,1,16777215,user1", m: "Hello" },
        { cid: 2, p: "20.0,1,255,user2", m: "World" },
      ])
    ),
    ...overrides,
  } as unknown as DandanplayClient;
}

beforeEach(() => {
  mkdirSync("data", { recursive: true });
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  closeDb();
  initTestDb();
  const db = getDb(":memory:");
  db.run(sql`CREATE TABLE IF NOT EXISTS pikpak_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rss_item_id INTEGER,
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
  loadConfig(TEST_CONFIG_PATH);
  updateConfig({ dandanplay: { enabled: true, appId: "testId", appSecret: "testSecret" } });
});

afterEach(() => {
  closeDb();
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  mock.restore();
});

describe("downloadDanmaku", () => {
  test("full flow: search → comments → XML → upload → cache", async () => {
    const pikpak = createMockPikPakClient();
    const ddp = createMockDdpClient();

    const result = await downloadDanmaku(pikpak, {
      animeTitle: "Frieren",
      episode: 5,
      parentFolderId: "folder1",
      videoFileName: "S01E05.mkv",
    }, ddp);

    expect(result.success).toBe(true);
    expect(result.episodeId).toBe(50001);
    expect(result.xmlFileId).toBe("xml_file_001");

    // Verify cache was written
    const cached = getCachedDanmaku();
    expect(cached.length).toBe(1);
    expect(cached[0].episodeId).toBe(50001);
    expect(cached[0].animeTitle).toBe("Sousou no Frieren");
  });

  test("skips when dandanplay disabled", async () => {
    updateConfig({ dandanplay: { enabled: false } });
    const pikpak = createMockPikPakClient();

    const result = await downloadDanmaku(pikpak, {
      animeTitle: "Frieren",
      episode: 5,
      parentFolderId: "folder1",
      videoFileName: "S01E05.mkv",
    });

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
  });

  test("skips when not configured", async () => {
    const pikpak = createMockPikPakClient();
    const ddp = createMockDdpClient({ isConfigured: () => false } as any);

    const result = await downloadDanmaku(pikpak, {
      animeTitle: "Frieren",
      episode: 5,
      parentFolderId: "folder1",
      videoFileName: "S01E05.mkv",
    }, ddp);

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
  });

  test("cache hit skips API calls", async () => {
    const pikpak = createMockPikPakClient();
    const ddp = createMockDdpClient();

    // First download
    await downloadDanmaku(pikpak, {
      animeTitle: "Frieren",
      episode: 5,
      parentFolderId: "folder1",
      videoFileName: "S01E05.mkv",
    }, ddp);

    // Second download should be cached
    const result = await downloadDanmaku(pikpak, {
      animeTitle: "Frieren",
      episode: 5,
      parentFolderId: "folder1",
      videoFileName: "S01E05.mkv",
    }, ddp);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.episodeId).toBe(50001);

    // searchEpisodes still called (to get episodeId), but getComments only once
    expect(ddp.getComments).toHaveBeenCalledTimes(1);
  });

  test("handles search failure gracefully", async () => {
    const pikpak = createMockPikPakClient();
    const ddp = createMockDdpClient({
      searchEpisodes: mock(() => Promise.reject(new Error("Network timeout"))) as any,
    } as any);

    const result = await downloadDanmaku(pikpak, {
      animeTitle: "Unknown",
      episode: 1,
      parentFolderId: "folder1",
      videoFileName: "S01E01.mkv",
    }, ddp);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Search failed");
  });

  test("handles no matching episodes", async () => {
    const pikpak = createMockPikPakClient();
    const ddp = createMockDdpClient({
      searchEpisodes: mock(() => Promise.resolve([])) as any,
    } as any);

    const result = await downloadDanmaku(pikpak, {
      animeTitle: "NonExistent",
      episode: 99,
      parentFolderId: "folder1",
      videoFileName: "S01E99.mkv",
    }, ddp);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No matching episodes");
  });

  test("handles upload failure gracefully", async () => {
    const pikpak = createMockPikPakClient();
    pikpak.uploadSmallFile = mock(() => Promise.reject(new Error("Upload quota exceeded")));
    const ddp = createMockDdpClient();

    const result = await downloadDanmaku(pikpak, {
      animeTitle: "Frieren",
      episode: 5,
      parentFolderId: "folder1",
      videoFileName: "S01E05.mkv",
    }, ddp);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Upload failed");
  });

  test("XML filename matches video with .xml extension", async () => {
    const pikpak = createMockPikPakClient();
    const ddp = createMockDdpClient();

    await downloadDanmaku(pikpak, {
      animeTitle: "Frieren",
      episode: 5,
      parentFolderId: "folder1",
      videoFileName: "S01E05.mkv",
    }, ddp);

    // Check that upload was called with .xml filename
    expect(pikpak.uploadSmallFile).toHaveBeenCalledWith("folder1", "S01E05.xml", expect.any(String));
  });

  test("backfills XML for renamed tasks that are missing successful danmaku cache", async () => {
    const db = getDb(":memory:");
    db.run(sql`INSERT INTO pikpak_tasks (
      rss_item_id, magnet_url, pikpak_task_id, pikpak_file_id,
      cloud_path, status, original_name, renamed_name, error_message,
      created_at, updated_at
    ) VALUES (
      NULL, 'magnet:?xt=urn:btih:backfill01', 'task_001', 'file_001',
      'folder1', 'renamed', '[LoliHouse] 黑猫与魔女的教室 - 01 [1080p].mkv', '黑猫与魔女的教室 S01E01.mkv', NULL,
      datetime('now'), datetime('now')
    )`);

    const pikpak = createMockPikPakClient();
    const ddp = createMockDdpClient({
      searchEpisodes: mock(() => Promise.resolve([
        {
          episodeId: 195160001,
          animeId: 195160,
          animeTitle: "黑猫与魔女的教室",
          episodeTitle: "第1话 黑猫与丝碧卡",
          type: "tvseries",
          typeDescription: "TV",
          shift: 0,
        },
      ])) as any,
    } as any);

    const danmakuModule = await import("../../src/core/danmaku/service.ts") as Record<string, any>;
    const backfillDanmakuForRenamedTasks = danmakuModule.backfillDanmakuForRenamedTasks;

    expect(typeof backfillDanmakuForRenamedTasks).toBe("function");
    if (typeof backfillDanmakuForRenamedTasks !== "function") return;

    const backfilled = await backfillDanmakuForRenamedTasks(pikpak, ddp);
    expect(backfilled).toBe(1);
    expect(pikpak.uploadSmallFile).toHaveBeenCalledWith("folder1", "黑猫与魔女的教室 S01E01.xml", expect.any(String));
    expect(getCachedDanmaku()).toHaveLength(1);
  });
});
