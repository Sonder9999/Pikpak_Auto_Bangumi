import { eq } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { getConfig } from "../config/config.ts";
import { getDb } from "../db/connection.ts";
import { danmakuCache } from "../db/schema.ts";
import { DandanplayClient, DandanplayError } from "./client.ts";
import { generateDanmakuXml } from "./xml-generator.ts";
import type { PikPakClient } from "../pikpak/client.ts";

const logger = createLogger("danmaku-service");

export interface DanmakuDownloadRequest {
  animeTitle: string;
  episode: number;
  parentFolderId: string;
  videoFileName: string;
}

export interface DanmakuDownloadResult {
  success: boolean;
  episodeId?: number;
  xmlFileId?: string;
  skipped?: boolean;
  error?: string;
}

/** Check if danmaku for this episodeId was already downloaded */
function isCached(episodeId: number): boolean {
  const db = getDb();
  const existing = db
    .select()
    .from(danmakuCache)
    .where(eq(danmakuCache.episodeId, episodeId))
    .get();
  return !!existing;
}

/** Store a successful download record */
function cacheRecord(episodeId: number, animeTitle: string, episodeTitle: string | null, pikpakFileId: string | null, xmlFileId: string | null) {
  const db = getDb();
  return db
    .insert(danmakuCache)
    .values({
      episodeId,
      animeTitle,
      episodeTitle,
      pikpakFileId,
      xmlFileId,
    })
    .returning()
    .get();
}

/** Get all cached danmaku records */
export function getCachedDanmaku() {
  const db = getDb();
  return db.select().from(danmakuCache).all();
}

/**
 * Download danmaku for a renamed video file.
 * Flow: search → download comments → generate XML → upload to PikPak
 */
export async function downloadDanmaku(
  pikpakClient: PikPakClient,
  request: DanmakuDownloadRequest,
  ddpClient?: DandanplayClient
): Promise<DanmakuDownloadResult> {
  const config = getConfig();

  if (!config.dandanplay.enabled) {
    logger.debug("DanDanPlay disabled in config");
    return { success: false, skipped: true };
  }

  const client = ddpClient ?? new DandanplayClient();
  if (!client.isConfigured()) {
    logger.info("DanDanPlay not configured (missing appId/appSecret)");
    return { success: false, skipped: true };
  }

  const { animeTitle, episode, parentFolderId, videoFileName } = request;
  logger.info("Starting danmaku download", { animeTitle, episode, videoFileName });

  // 1. Search for matching episode
  let episodes;
  try {
    episodes = await client.searchEpisodes(animeTitle, episode);
  } catch (e) {
    const msg = e instanceof DandanplayError ? e.message : String(e);
    logger.warn("Episode search failed", { animeTitle, episode, error: msg });
    return { success: false, error: `Search failed: ${msg}` };
  }

  if (episodes.length === 0) {
    logger.warn("No matching episodes found", { animeTitle, episode });
    return { success: false, error: "No matching episodes" };
  }

  const matched = episodes[0];
  logger.info("Episode matched", { episodeId: matched.episodeId, episodeTitle: matched.episodeTitle });

  // 2. Check cache
  if (isCached(matched.episodeId)) {
    logger.debug("Danmaku already cached", { episodeId: matched.episodeId });
    return { success: true, episodeId: matched.episodeId, skipped: true };
  }

  // 3. Download comments
  let comments;
  try {
    comments = await client.getComments(matched.episodeId);
  } catch (e) {
    const msg = e instanceof DandanplayError ? e.message : String(e);
    logger.warn("Comment download failed", { episodeId: matched.episodeId, error: msg });
    return { success: false, episodeId: matched.episodeId, error: `Comment download failed: ${msg}` };
  }

  // 4. Generate XML
  const xml = generateDanmakuXml(matched.episodeId, comments);

  // 5. Upload XML to PikPak
  const xmlFileName = videoFileName.replace(/\.[^.]+$/, ".xml");
  let xmlFileId: string | null = null;
  try {
    const uploaded = await pikpakClient.uploadSmallFile(parentFolderId, xmlFileName, xml);
    xmlFileId = uploaded?.id ?? null;
    logger.info("Danmaku XML uploaded", { xmlFileName, xmlFileId });
  } catch (e) {
    logger.warn("XML upload failed", { xmlFileName, error: String(e) });
    return { success: false, episodeId: matched.episodeId, error: `Upload failed: ${String(e)}` };
  }

  // 6. Cache the result
  cacheRecord(matched.episodeId, matched.animeTitle, matched.episodeTitle, null, xmlFileId);

  logger.info("Danmaku download complete", {
    episodeId: matched.episodeId,
    animeTitle: matched.animeTitle,
    comments: comments.length,
    xmlFileId,
  });

  return { success: true, episodeId: matched.episodeId, xmlFileId: xmlFileId ?? undefined };
}
