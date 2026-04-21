import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import { sql } from "drizzle-orm";
import { updateConfig, loadConfig } from "../../src/core/config/config.ts";
import { closeDb, getDb } from "../../src/core/db/connection.ts";
import { createRule } from "../../src/core/filter/rule-crud.ts";
import { createTaskRecord, getTasksByStatus, updateTaskStatus } from "../../src/core/pikpak/task-manager.ts";
import { replayStoredItems } from "../../src/core/pipeline.ts";
import { createSource } from "../../src/core/rss/source-crud.ts";
import { getReplayState, storeNewItems } from "../../src/core/rss/item-store.ts";
import { backfillDanmakuForRenamedTasks, getCachedDanmaku } from "../../src/core/danmaku/service.ts";

const TEST_CONFIG_PATH = "data/test-replay-recovery-config.json";

function initTestDb() {
  const db = getDb(":memory:");
  db.run(sql`CREATE TABLE IF NOT EXISTS rss_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    poll_interval_ms INTEGER NOT NULL DEFAULT 300000,
    bangumi_subject_id INTEGER,
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
    replay_status TEXT NOT NULL DEFAULT 'pending',
    decision_reason TEXT,
    linked_task_id INTEGER,
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
  db.run(sql`CREATE TABLE IF NOT EXISTS danmaku_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    anime_title TEXT NOT NULL,
    episode_title TEXT,
    pikpak_file_id TEXT,
    xml_file_id TEXT,
    downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS episode_delivery_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    normalized_title TEXT NOT NULL,
    season_number INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    cloud_path TEXT NOT NULL,
    video_status TEXT NOT NULL DEFAULT 'missing',
    video_file_name TEXT,
    video_file_id TEXT,
    video_verified_at TEXT,
    danmaku_status TEXT NOT NULL DEFAULT 'pending',
    danmaku_uploaded_at TEXT,
    danmaku_checked_at TEXT,
    xml_file_name TEXT,
    xml_file_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

function createMockPikPakClient(filesByParent: Record<string, Array<{ id: string; name: string; kind?: string; parent_id?: string; created_time?: string; modified_time?: string }>> = {}) {
  return {
    isAuthenticated: mock(() => true),
    ensurePath: mock(() => Promise.resolve("root-folder")),
    ensureFolder: mock((_parentId: string, name: string) => Promise.resolve(`folder:${name}`)),
    listFiles: mock((parentId: string) => Promise.resolve(
      (filesByParent[parentId] ?? []).map((file) => ({
        id: file.id,
        name: file.name,
        kind: file.kind ?? "drive#file",
        parent_id: file.parent_id ?? parentId,
        size: "100",
        created_time: file.created_time ?? "",
        modified_time: file.modified_time ?? "",
      }))
    )),
    offlineDownload: mock(() => Promise.resolve({
      task: { id: "task_001", file_id: "file_001" },
      file: { id: "file_001" },
    })),
    uploadSmallFile: mock(() => Promise.resolve({ id: "xml_001" })),
    deleteFile: mock(() => Promise.resolve(true)),
  } as any;
}

function createMockDdpClient() {
  return {
    isConfigured: () => true,
    searchEpisodes: mock(() => Promise.resolve([
      {
        episodeId: 2001001,
        animeId: 2001,
        animeTitle: "Recovery Anime",
        episodeTitle: "Episode 1",
        type: "tvseries",
        typeDescription: "TV",
        shift: 0,
      },
    ])),
    getComments: mock(() => Promise.resolve([
      {
        p: "1.2,1,25,16777215,1710000000,0,hash,1",
        m: "Recovered comment",
      },
    ])),
  } as any;
}

beforeEach(() => {
  mkdirSync("data", { recursive: true });
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  closeDb();
  initTestDb();
  loadConfig(TEST_CONFIG_PATH);
  updateConfig({
    pikpak: { cloudBasePath: "/Recovery" },
    rename: { enabled: false, method: "none" },
    dandanplay: { enabled: true, appId: "testId", appSecret: "testSecret" },
  });
});

afterEach(() => {
  closeDb();
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  mock.restore();
});

describe("Replay recovery verification", () => {
  test("uploads a stranded matching item and backfills same-folder XML after recovery", async () => {
    const source = createSource({ name: "Recovery Feed", url: "https://example.com/recovery.xml" });
    createRule({ name: "Recovery include", pattern: "Recovery", mode: "include", sourceId: source.id });

    const [storedItem] = storeNewItems(source.id, [
      {
        title: "[SubGroup] Recovery Anime - 01 [1080p]",
        guid: "recovery-guid-01",
        link: "https://example.com/recovery-01",
        magnetUrl: "magnet:?xt=urn:btih:recovery01",
        torrentUrl: null,
        homepage: null,
      },
    ]);

    const pikpak = createMockPikPakClient();
    const replay = await replayStoredItems(pikpak, { sourceId: source.id, trigger: "startup" });
    expect(replay.submitted).toBe(1);

    const [task] = getTasksByStatus("downloading");
    expect(task).toBeDefined();

    updateTaskStatus(task.id, "renamed", {
      pikpakFileId: task.pikpakFileId ?? "file_001",
      cloudPath: task.cloudPath ?? "root-folder",
      originalName: "[SubGroup] Recovery Anime - 01 [1080p].mkv",
      renamedName: "Recovery Anime S01E01.mkv",
    });

    const backfilled = await backfillDanmakuForRenamedTasks(pikpak, createMockDdpClient());

    expect(getReplayState(storedItem.id)).toMatchObject({ status: "submitted", linkedTaskId: task.id });
    expect(backfilled).toBe(1);
    expect(pikpak.uploadSmallFile).toHaveBeenCalledWith("root-folder", "Recovery Anime S01E01.xml", expect.any(String));
    expect(getCachedDanmaku()).toHaveLength(1);
  });

  test("skips a delivered episode when local state and PikPak cloud still agree", async () => {
    const source = createSource({ name: "Existing Feed", url: "https://example.com/existing.xml" });
    createRule({ name: "Existing include", pattern: "Existing", mode: "include", sourceId: source.id });

    const [storedItem] = storeNewItems(source.id, [
      {
        title: "[SubGroup] Existing Anime - 01 [1080p].mkv",
        guid: "existing-guid-01",
        link: "https://example.com/existing-01",
        magnetUrl: "magnet:?xt=urn:btih:existing01",
        torrentUrl: null,
        homepage: null,
      },
    ]);

    const db = getDb(":memory:");
    db.run(sql`INSERT INTO episode_delivery_state (
      normalized_title, season_number, episode_number, cloud_path,
      video_status, video_file_name, video_file_id, video_verified_at,
      danmaku_status, created_at, updated_at
    ) VALUES (
      'existinganime', 1, 1, 'root-folder',
      'delivered', '[SubGroup] Existing Anime - 01 [1080p].mkv', 'file_existing', datetime('now'),
      'pending', datetime('now'), datetime('now')
    )`);

    const pikpak = createMockPikPakClient({
      "root-folder": [
        { id: "file_existing", name: "[SubGroup] Existing Anime - 01 [1080p].mkv" },
      ],
    });

    const replay = await replayStoredItems(pikpak, { sourceId: source.id, trigger: "startup" });

    expect(replay.submitted).toBe(0);
    expect(pikpak.offlineDownload).not.toHaveBeenCalled();
    expect(getReplayState(storedItem.id)).toMatchObject({ status: "duplicate" });
  });

  test("fresh danmaku skips repeated search but stale danmaku refreshes on later pass", async () => {
    const db = getDb(":memory:");
    db.run(sql`INSERT INTO pikpak_tasks (
      rss_item_id, magnet_url, pikpak_task_id, pikpak_file_id,
      cloud_path, status, original_name, renamed_name, error_message,
      created_at, updated_at
    ) VALUES (
      NULL, 'magnet:?xt=urn:btih:refresh-recovery-01', 'task_refresh_01', 'file_refresh_01',
      'root-folder', 'renamed', '[SubGroup] Recovery Anime - 01 [1080p].mkv', 'Recovery Anime S01E01.mkv', NULL,
      datetime('now'), datetime('now')
    )`);
    db.run(sql`INSERT INTO episode_delivery_state (
      normalized_title, season_number, episode_number, cloud_path,
      video_status, video_file_name, video_file_id, video_verified_at,
      danmaku_status, danmaku_uploaded_at, danmaku_checked_at,
      xml_file_name, xml_file_id, created_at, updated_at
    ) VALUES (
      'recoveryanime', 1, 1, 'root-folder',
      'delivered', 'Recovery Anime S01E01.mkv', 'file_refresh_01', datetime('now'),
      'fresh', datetime('now'), datetime('now'),
      'Recovery Anime S01E01.xml', 'xml_existing_01', datetime('now'), datetime('now')
    )`);

    const pikpak = createMockPikPakClient({
      "root-folder": [
        { id: "xml_existing_01", name: "Recovery Anime S01E01.xml", modified_time: new Date().toISOString() },
      ],
    });
    const ddp = createMockDdpClient();

    const firstPass = await backfillDanmakuForRenamedTasks(pikpak, ddp);
    expect(firstPass).toBe(0);
    expect(ddp.searchEpisodes).not.toHaveBeenCalled();

    db.run(sql`UPDATE episode_delivery_state
      SET danmaku_uploaded_at = datetime('now', '-8 day'),
          danmaku_checked_at = datetime('now', '-8 day'),
          updated_at = datetime('now', '-8 day')
      WHERE normalized_title = 'recoveryanime'`);

    const stalePass = await backfillDanmakuForRenamedTasks(pikpak, ddp);
    expect(stalePass).toBe(1);
    expect(pikpak.deleteFile).toHaveBeenCalledWith("xml_existing_01");
    expect(ddp.searchEpisodes).toHaveBeenCalledTimes(1);
    expect(pikpak.uploadSmallFile).toHaveBeenCalledWith("root-folder", "Recovery Anime S01E01.xml", expect.any(String));
  });
});