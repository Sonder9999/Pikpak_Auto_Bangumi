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
  globalThis.fetch = (async (input) => {
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

    mockBangumiSubject(576351, {
      name: "Kuroneko to Majo no Kyoushitsu",
      name_cn: "黑猫与魔女的教室",
      date: "2026-04-12",
    });

    const result = await buildRenamedName(
      "[SubGroup] Kuroneko to Majo no Kyoushitsu - 02 [1080P].mkv",
      { bangumiSubjectId: 576351 }
    );

    expect(result).not.toBeNull();
    expect(result!.name).toContain("黑猫与魔女的教室");
    expect(result!.episode.year).toBe("2026");
  });

  test("bound bare numeral sequel keeps canonical season for downstream consumers", async () => {
    initBangumi("bangumi-token");
    updateConfig({ bangumi: { token: "bangumi-token" } });
    mockBangumiSubject(200001, {
      name: "Otonari no Tenshi-sama 2",
      name_cn: "关于邻家的天使大人不知不觉把我惯成了废人这档子事 第二季",
      date: "2026-01-10",
    });

    const result = await buildRenamedName(
      "[Dynamis One] Otonari no Tenshi-sama 2 - 01 (CR 1920x1080 AVC AAC MKV) [0512B487].mkv",
      { bangumiSubjectId: 200001 }
    );

    expect(result).not.toBeNull();
    expect(result!.episode.season).toBe(2);
    expect(result!.name).toContain("S02E01");
  });

  test("bound ordinal english season title exposes season to rename and danmaku consumers", async () => {
    initBangumi("bangumi-token");
    updateConfig({ bangumi: { token: "bangumi-token" } });
    mockBangumiSubject(200004, {
      name: "Mairimashita! Iruma-kun 4th Season",
      name_cn: "入间同学入魔了 第四季",
      date: "2026-10-03",
    });

    const result = await buildRenamedName(
      "[Dynamis One] Mairimashita! Iruma-kun 4th Season - 02 (CR 1920x1080 AVC AAC MKV) [827D2187].mkv",
      { bangumiSubjectId: 200004 }
    );

    expect(result).not.toBeNull();
    expect(result!.episode.season).toBe(4);
    expect(result!.name).toContain("S04E02");
  });

  test("bound Bangumi subject overrides contradictory raw season cue", async () => {
    initBangumi("bangumi-token");
    updateConfig({ bangumi: { token: "bangumi-token" } });
    mockBangumiSubject(200005, {
      name: "Example Anime 2nd Season",
      name_cn: "示例动画 第二季",
      date: "2026-07-01",
    });

    const result = await buildRenamedName(
      "[SubGroup] Example Anime S01E03 [1080P].mkv",
      { bangumiSubjectId: 200005 }
    );

    expect(result).not.toBeNull();
    expect(result!.episode.season).toBe(2);
    expect(result!.name).toContain("S02E03");
  });

  test("bound cumulative numbering normalizes to season-local episode when Bangumi prequel chain is unambiguous", async () => {
    initBangumi("bangumi-token");
    updateConfig({ bangumi: { token: "bangumi-token" } });
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

    const result = await buildRenamedName(
      "[Dynamis One] Himesama _Goumon_ no Jikan desu 2nd Season - 17 (CR 1920x1080 AVC AAC MKV) [6C2F2AAC].mkv",
      { bangumiSubjectId: 200006 }
    );

    expect(result).not.toBeNull();
    expect(result!.episode.season).toBe(2);
    expect(result!.episode.episode).toBe(5);
    expect(result!.name).toContain("S02E05");
  });
});
