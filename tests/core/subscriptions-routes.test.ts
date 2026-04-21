import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { closeDb, getDb } from "../../src/core/db/connection.ts";
import { getRulesBySourceId } from "../../src/core/filter/rule-crud.ts";
import { getAllSources } from "../../src/core/rss/source-crud.ts";
import { setNewItemHandler, startScheduler, stopScheduler } from "../../src/core/rss/scheduler.ts";
import { subscriptionsRoutes } from "../../src/server/routes/subscriptions.ts";

const TEST_DB = ":memory:";
const EMPTY_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
  </channel>
</rss>`;

let originalFetch: typeof globalThis.fetch;

function initTestDb() {
  const db = getDb(TEST_DB);

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

  db.run(sql`CREATE TABLE IF NOT EXISTS filter_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    mode TEXT NOT NULL,
    source_id INTEGER REFERENCES rss_sources(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
}

async function postSubscription(app: Elysia, body: Record<string, unknown>) {
  return app.handle(new Request("http://localhost/api/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function findRulePattern(sourceId: number, mode: "include" | "exclude") {
  const rules = getRulesBySourceId(sourceId);
  const matchedRule = rules.find(function (rule) {
    return rule.mode === mode;
  });

  return matchedRule?.pattern;
}

describe("Subscriptions routes", function () {
  beforeEach(function () {
    closeDb();
    initTestDb();
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(EMPTY_RSS_XML, {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
      }))
    );
  });

  afterEach(function () {
    stopScheduler();
    globalThis.fetch = originalFetch;
    mock.restore();
    closeDb();
  });

  test("POST /api/subscriptions creates manual RSS source and rules", async function () {
    const app = new Elysia().use(subscriptionsRoutes);
    const response = await postSubscription(app, {
      bangumiId: 3928,
      mikanId: null,
      rssUrl: "https://example.com/manual.xml",
      regexInclude: "1080p",
      regexExclude: "720p",
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.updated).toBe(false);
    expect(data.source.name).toBe("Manual RSS - 3928");

    const sources = getAllSources();
    expect(sources.length).toBe(1);
    expect(sources[0]?.bangumiSubjectId).toBe(3928);
    expect(findRulePattern(data.source.id, "include")).toBe("1080p");
    expect(findRulePattern(data.source.id, "exclude")).toBe("720p");
  });

  test("POST /api/subscriptions updates an existing manual RSS source and syncs rules", async function () {
    const app = new Elysia().use(subscriptionsRoutes);

    const createResponse = await postSubscription(app, {
      bangumiId: 3928,
      mikanId: null,
      rssUrl: "https://example.com/manual.xml",
      regexInclude: "1080p",
      regexExclude: "720p",
    });
    const created = await createResponse.json();

    const updateResponse = await postSubscription(app, {
      bangumiId: 3928,
      mikanId: null,
      sourceId: created.source.id,
      rssUrl: "https://example.com/manual-updated.xml",
      regexInclude: "2160p",
    });
    const updated = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated.updated).toBe(true);

    const sources = getAllSources();
    expect(sources.length).toBe(1);
    expect(sources[0]?.url).toBe("https://example.com/manual-updated.xml");

    const rules = getRulesBySourceId(created.source.id);
    expect(rules.length).toBe(1);
    expect(rules[0]?.mode).toBe("include");
    expect(rules[0]?.pattern).toBe("2160p");
  });

  test("POST /api/subscriptions refreshes the running scheduler for new sources", async function () {
    const app = new Elysia().use(subscriptionsRoutes);
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(EMPTY_RSS_XML, {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
      }))
    );

    setNewItemHandler(() => undefined);
    startScheduler();

    const response = await postSubscription(app, {
      bangumiId: 576351,
      mikanId: null,
      rssUrl: "https://example.com/new-feed.xml",
    });

    expect(response.status).toBe(200);

    await Bun.sleep(50);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/new-feed.xml",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/rss+xml, application/xml, text/xml",
        }),
      })
    );
  });
});
