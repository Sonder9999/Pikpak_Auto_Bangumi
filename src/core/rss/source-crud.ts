import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/connection.ts";
import { createLogger } from "../logger.ts";

const logger = createLogger("rss");

export interface RssSource {
  id: number;
  name: string;
  url: string;
  enabled: boolean;
  pollIntervalMs: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRssSourceInput {
  name: string;
  url: string;
  enabled?: boolean;
  pollIntervalMs?: number;
}

export interface UpdateRssSourceInput {
  name?: string;
  url?: string;
  enabled?: boolean;
  pollIntervalMs?: number;
}

export function getAllSources(): RssSource[] {
  const db = getDb();
  return db.select().from(schema.rssSources).all();
}

export function getEnabledSources(): RssSource[] {
  const db = getDb();
  return db
    .select()
    .from(schema.rssSources)
    .where(eq(schema.rssSources.enabled, true))
    .all();
}

export function getSourceById(id: number): RssSource | undefined {
  const db = getDb();
  return db
    .select()
    .from(schema.rssSources)
    .where(eq(schema.rssSources.id, id))
    .get();
}

export function createSource(input: CreateRssSourceInput): RssSource {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .insert(schema.rssSources)
    .values({
      name: input.name,
      url: input.url,
      enabled: input.enabled ?? true,
      pollIntervalMs: input.pollIntervalMs ?? 300000,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  logger.info("RSS source created", { id: result.id, name: result.name, url: result.url });
  return result;
}

export function updateSource(id: number, input: UpdateRssSourceInput): RssSource | undefined {
  const db = getDb();
  const existing = getSourceById(id);
  if (!existing) return undefined;

  const result = db
    .update(schema.rssSources)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.pollIntervalMs !== undefined && { pollIntervalMs: input.pollIntervalMs }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.rssSources.id, id))
    .returning()
    .get();

  logger.info("RSS source updated", { id, changes: input });
  return result;
}

export function deleteSource(id: number): boolean {
  const db = getDb();
  const result = db
    .delete(schema.rssSources)
    .where(eq(schema.rssSources.id, id))
    .returning()
    .get();

  if (result) {
    logger.info("RSS source deleted", { id });
    return true;
  }
  return false;
}

export function recordSuccess(id: number): void {
  const db = getDb();
  db.update(schema.rssSources)
    .set({
      lastSuccessAt: new Date().toISOString(),
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.rssSources.id, id))
    .run();
}

export function recordFailure(id: number, error: string): void {
  const db = getDb();
  const source = getSourceById(id);
  if (!source) return;

  const failures = source.consecutiveFailures + 1;
  db.update(schema.rssSources)
    .set({
      lastErrorAt: new Date().toISOString(),
      lastError: error,
      consecutiveFailures: failures,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.rssSources.id, id))
    .run();

  logger.warn("RSS source failure recorded", { id, failures, error });
}
