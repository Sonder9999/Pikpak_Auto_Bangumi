import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { eq, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { initBangumi } from "../../src/core/bangumi/client.ts";
import { loadConfig, updateConfig } from "../../src/core/config/config.ts";
import { getDb, closeDb } from "../../src/core/db/connection.ts";
import { createSource } from "../../src/core/rss/source-crud.ts";
import { storeNewItems } from "../../src/core/rss/item-store.ts";
import { createRule } from "../../src/core/filter/rule-crud.ts";
import { createTaskRecord, getTasksByStatus, updateTaskStatus } from "../../src/core/pikpak/task-manager.ts";

const TEST_CONFIG_PATH = "data/test-pipeline-replay-config.json";
const originalFetch = globalThis.fetch;

const episodeDeliveryStateTable = sqliteTable("episode_delivery_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  normalizedTitle: text("normalized_title").notNull(),
  seasonNumber: integer("season_number").notNull(),
  episodeNumber: integer("episode_number").notNull(),
  cloudPath: text("cloud_path").notNull(),
  videoStatus: text("video_status").notNull(),
  videoFileName: text("video_file_name"),
  videoFileId: text("video_file_id"),
  videoVerifiedAt: text("video_verified_at"),
  danmakuStatus: text("danmaku_status").notNull(),
  danmakuUploadedAt: text("danmaku_uploaded_at"),
  danmakuCheckedAt: text("danmaku_checked_at"),
  xmlFileName: text("xml_file_name"),
  xmlFileId: text("xml_file_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

function mockBangumiSubject(
  subjectId: number,
  subject: {
    name: string;
    name_cn?: string | null;
    date?: string | null;
    eps?: number | null;
  }
) {
  mockBangumiApi({
    subjects: {
      [subjectId]: subject,
    },
  });
}

function mockBangumiApi({
  subjects,
  relations = {},
}: {
  subjects: Record<number, { name: string; name_cn?: string | null; date?: string | null; eps?: number | null }>;
  relations?: Record<number, Array<{ id: number; type?: number | null; name: string; name_cn?: string | null; relation: string }>>;
}) {
  globalThis.fetch = mock(async (input) => {
    const url = String(input);

    for (const [rawSubjectId, payload] of Object.entries(relations)) {
      const subjectId = Number(rawSubjectId);
      if (url.includes(`/subjects/${subjectId}/subjects`)) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    for (const [rawSubjectId, payload] of Object.entries(subjects)) {
      const subjectId = Number(rawSubjectId);
      if (url.includes(`/subjects/${subjectId}`)) {
        return new Response(JSON.stringify({
          id: subjectId,
          name: payload.name,
          name_cn: payload.name_cn ?? null,
          date: payload.date ?? null,
          images: { large: "https://lain.bgm.tv/pic/cover/l/example.jpg" },
          rating: { score: 7.4, total: 1499 },
          tags: [],
          summary: "summary",
          eps: payload.eps ?? 12,
          url: `https://bgm.tv/subject/${subjectId}`,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    throw new Error(`Unexpected Bangumi request: ${url}`);
  }) as typeof fetch;
}

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
  return db;
}

function createMockPikPakClient(filesByParent: Record<string, Array<{ id: string; name: string; kind?: string; parent_id?: string }>> = {}) {
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
        created_time: "",
        modified_time: "",
      }))
    )),
    offlineDownload: mock(() => Promise.resolve({
      task: { id: "task_001", file_id: "file_001" },
      file: { id: "file_001" },
    })),
  } as any;
}

beforeEach(() => {
  mkdirSync("data", { recursive: true });
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  closeDb();
  initTestDb();
  loadConfig(TEST_CONFIG_PATH);
  updateConfig({
    pikpak: { cloudBasePath: "/Replay" },
    rename: { enabled: false, method: "none" },
    dandanplay: { enabled: false },
  });
  initBangumi("");
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  closeDb();
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("Pipeline replay regression coverage", () => {
  test("replays stored matching backlog items after recovery or restart", async () => {
    const source = createSource({ name: "Replay Feed", url: "https://example.com/rss" });
    createRule({ name: "1080 only", pattern: "1080", mode: "include", sourceId: source.id });

    const [storedItem] = storeNewItems(source.id, [
      {
        title: "[LoliHouse] Replay Anime - 01 [1080p]",
        guid: "replay-guid-01",
        link: "https://example.com/replay-01",
        magnetUrl: "magnet:?xt=urn:btih:replay01",
        torrentUrl: null,
        homepage: null,
      },
    ]);

    const pipelineModule = await import("../../src/core/pipeline.ts") as Record<string, any>;
    const itemStoreModule = await import("../../src/core/rss/item-store.ts") as Record<string, any>;
    const replayStoredItems = pipelineModule.replayStoredItems;

    expect(typeof replayStoredItems).toBe("function");
    if (typeof replayStoredItems !== "function") return;

    const result = await replayStoredItems(createMockPikPakClient(), { sourceId: source.id, trigger: "startup" });
    expect(result.submitted).toBe(1);
    expect(getTasksByStatus("downloading")).toHaveLength(1);

    const getReplayState = itemStoreModule.getReplayState;
    expect(typeof getReplayState).toBe("function");
    if (typeof getReplayState !== "function") return;

    expect(getReplayState(storedItem.id)).toMatchObject({ status: "submitted" });
  });

  test("source or rule changes re-queue filtered items for replay", async () => {
    const source = createSource({ name: "Rule Replay Feed", url: "https://example.com/rule-rss" });
    const [storedItem] = storeNewItems(source.id, [
      {
        title: "[SubGroup] Rule Replay Anime - 02 [1080p]",
        guid: "requeue-guid-02",
        link: "https://example.com/rule-02",
        magnetUrl: "magnet:?xt=urn:btih:requeue02",
        torrentUrl: null,
        homepage: null,
      },
    ]);

    const itemStoreModule = await import("../../src/core/rss/item-store.ts") as Record<string, any>;
    const updateReplayState = itemStoreModule.updateReplayState;
    const getReplayState = itemStoreModule.getReplayState;
    const requeueSourceItemsForReplay = itemStoreModule.requeueSourceItemsForReplay;

    expect(typeof updateReplayState).toBe("function");
    expect(typeof getReplayState).toBe("function");
    expect(typeof requeueSourceItemsForReplay).toBe("function");
    if (typeof updateReplayState !== "function" || typeof getReplayState !== "function" || typeof requeueSourceItemsForReplay !== "function") return;

    updateReplayState(storedItem.id, "filtered", { decisionReason: "old include rule mismatch" });
    createRule({ name: "New 1080 rule", pattern: "1080", mode: "include", sourceId: source.id });

    const requeued = requeueSourceItemsForReplay(source.id, { reason: "rule-updated" });
    expect(requeued).toBeGreaterThan(0);
    expect(getReplayState(storedItem.id)).toMatchObject({ status: "pending" });
  });

  test("duplicate replay decisions are persisted locally instead of leaving backlog ambiguous", async () => {
    const source = createSource({ name: "Duplicate Feed", url: "https://example.com/duplicate-rss" });
    createRule({ name: "Match duplicate", pattern: "Duplicate", mode: "include", sourceId: source.id });

    const [storedItem] = storeNewItems(source.id, [
      {
        title: "[LoliHouse] Duplicate Anime - 01 [1080p]",
        guid: "duplicate-guid-01",
        link: "https://example.com/duplicate-01",
        magnetUrl: "magnet:?xt=urn:btih:duplicate01",
        torrentUrl: null,
        homepage: null,
      },
    ]);

    const existingTask = createTaskRecord(null, "magnet:?xt=urn:btih:duplicate01", storedItem.title);
    updateTaskStatus(existingTask.id, "renamed", { renamedName: "Duplicate Anime S01E01.mkv" });

    const pipelineModule = await import("../../src/core/pipeline.ts") as Record<string, any>;
    const itemStoreModule = await import("../../src/core/rss/item-store.ts") as Record<string, any>;
    const replayStoredItems = pipelineModule.replayStoredItems;
    const getReplayState = itemStoreModule.getReplayState;

    expect(typeof replayStoredItems).toBe("function");
    expect(typeof getReplayState).toBe("function");
    if (typeof replayStoredItems !== "function" || typeof getReplayState !== "function") return;

    const result = await replayStoredItems(createMockPikPakClient(), { sourceId: source.id, trigger: "startup" });
    expect(result.duplicates).toBe(1);
    expect(getTasksByStatus("downloading")).toHaveLength(0);
    expect(getReplayState(storedItem.id)).toMatchObject({ status: "duplicate", linkedTaskId: existingTask.id });
  });

  test("skips submission when a delivered episode flag still matches cloud state", async () => {
    const source = createSource({ name: "Cloud Flag Feed", url: "https://example.com/cloud-flag" });
    createRule({ name: "Match cloud flag", pattern: "Delivery", mode: "include", sourceId: source.id });

    const [storedItem] = storeNewItems(source.id, [
      {
        title: "[SubGroup] Delivery Anime - 01 [1080p].mkv",
        guid: "cloud-flag-guid-01",
        link: "https://example.com/cloud-flag-01",
        magnetUrl: "magnet:?xt=urn:btih:cloudflag01",
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
      'deliveryanime', 1, 1, 'root-folder',
      'delivered', '[SubGroup] Delivery Anime - 01 [1080p].mkv', 'file_existing', datetime('now'),
      'pending', datetime('now'), datetime('now')
    )`);

    const pipelineModule = await import("../../src/core/pipeline.ts") as Record<string, any>;
    const itemStoreModule = await import("../../src/core/rss/item-store.ts") as Record<string, any>;
    const replayStoredItems = pipelineModule.replayStoredItems;
    const getReplayState = itemStoreModule.getReplayState;

    expect(typeof replayStoredItems).toBe("function");
    expect(typeof getReplayState).toBe("function");
    if (typeof replayStoredItems !== "function" || typeof getReplayState !== "function") return;

    const pikpak = createMockPikPakClient({
      "root-folder": [
        { id: "file_existing", name: "[SubGroup] Delivery Anime - 01 [1080p].mkv" },
      ],
    });

    const result = await replayStoredItems(pikpak, { sourceId: source.id, trigger: "startup" });
    expect(result.submitted).toBe(0);
    expect(pikpak.offlineDownload).not.toHaveBeenCalled();
    expect(getTasksByStatus("downloading")).toHaveLength(0);
    expect(getReplayState(storedItem.id)).toMatchObject({ status: "duplicate" });
  });

  test("re-pushes when a delivered episode flag no longer matches cloud state", async () => {
    const source = createSource({ name: "Cloud Drift Feed", url: "https://example.com/cloud-drift" });
    createRule({ name: "Match drift", pattern: "Drift", mode: "include", sourceId: source.id });

    storeNewItems(source.id, [
      {
        title: "[SubGroup] Drift Anime - 01 [1080p].mkv",
        guid: "cloud-drift-guid-01",
        link: "https://example.com/cloud-drift-01",
        magnetUrl: "magnet:?xt=urn:btih:clouddrift01",
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
      'driftanime', 1, 1, 'root-folder',
      'delivered', 'Drift Anime S01E01.mkv', 'file_missing', datetime('now'),
      'pending', datetime('now'), datetime('now')
    )`);

    const pipelineModule = await import("../../src/core/pipeline.ts") as Record<string, any>;
    const replayStoredItems = pipelineModule.replayStoredItems;

    expect(typeof replayStoredItems).toBe("function");
    if (typeof replayStoredItems !== "function") return;

    const pikpak = createMockPikPakClient();
    const result = await replayStoredItems(pikpak, { sourceId: source.id, trigger: "startup" });
    expect(result.submitted).toBe(1);
    expect(pikpak.offlineDownload).toHaveBeenCalledTimes(1);

    const state = db
      .select({ videoStatus: episodeDeliveryStateTable.videoStatus })
      .from(episodeDeliveryStateTable)
      .where(eq(episodeDeliveryStateTable.normalizedTitle, "driftanime"))
      .get();
    expect(state?.videoStatus).toBe("missing");
  });

  test("same-folder raw release names seed delivery state and block duplicate submission", async () => {
    updateConfig({
      rename: {
        enabled: true,
        method: "pn",
        template: "{title} S{season}E{episode}.{ext}",
        folderPattern: "{title}/Season {season}",
      },
    });

    const source = createSource({ name: "Seed From Cloud Feed", url: "https://example.com/seed-cloud" });
    createRule({ name: "Match seed", pattern: "Seed", mode: "include", sourceId: source.id });

    storeNewItems(source.id, [
      {
        title: "[LoliHouse] Seed Anime - 01 [1080p].mkv",
        guid: "seed-cloud-guid-01",
        link: "https://example.com/seed-cloud-01",
        magnetUrl: "magnet:?xt=urn:btih:seedcloud01",
        torrentUrl: null,
        homepage: null,
      },
    ]);

    const pipelineModule = await import("../../src/core/pipeline.ts") as Record<string, any>;
    const replayStoredItems = pipelineModule.replayStoredItems;

    expect(typeof replayStoredItems).toBe("function");
    if (typeof replayStoredItems !== "function") return;

    const pikpak = createMockPikPakClient({
      "folder:Season 01": [
        { id: "raw_existing", name: "[LoliHouse] Seed Anime - 01 [1080p].mkv" },
      ],
    });

    const result = await replayStoredItems(pikpak, { sourceId: source.id, trigger: "startup" });
    expect(result.submitted).toBe(0);
    expect(pikpak.offlineDownload).not.toHaveBeenCalled();

    const db = getDb(":memory:");
    const seeded = db
      .select({
        normalizedTitle: episodeDeliveryStateTable.normalizedTitle,
        seasonNumber: episodeDeliveryStateTable.seasonNumber,
        episodeNumber: episodeDeliveryStateTable.episodeNumber,
        videoStatus: episodeDeliveryStateTable.videoStatus,
      })
      .from(episodeDeliveryStateTable)
      .where(eq(episodeDeliveryStateTable.normalizedTitle, "seedanime"))
      .get();
    expect(seeded).toMatchObject({ normalizedTitle: "seedanime", seasonNumber: 1, episodeNumber: 1, videoStatus: "delivered" });
  });

  test("bound sequel uses season 2 folder and duplicate identity even when raw title uses bare numeral", async () => {
    updateConfig({
      bangumi: { token: "bangumi-token" },
      rename: {
        enabled: true,
        method: "advance",
        template: "{title} S{season}E{episode}.{ext}",
        folderPattern: "{title} ({year})/Season {season}",
      },
    });
    initBangumi("bangumi-token");
    mockBangumiSubject(200001, {
      name: "Otonari no Tenshi-sama 2",
      name_cn: "关于邻家的天使大人不知不觉把我惯成了废人这档子事 第二季",
      date: "2026-01-10",
    });

    const source = createSource({
      name: "Bound Sequel Feed",
      url: "https://example.com/otonari-rss",
      bangumiSubjectId: 200001,
    });
    createRule({ name: "Match sequel", pattern: "Otonari", mode: "include", sourceId: source.id });

    storeNewItems(source.id, [
      {
        title: "[Dynamis One] Otonari no Tenshi-sama 2 - 01 (CR 1920x1080 AVC AAC MKV) [0512B487].mkv",
        guid: "otonari-guid-01",
        link: "https://example.com/otonari-01",
        magnetUrl: "magnet:?xt=urn:btih:otonari01",
        torrentUrl: null,
        homepage: null,
      },
    ]);

    const pipelineModule = await import("../../src/core/pipeline.ts") as Record<string, any>;
    const replayStoredItems = pipelineModule.replayStoredItems;

    expect(typeof replayStoredItems).toBe("function");
    if (typeof replayStoredItems !== "function") return;

    const pikpak = createMockPikPakClient({
      "folder:Season 02": [
        {
          id: "existing_otonari_s02e01",
          name: "关于邻家的天使大人不知不觉把我惯成了废人这档子事 第二季 S02E01.mkv",
        },
      ],
    });

    const result = await replayStoredItems(pikpak, { sourceId: source.id, trigger: "startup" });
    const folderNames = pikpak.ensureFolder.mock.calls.map((call: [string, string]) => call[1]);

    expect(folderNames).toContain("Season 02");
    expect(result.submitted).toBe(0);
    expect(pikpak.offlineDownload).not.toHaveBeenCalled();
  });

  test("bound cumulative numbering uses season-local duplicate identity when Bangumi prequel chain is reliable", async () => {
    updateConfig({
      bangumi: { token: "bangumi-token" },
      rename: {
        enabled: true,
        method: "advance",
        template: "{title} S{season}E{episode}.{ext}",
        folderPattern: "{title} ({year})/Season {season}",
      },
    });
    initBangumi("bangumi-token");
    mockBangumiApi({
      subjects: {
        200006: {
          name: "Himesama Goumon no Jikan desu 2nd Season",
          date: "2026-01-10",
          eps: 12,
        },
        200007: {
          name: "Himesama Goumon no Jikan desu",
          date: "2024-01-10",
          eps: 12,
        },
      },
      relations: {
        200006: [
          {
            id: 200007,
            type: 2,
            name: "Himesama Goumon no Jikan desu",
            relation: "前传",
          },
        ],
        200007: [],
      },
    });

    const source = createSource({
      name: "Bound Cumulative Feed",
      url: "https://example.com/himesama-rss",
      bangumiSubjectId: 200006,
    });
    createRule({ name: "Match cumulative", pattern: "Himesama", mode: "include", sourceId: source.id });

    storeNewItems(source.id, [
      {
        title: "[Dynamis One] Himesama _Goumon_ no Jikan desu 2nd Season - 17 (CR 1920x1080 AVC AAC MKV) [6C2F2AAC].mkv",
        guid: "himesama-guid-17",
        link: "https://example.com/himesama-17",
        magnetUrl: "magnet:?xt=urn:btih:himesama17",
        torrentUrl: null,
        homepage: null,
      },
    ]);

    const pipelineModule = await import("../../src/core/pipeline.ts") as Record<string, any>;
    const replayStoredItems = pipelineModule.replayStoredItems;

    expect(typeof replayStoredItems).toBe("function");
    if (typeof replayStoredItems !== "function") return;

    const pikpak = createMockPikPakClient({
      "folder:Season 02": [
        {
          id: "existing_himesama_s02e05",
          name: "Himesama Goumon no Jikan desu 2nd Season S02E05.mkv",
        },
      ],
    });

    const result = await replayStoredItems(pikpak, { sourceId: source.id, trigger: "startup" });
    const folderNames = pikpak.ensureFolder.mock.calls.map((call: [string, string]) => call[1]);

    expect(folderNames).toContain("Season 02");
    expect(result.submitted).toBe(0);
    expect(pikpak.offlineDownload).not.toHaveBeenCalled();
  });

  test("replay does not query Bangumi when a source only has Mikan identity", async () => {
    updateConfig({
      bangumi: { token: "bangumi-token" },
      rename: {
        enabled: true,
        method: "advance",
        template: "{title} S{season}E{episode}.{ext}",
        folderPattern: "{title}/Season {season}",
      },
    });
    initBangumi("bangumi-token");

    globalThis.fetch = mock(() => {
      throw new Error("Bangumi subject lookup should be skipped for Mikan-only sources");
    }) as typeof fetch;

    const source = createSource({
      name: "Mikan Only Feed",
      url: "https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370",
      mikanBangumiId: 3928,
      bangumiSubjectId: null,
    });
    createRule({ name: "Match mikan only", pattern: "Kuroneko", mode: "include", sourceId: source.id });

    storeNewItems(source.id, [
      {
        title: "[LoliHouse] Kuroneko to Majo no Kyoushitsu - 01 [1080p].mkv",
        guid: "mikan-only-guid-01",
        link: "https://example.com/mikan-only-01",
        magnetUrl: "magnet:?xt=urn:btih:mikanonly01",
        torrentUrl: null,
        homepage: null,
      },
    ]);

    const pipelineModule = await import("../../src/core/pipeline.ts") as Record<string, any>;
    const replayStoredItems = pipelineModule.replayStoredItems;

    expect(typeof replayStoredItems).toBe("function");
    if (typeof replayStoredItems !== "function") return;

    const pikpak = createMockPikPakClient();
    const result = await replayStoredItems(pikpak, { sourceId: source.id, trigger: "startup" });

    expect(result.submitted).toBe(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(pikpak.offlineDownload).toHaveBeenCalledTimes(1);
  });
});