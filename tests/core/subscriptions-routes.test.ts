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
    replay_status TEXT NOT NULL DEFAULT 'pending',
    decision_reason TEXT,
    linked_task_id INTEGER,
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

  test("POST /api/subscriptions/preview-rss tests RSS parsing and regex matching", async () => {
    const app = new Elysia().use(subscriptionsRoutes);

    const mockupXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Preview Feed</title>
        <item>
          <title>[Subgroup] Some Anime - 01 (1080p) [WebRip]</title>
          <enclosure url="magnet:?xt=urn:btih:valid1"/>
        </item>
        <item>
          <title>[Subgroup] Some Anime - 02 (1080p) [WebRip]</title>
          <enclosure url="magnet:?xt=urn:btih:valid2"/>
        </item>
        <item>
          <title>[Subgroup] Some Anime - 01 (720p) [WebRip]</title>
          <enclosure url="magnet:?xt=urn:btih:excluded1"/>
        </item>
        <item>
          <title>[Subgroup] Unrelated Anime - 01 (1080p)</title>
          <enclosure url="magnet:?xt=urn:btih:unrelated"/>
        </item>
      </channel>
    </rss>`;

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(mockupXml, {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
      }))
    );

    const response = await app.handle(
      new Request("http://localhost/api/subscriptions/preview-rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/preview.xml",
          regexInclude: "Some Anime.*1080p",
          regexExclude: "720p",
        }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty("matched");
    expect(data).toHaveProperty("excluded");
    expect(data.error).toBeNull();

    expect(data.matched.length).toBe(2);
    expect(data.matched[0].title).toBe("[Subgroup] Some Anime - 01 (1080p) [WebRip]");
    expect(data.matched[0].magnetUrl).toBe("magnet:?xt=urn:btih:valid1");
    // Assert parsing extraction
    expect(data.matched[0].parsed).toBeDefined();
    expect(data.matched[0].parsed.episode).toBe(1);

    expect(data.excluded.length).toBe(2);
    expect(data.excluded.some((item: any) => item.title.includes("720p"))).toBe(true);
    expect(data.excluded.some((item: any) => item.title.includes("Unrelated Anime"))).toBe(true);
  });

  test("POST /api/subscriptions/preview-rss supports plain multi-keyword matching", async () => {
    const app = new Elysia().use(subscriptionsRoutes);

    const mockupXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Preview Feed</title>
        <item>
          <title>[黒ネズミたち] 黑猫与魔女的教室 - 02 (CR 1920x1080 AVC AAC MKV)</title>
          <link>https://example.com/episode-1</link>
          <enclosure url="https://example.com/episode-1.torrent" length="734579904" type="application/x-bittorrent"/>
          <torrent>
            <contentLength>734579904</contentLength>
            <pubDate>2026-04-20T01:50:00.213</pubDate>
          </torrent>
        </item>
        <item>
          <title>[黒ネズミたち] 黑猫与魔女的教室 - 01 (CR 1920x1080 AVC AAC MKV)</title>
          <link>https://example.com/episode-0</link>
          <enclosure url="https://example.com/episode-0.torrent" length="634579904" type="application/x-bittorrent"/>
          <torrent>
            <contentLength>634579904</contentLength>
            <pubDate>2026-04-13T01:50:00.213</pubDate>
          </torrent>
        </item>
        <item>
          <title>[LoliHouse] 黑猫与魔女的教室 - 02 (CR 1920x1080 AVC AAC MKV)</title>
          <link>https://example.com/episode-2</link>
        </item>
        <item>
          <title>黑猫与魔女的教室 - 03 (CR 1920x1080 AVC AAC MKV)</title>
          <link>https://example.com/episode-3</link>
        </item>
      </channel>
    </rss>`;

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(mockupXml, {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
      }))
    );

    const response = await app.handle(
      new Request("http://localhost/api/subscriptions/preview-rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rssUrl: "https://example.com/preview.xml",
          regexInclude: "黒ネズミたち CR",
        }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.matched.length).toBe(2);
    expect(data.matchedGroups.length).toBe(1);
    expect(data.matchedGroups[0].groupName).toBe("黒ネズミたち");
    expect(data.matchedGroups[0].items[0].title).toContain("- 01 ");
    expect(data.matchedGroups[0].items[1].title).toContain("- 02 ");
    expect(data.matchedGroups[0].items[1].sizeBytes).toBe(734579904);
    expect(data.matchedGroups[0].items[1].publishedAt).toBe("2026-04-20T01:50:00.213");
    expect(data.excluded.length).toBe(2);
  });

  test("POST /api/subscriptions/preview-rss returns grouped buckets for mixed subtitle groups", async () => {
    const app = new Elysia().use(subscriptionsRoutes);

    const mockupXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Preview Feed</title>
        <item>
          <title>[黒ネズミたち] 黑猫与魔女的教室 - 02 (CR 1920x1080 AVC AAC MKV)</title>
          <link>https://example.com/episode-1</link>
          <torrent>
            <pubDate>2026-04-20T01:50:00.213</pubDate>
          </torrent>
        </item>
        <item>
          <title>[黒ネズミたち] 黑猫与魔女的教室 - 01 (CR 1920x1080 AVC AAC MKV)</title>
          <link>https://example.com/episode-0</link>
          <torrent>
            <pubDate>2026-04-13T01:50:00.213</pubDate>
          </torrent>
        </item>
        <item>
          <title>[LoliHouse] 黑猫与魔女的教室 - 02 (CR 1920x1080 AVC AAC MKV)</title>
          <link>https://example.com/episode-2</link>
        </item>
        <item>
          <title>黑猫与魔女的教室 - 03 (CR 1920x1080 AVC AAC MKV)</title>
          <link>https://example.com/episode-3</link>
        </item>
      </channel>
    </rss>`;

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(mockupXml, {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
      }))
    );

    const response = await app.handle(
      new Request("http://localhost/api/subscriptions/preview-rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rssUrl: "https://example.com/preview.xml",
          regexInclude: "CR",
        }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.matched.length).toBe(4);
    expect(data.matchedGroups.length).toBe(3);
    expect(data.matchedGroups[0].groupName).toBe("LoliHouse");
    expect(data.matchedGroups[1].groupName).toBe("黒ネズミたち");
    expect(data.matchedGroups[1].items[0].title).toContain("- 01 ");
    expect(data.matchedGroups[1].items[1].title).toContain("- 02 ");
    expect(data.matchedGroups[2].groupName).toBe("未识别字幕组");
    expect(data.excluded.length).toBe(0);
  });
});
