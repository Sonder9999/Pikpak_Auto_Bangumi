import { eq, and, or } from "drizzle-orm";
import { getDb, schema } from "../db/connection.ts";
import { createLogger } from "../logger.ts";
import type { RssFeedItem } from "./feed-parser.ts";

const logger = createLogger("rss");

export type ReplayStatus = "pending" | "filtered" | "submitted" | "duplicate" | "error";

export interface ReplayState {
  status: ReplayStatus;
  decisionReason: string | null;
  linkedTaskId: number | null;
}

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
  replayStatus: ReplayStatus;
  decisionReason: string | null;
  linkedTaskId: number | null;
  createdAt: string;
}

function isProcessedStatus(status: ReplayStatus): boolean {
  return status === "filtered" || status === "submitted" || status === "duplicate";
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

export function getReplayState(itemId: number): ReplayState | null {
  const db = getDb();
  const row = db
    .select({
      status: schema.rssItems.replayStatus,
      decisionReason: schema.rssItems.decisionReason,
      linkedTaskId: schema.rssItems.linkedTaskId,
    })
    .from(schema.rssItems)
    .where(eq(schema.rssItems.id, itemId))
    .get();

  return row ?? null;
}

export function updateReplayState(
  itemId: number,
  status: ReplayStatus,
  options?: { decisionReason?: string | null; linkedTaskId?: number | null }
): StoredRssItem | null {
  const db = getDb();
  const updated = db
    .update(schema.rssItems)
    .set({
      replayStatus: status,
      decisionReason: options?.decisionReason ?? null,
      linkedTaskId: options?.linkedTaskId ?? null,
      processed: isProcessedStatus(status),
    })
    .where(eq(schema.rssItems.id, itemId))
    .returning()
    .get();

  if (updated) {
    logger.debug("RSS replay state updated", { itemId, status, linkedTaskId: updated.linkedTaskId });
  }

  return updated ?? null;
}

export function getReplayableItems(sourceId?: number): StoredRssItem[] {
  const db = getDb();
  const replayable = or(
    eq(schema.rssItems.replayStatus, "pending"),
    eq(schema.rssItems.replayStatus, "error")
  );

  if (sourceId !== undefined) {
    return db
      .select()
      .from(schema.rssItems)
      .where(and(eq(schema.rssItems.sourceId, sourceId), replayable))
      .all();
  }

  return db
    .select()
    .from(schema.rssItems)
    .where(replayable)
    .all();
}

export function requeueSourceItemsForReplay(sourceId: number, options?: { reason?: string | null }): number {
  const db = getDb();
  const updated = db
    .update(schema.rssItems)
    .set({
      replayStatus: "pending",
      decisionReason: options?.reason ?? null,
      linkedTaskId: null,
      processed: false,
    })
    .where(
      and(
        eq(schema.rssItems.sourceId, sourceId),
        eq(schema.rssItems.replayStatus, "filtered")
      )
    )
    .returning({ id: schema.rssItems.id })
    .all();

  if (updated.length > 0) {
    logger.info("Filtered RSS items re-queued for replay", { sourceId, count: updated.length, reason: options?.reason ?? null });
  }

  return updated.length;
}

export function requeueAllItemsForReplay(options?: { reason?: string | null }): number {
  const db = getDb();
  const updated = db
    .update(schema.rssItems)
    .set({
      replayStatus: "pending",
      decisionReason: options?.reason ?? null,
      linkedTaskId: null,
      processed: false,
    })
    .where(eq(schema.rssItems.replayStatus, "filtered"))
    .returning({ id: schema.rssItems.id })
    .all();

  if (updated.length > 0) {
    logger.info("All filtered RSS items re-queued for replay", { count: updated.length, reason: options?.reason ?? null });
  }

  return updated.length;
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
