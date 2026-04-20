import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/connection.ts";
import { createLogger } from "../logger.ts";
import type { RssFeedItem } from "./feed-parser.ts";

const logger = createLogger("rss");

export interface StoredRssItem {
  id: number;
  sourceId: number;
  guid: string;
  title: string;
  link: string | null;
  magnetUrl: string | null;
  torrentUrl: string | null;
  homepage: string | null;
  processed: boolean;
  createdAt: string;
}

export function isItemProcessed(sourceId: number, guid: string): boolean {
  const db = getDb();
  const existing = db
    .select({ id: schema.rssItems.id })
    .from(schema.rssItems)
    .where(
      and(
        eq(schema.rssItems.sourceId, sourceId),
        eq(schema.rssItems.guid, guid)
      )
    )
    .get();
  return existing !== undefined;
}

export function storeNewItems(sourceId: number, items: RssFeedItem[]): StoredRssItem[] {
  const db = getDb();
  const newItems: StoredRssItem[] = [];

  for (const item of items) {
    if (isItemProcessed(sourceId, item.guid)) {
      continue;
    }

    const stored = db
      .insert(schema.rssItems)
      .values({
        sourceId,
        guid: item.guid,
        title: item.title,
        link: item.link,
        magnetUrl: item.magnetUrl,
        torrentUrl: item.torrentUrl,
        homepage: item.homepage,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();

    newItems.push(stored);
  }

  if (newItems.length > 0) {
    logger.info("New RSS items stored", { sourceId, count: newItems.length });
  }

  return newItems;
}

export function markItemProcessed(itemId: number): void {
  const db = getDb();
  db.update(schema.rssItems)
    .set({ processed: true })
    .where(eq(schema.rssItems.id, itemId))
    .run();
}

export function getUnprocessedItems(sourceId?: number): StoredRssItem[] {
  const db = getDb();

  if (sourceId !== undefined) {
    return db
      .select()
      .from(schema.rssItems)
      .where(
        and(
          eq(schema.rssItems.sourceId, sourceId),
          eq(schema.rssItems.processed, false)
        )
      )
      .all();
  }

  return db
    .select()
    .from(schema.rssItems)
    .where(eq(schema.rssItems.processed, false))
    .all();
}
