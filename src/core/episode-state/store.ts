import { and, eq } from "drizzle-orm";
import { getDb } from "../db/connection.ts";
import { episodeDeliveryState } from "../db/schema.ts";
import { createLogger } from "../logger.ts";
import type { EpisodeDeliveryKey } from "./matching.ts";

const logger = createLogger("episode-state");

export type EpisodeVideoStatus = "delivered" | "missing";
export type EpisodeDanmakuStatus = "pending" | "fresh" | "missing" | "error";
export type EpisodeDeliveryRecord = typeof episodeDeliveryState.$inferSelect;

interface EpisodeDeliveryUpdate {
  videoStatus?: EpisodeVideoStatus;
  videoFileName?: string | null;
  videoFileId?: string | null;
  videoVerifiedAt?: string | null;
  danmakuStatus?: EpisodeDanmakuStatus;
  danmakuUploadedAt?: string | null;
  danmakuCheckedAt?: string | null;
  xmlFileName?: string | null;
  xmlFileId?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function getEpisodeDeliveryState(key: EpisodeDeliveryKey): EpisodeDeliveryRecord | null {
  const db = getDb();
  return db
    .select()
    .from(episodeDeliveryState)
    .where(
      and(
        eq(episodeDeliveryState.normalizedTitle, key.normalizedTitle),
        eq(episodeDeliveryState.seasonNumber, key.seasonNumber),
        eq(episodeDeliveryState.episodeNumber, key.episodeNumber),
        eq(episodeDeliveryState.cloudPath, key.cloudPath)
      )
    )
    .get() ?? null;
}

function upsertEpisodeDeliveryState(
  key: EpisodeDeliveryKey,
  update: EpisodeDeliveryUpdate
): EpisodeDeliveryRecord {
  const db = getDb();
  const existing = getEpisodeDeliveryState(key);
  const updatedAt = nowIso();

  if (existing) {
    const next = db
      .update(episodeDeliveryState)
      .set({
        ...update,
        updatedAt,
      })
      .where(eq(episodeDeliveryState.id, existing.id))
      .returning()
      .get();

    logger.debug("Episode delivery state updated", {
      id: existing.id,
      title: key.normalizedTitle,
      season: key.seasonNumber,
      episode: key.episodeNumber,
      cloudPath: key.cloudPath,
      videoStatus: next.videoStatus,
      danmakuStatus: next.danmakuStatus,
    });
    return next;
  }

  const created = db
    .insert(episodeDeliveryState)
    .values({
      normalizedTitle: key.normalizedTitle,
      seasonNumber: key.seasonNumber,
      episodeNumber: key.episodeNumber,
      cloudPath: key.cloudPath,
      videoStatus: update.videoStatus ?? "missing",
      videoFileName: update.videoFileName ?? null,
      videoFileId: update.videoFileId ?? null,
      videoVerifiedAt: update.videoVerifiedAt ?? null,
      danmakuStatus: update.danmakuStatus ?? "pending",
      danmakuUploadedAt: update.danmakuUploadedAt ?? null,
      danmakuCheckedAt: update.danmakuCheckedAt ?? null,
      xmlFileName: update.xmlFileName ?? null,
      xmlFileId: update.xmlFileId ?? null,
      createdAt: updatedAt,
      updatedAt,
    })
    .returning()
    .get();

  logger.info("Episode delivery state created", {
    id: created.id,
    title: key.normalizedTitle,
    season: key.seasonNumber,
    episode: key.episodeNumber,
    cloudPath: key.cloudPath,
    videoStatus: created.videoStatus,
    danmakuStatus: created.danmakuStatus,
  });
  return created;
}

export function markEpisodeDelivered(
  key: EpisodeDeliveryKey,
  options?: { videoFileName?: string | null; videoFileId?: string | null; verifiedAt?: string | null }
): EpisodeDeliveryRecord {
  return upsertEpisodeDeliveryState(key, {
    videoStatus: "delivered",
    videoFileName: options?.videoFileName ?? null,
    videoFileId: options?.videoFileId ?? null,
    videoVerifiedAt: options?.verifiedAt ?? nowIso(),
  });
}

export function markEpisodeMissing(key: EpisodeDeliveryKey): EpisodeDeliveryRecord {
  return upsertEpisodeDeliveryState(key, {
    videoStatus: "missing",
    videoVerifiedAt: nowIso(),
    danmakuStatus: "missing",
    danmakuCheckedAt: nowIso(),
  });
}

export function markDanmakuFresh(
  key: EpisodeDeliveryKey,
  options: { xmlFileName: string; xmlFileId?: string | null; uploadedAt?: string | null }
): EpisodeDeliveryRecord {
  const uploadedAt = options.uploadedAt ?? nowIso();
  return upsertEpisodeDeliveryState(key, {
    danmakuStatus: "fresh",
    danmakuUploadedAt: uploadedAt,
    danmakuCheckedAt: uploadedAt,
    xmlFileName: options.xmlFileName,
    xmlFileId: options.xmlFileId ?? null,
  });
}

export function markDanmakuMissing(
  key: EpisodeDeliveryKey,
  options?: { xmlFileName?: string | null; xmlFileId?: string | null }
): EpisodeDeliveryRecord {
  return upsertEpisodeDeliveryState(key, {
    danmakuStatus: "missing",
    danmakuCheckedAt: nowIso(),
    xmlFileName: options?.xmlFileName ?? null,
    xmlFileId: options?.xmlFileId ?? null,
  });
}

export function markDanmakuError(key: EpisodeDeliveryKey): EpisodeDeliveryRecord {
  return upsertEpisodeDeliveryState(key, {
    danmakuStatus: "error",
    danmakuCheckedAt: nowIso(),
  });
}

export function touchDanmakuCheck(
  key: EpisodeDeliveryKey,
  options?: { xmlFileName?: string | null; xmlFileId?: string | null }
): EpisodeDeliveryRecord {
  return upsertEpisodeDeliveryState(key, {
    danmakuCheckedAt: nowIso(),
    xmlFileName: options?.xmlFileName,
    xmlFileId: options?.xmlFileId,
  });
}