import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { sql } from "drizzle-orm";
import {
  createSource,
  getAllSources,
  getSourceById,
  updateSource,
  deleteSource,
  recordSuccess,
  recordFailure,
} from "../../src/core/rss/source-crud.ts";
import { parseRssXml } from "../../src/core/rss/feed-parser.ts";
import { storeNewItems, isItemProcessed, markItemProcessed, getUnprocessedItems } from "../../src/core/rss/item-store.ts";

import { getDb, closeDb } from "../../src/core/db/connection.ts";

const TEST_DB = ":memory:";

function initTestDb() {
  const db = getDb(TEST_DB);

  // Create tables via drizzle raw SQL
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

  return db;
}

beforeEach(() => {
  closeDb();
  initTestDb();
});

afterEach(() => {
  closeDb();
});

describe("RSS source CRUD", () => {
  test("create and list sources", () => {
    createSource({ name: "Test Feed", url: "https://example.com/rss" });
    createSource({ name: "Test Feed 2", url: "https://example.com/rss2" });

    const all = getAllSources();
    expect(all.length).toBe(2);
    expect(all[0]!.name).toBe("Test Feed");
  });

  test("get source by id", () => {
    const created = createSource({ name: "My Feed", url: "https://example.com/rss" });
    const found = getSourceById(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("My Feed");
  });

  test("update source", () => {
    const created = createSource({ name: "Old Name", url: "https://example.com/rss" });
    const updated = updateSource(created.id, { name: "New Name", enabled: false });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("New Name");
    expect(updated!.enabled).toBe(false);
  });

  test("delete source", () => {
    const created = createSource({ name: "To Delete", url: "https://example.com/rss" });
    const deleted = deleteSource(created.id);
    expect(deleted).toBe(true);
    expect(getSourceById(created.id)).toBeUndefined();
  });

  test("record success resets failures", () => {
    const created = createSource({ name: "Feed", url: "https://example.com/rss" });
    recordFailure(created.id, "Connection refused");
    recordFailure(created.id, "Timeout");

    let source = getSourceById(created.id);
    expect(source!.consecutiveFailures).toBe(2);

    recordSuccess(created.id);
    source = getSourceById(created.id);
    expect(source!.consecutiveFailures).toBe(0);
    expect(source!.lastSuccessAt).not.toBeNull();
  });

  test("record failure increments counter", () => {
    const created = createSource({ name: "Feed", url: "https://example.com/rss" });
    recordFailure(created.id, "Error 1");
    recordFailure(created.id, "Error 2");
    recordFailure(created.id, "Error 3");

    const source = getSourceById(created.id);
    expect(source!.consecutiveFailures).toBe(3);
    expect(source!.lastError).toBe("Error 3");
  });
});

describe("RSS XML parsing", () => {
  test("parses standard RSS XML with enclosure", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>[LoliHouse] Some Anime - 01 [1080p]</title>
      <link>https://example.com/1</link>
      <guid>guid-001</guid>
      <enclosure url="magnet:?xt=urn:btih:abc123" type="application/x-bittorrent"/>
    </item>
    <item>
      <title>[SubGroup] Another Anime - 02 [720p]</title>
      <link>https://example.com/2</link>
      <guid>guid-002</guid>
      <enclosure url="https://example.com/file.torrent" length="734579904" type="application/x-bittorrent"/>
      <torrent>
        <contentLength>734579904</contentLength>
        <pubDate>2026-04-20T01:50:00.213</pubDate>
      </torrent>
    </item>
  </channel>
</rss>`;

    const items = parseRssXml(xml);
    expect(items.length).toBe(2);
    expect(items[0]!.title).toBe("[LoliHouse] Some Anime - 01 [1080p]");
    expect(items[0]!.magnetUrl).toBe("magnet:?xt=urn:btih:abc123");
    expect(items[0]!.guid).toBe("guid-001");
    expect(items[1]!.torrentUrl).toBe("https://example.com/file.torrent");
    expect(items[1]!.sizeBytes).toBe(734579904);
    expect(items[1]!.publishedAt).toBe("2026-04-20T01:50:00.213");
  });

  test("parses single item (not array)", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>Single Item</title>
      <link>https://example.com/1</link>
    </item>
  </channel>
</rss>`;

    const items = parseRssXml(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe("Single Item");
  });

  test("returns empty array for invalid XML", () => {
    const items = parseRssXml("<html><body>Not RSS</body></html>");
    expect(items.length).toBe(0);
  });
});

describe("RSS item store & dedup", () => {
  test("stores new items and deduplicates", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });

    const feedItems = [
      { title: "Item 1", guid: "g1", link: null, magnetUrl: "magnet:1", torrentUrl: null, homepage: null },
      { title: "Item 2", guid: "g2", link: null, magnetUrl: "magnet:2", torrentUrl: null, homepage: null },
    ];

    const stored = storeNewItems(source.id, feedItems);
    expect(stored.length).toBe(2);

    // Store again - should dedup
    const stored2 = storeNewItems(source.id, feedItems);
    expect(stored2.length).toBe(0);
  });

  test("isItemProcessed returns correct state", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });
    expect(isItemProcessed(source.id, "new-guid")).toBe(false);

    storeNewItems(source.id, [
      { title: "Item", guid: "new-guid", link: null, magnetUrl: null, torrentUrl: null, homepage: null },
    ]);
    expect(isItemProcessed(source.id, "new-guid")).toBe(true);
  });

  test("mark item processed and get unprocessed", () => {
    const source = createSource({ name: "Feed", url: "https://example.com/rss" });
    const stored = storeNewItems(source.id, [
      { title: "A", guid: "g1", link: null, magnetUrl: "m1", torrentUrl: null, homepage: null },
      { title: "B", guid: "g2", link: null, magnetUrl: "m2", torrentUrl: null, homepage: null },
    ]);

    const unprocessed = getUnprocessedItems(source.id);
    expect(unprocessed.length).toBe(2);

    markItemProcessed(stored[0]!.id);
    const remaining = getUnprocessedItems(source.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.title).toBe("B");
  });
});
