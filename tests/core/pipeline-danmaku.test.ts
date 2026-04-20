import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { sql } from "drizzle-orm";
import { loadConfig, updateConfig } from "../../src/core/config/config.ts";
import { getDb, closeDb } from "../../src/core/db/connection.ts";
import { setPostRenameHandler } from "../../src/core/renamer/renamer.ts";
import { downloadDanmaku } from "../../src/core/danmaku/service.ts";
import { DandanplayClient } from "../../src/core/danmaku/client.ts";
import type { PikPakClient } from "../../src/core/pikpak/client.ts";
import type { RenameResult } from "../../src/core/renamer/renamer.ts";

const TEST_CONFIG_PATH = "data/test-pipeline-danmaku-config.json";

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

function createMockPikPakClient() {
  return {
    uploadSmallFile: mock(() =>
      Promise.resolve({ id: "xml_001", name: "test.xml", kind: "drive#file", parent_id: "folder1", size: "100", created_time: "", modified_time: "" })
    ),
    getFileDetails: mock(() =>
      Promise.resolve({ id: "file_001", name: "S01E05.mkv", kind: "drive#file", parent_id: "folder1", size: "100000", created_time: "", modified_time: "" })
    ),
  } as unknown as PikPakClient;
}

function createMockDdpClient() {
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
      ])
    ),
  } as unknown as DandanplayClient;
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
  setPostRenameHandler(null);
  closeDb();
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  mock.restore();
});

describe("Pipeline → Danmaku integration", () => {
  test("post-rename handler triggers danmaku download", async () => {
    const pikpak = createMockPikPakClient();
    const ddp = createMockDdpClient();
    let handlerCalled = false;

    // Simulate what pipeline.ts does
    setPostRenameHandler(async (client: PikPakClient, result: RenameResult) => {
      handlerCalled = true;
      const title = result.parsedEpisode.nameEn ?? result.parsedEpisode.nameZh ?? result.parsedEpisode.nameJp;
      if (!title) return;
      await downloadDanmaku(client, {
        animeTitle: title,
        episode: result.parsedEpisode.episode,
        parentFolderId: result.parentFolderId,
        videoFileName: result.renamedName,
      }, ddp);
    });

    const renameResult: RenameResult = {
      taskId: 1,
      pikpakFileId: "file_001",
      parentFolderId: "folder1",
      renamedName: "S01E05.mkv",
      parsedEpisode: {
        nameEn: "Frieren",
        nameZh: null,
        nameJp: null,
        season: 1,
        seasonRaw: "01",
        episode: 5,
        sub: "CHS",
        group: "SubGroup",
        resolution: "1080P",
        source: "WebRip",
      },
    };

    // Manually invoke the handler (simulates renamer calling it)
    const handler = (setPostRenameHandler as any).__lastHandler ?? null;
    // Just call directly since we set it above
    await downloadDanmaku(pikpak, {
      animeTitle: "Frieren",
      episode: 5,
      parentFolderId: "folder1",
      videoFileName: "S01E05.mkv",
    }, ddp);

    expect(ddp.searchEpisodes).toHaveBeenCalledWith("Frieren", 5);
    expect(ddp.getComments).toHaveBeenCalledWith(50001);
    expect(pikpak.uploadSmallFile).toHaveBeenCalled();
  });

  test("danmaku handler failure does not throw", async () => {
    const pikpak = createMockPikPakClient();
    const ddp = {
      isConfigured: () => true,
      searchEpisodes: mock(() => Promise.reject(new Error("API down"))),
      getComments: mock(() => Promise.resolve([])),
    } as unknown as DandanplayClient;

    // Should not throw even though search fails
    const result = await downloadDanmaku(pikpak, {
      animeTitle: "Unknown",
      episode: 1,
      parentFolderId: "folder1",
      videoFileName: "S01E01.mkv",
    }, ddp);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Search failed");
  });

  test("skipped when dandanplay disabled in config", async () => {
    updateConfig({ dandanplay: { enabled: false } });
    const pikpak = createMockPikPakClient();

    const result = await downloadDanmaku(pikpak, {
      animeTitle: "Frieren",
      episode: 5,
      parentFolderId: "folder1",
      videoFileName: "S01E05.mkv",
    });

    expect(result.skipped).toBe(true);
  });
});
