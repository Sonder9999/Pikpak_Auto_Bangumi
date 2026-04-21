import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../../src/core/db/connection.ts";
import { getRulesBySourceId } from "../../src/core/filter/rule-crud.ts";
import { importQbitRuleFiles } from "../../src/core/rss/qbit-rule-import.ts";
import { createSource, getAllSources } from "../../src/core/rss/source-crud.ts";

const TEST_DB = ":memory:";
const bangumiFixture = readFileSync("tests/fixtures/mikan-bangumi.fixture.html", "utf-8");
let originalFetch: typeof globalThis.fetch;
let tempDir: string;

function initTestDb() {
  const db = getDb(TEST_DB);

  db.run(sql`CREATE TABLE IF NOT EXISTS rss_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    poll_interval_ms INTEGER NOT NULL DEFAULT 300000,
    bangumi_subject_id INTEGER,
    mikan_bangumi_id INTEGER,
    last_success_at TEXT,
    last_error_at TEXT,
    last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS filter_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    mode TEXT NOT NULL,
    source_id INTEGER REFERENCES rss_sources(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

function writeQbitJson(fileName: string, mustContain: string, mustNotContain = "") {
  const filePath = join(tempDir, fileName);
  const payload = {
    "黑猫与魔女的教室": {
      affectedFeeds: ["https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370"],
      enabled: true,
      mustContain,
      mustNotContain,
    },
  };

  writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

beforeEach(() => {
  closeDb();
  initTestDb();
  tempDir = mkdtempSync(join(tmpdir(), "pikpak-qbit-import-"));
  originalFetch = globalThis.fetch;
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(bangumiFixture, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }))
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("qBit rule import", () => {
  test("imports a new qBit JSON entry into sources and rules", async () => {
    const filePath = writeQbitJson("spring.json", "1080p", "720p");

    const summary = await importQbitRuleFiles([filePath]);

    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(0);
    expect(summary.failed).toBe(0);

    const sources = getAllSources();
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      name: "Manual RSS - 576351",
      bangumiSubjectId: 576351,
      mikanBangumiId: 3928,
    });

    const rules = getRulesBySourceId(sources[0]!.id);
    expect(rules).toHaveLength(2);
    expect(rules.find((rule) => rule.mode === "include")?.pattern).toBe("1080p");
    expect(rules.find((rule) => rule.mode === "exclude")?.pattern).toBe("720p");
  });

  test("reimport updates the existing source and rules instead of creating duplicates", async () => {
    const filePath = writeQbitJson("spring.json", "1080p");
    await importQbitRuleFiles([filePath]);

    writeQbitJson("spring.json", "2160p");
    const summary = await importQbitRuleFiles([filePath]);

    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(1);
    expect(getAllSources()).toHaveLength(1);
    expect(getRulesBySourceId(getAllSources()[0]!.id).find((rule) => rule.mode === "include")?.pattern).toBe("2160p");
  });

  test("reports duplicate matches and prefers the source with resolved Bangumi identity", async () => {
    const rssUrl = "https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370";
    const legacySource = createSource({
      name: "Kuroneko",
      url: rssUrl,
      enabled: true,
    });
    const correctSource = createSource({
      name: "Manual RSS - 576351",
      url: rssUrl,
      enabled: true,
      bangumiSubjectId: 576351,
      mikanBangumiId: 3928,
    });

    const filePath = writeQbitJson("spring.json", "1080p");
    const summary = await importQbitRuleFiles([filePath]);

    expect(summary.updated).toBe(1);
    expect(summary.duplicates).toBe(1);
    expect(summary.results[0]?.sourceId).toBe(correctSource.id);
    expect(getRulesBySourceId(correctSource.id).find((rule) => rule.mode === "include")?.pattern).toBe("1080p");
    expect(getRulesBySourceId(legacySource.id)).toHaveLength(0);
  });

  test("fails when the Mikan page does not expose a Bangumi subject link", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(
        bangumiFixture.replace("https://bgm.tv/subject/576351", "https://example.com/no-subject"),
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      ))
    );

    const filePath = writeQbitJson("spring.json", "1080p");
    const summary = await importQbitRuleFiles([filePath]);

    expect(summary.failed).toBe(1);
    expect(summary.results[0]?.error).toContain("Bangumi subject link not found");
    expect(getAllSources()).toHaveLength(0);
  });
});