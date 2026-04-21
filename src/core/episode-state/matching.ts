import { rawParser } from "../parser/raw-parser.ts";
import type { Episode } from "../parser/types.ts";
import type { PikPakFile } from "../pikpak/types.ts";

export interface EpisodeIdentity {
  normalizedTitle: string;
  seasonNumber: number;
  episodeNumber: number;
}

export interface EpisodeDeliveryKey extends EpisodeIdentity {
  cloudPath: string;
}

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".m4v", ".mov", ".ts", ".wmv", ".flv"]);

export function normalizeEpisodeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function getEpisodeTitle(ep: Pick<Episode, "nameEn" | "nameZh" | "nameJp">): string | null {
  return ep.nameEn ?? ep.nameZh ?? ep.nameJp ?? null;
}

export function buildEpisodeIdentity(ep: Episode | null | undefined): EpisodeIdentity | null {
  if (!ep || ep.episode <= 0) {
    return null;
  }

  const title = getEpisodeTitle(ep);
  if (!title) {
    return null;
  }

  return {
    normalizedTitle: normalizeEpisodeTitle(title),
    seasonNumber: ep.season > 0 ? ep.season : 1,
    episodeNumber: ep.episode,
  };
}

export function buildEpisodeIdentityFromFileName(fileName: string): EpisodeIdentity | null {
  return buildEpisodeIdentity(rawParser(fileName));
}

export function buildEpisodeDeliveryKey(identity: EpisodeIdentity, cloudPath: string): EpisodeDeliveryKey {
  return { ...identity, cloudPath };
}

export function findNamedFile(files: PikPakFile[], name: string): PikPakFile | null {
  return files.find((file) => file.name === name) ?? null;
}

function isVideoFile(file: PikPakFile): boolean {
  if (file.kind !== "drive#file") {
    return false;
  }

  const lowerName = file.name.toLowerCase();
  for (const extension of VIDEO_EXTENSIONS) {
    if (lowerName.endsWith(extension)) {
      return true;
    }
  }

  return false;
}

export function findMatchingVideoFile(
  files: PikPakFile[],
  identity: EpisodeIdentity,
  exactName?: string | null
): PikPakFile | null {
  if (exactName) {
    const exactMatch = findNamedFile(files, exactName);
    if (exactMatch) {
      return exactMatch;
    }
  }

  for (const file of files) {
    if (!isVideoFile(file)) {
      continue;
    }

    const parsedIdentity = buildEpisodeIdentityFromFileName(file.name);
    if (!parsedIdentity) {
      continue;
    }

    if (
      parsedIdentity.normalizedTitle === identity.normalizedTitle &&
      parsedIdentity.seasonNumber === identity.seasonNumber &&
      parsedIdentity.episodeNumber === identity.episodeNumber
    ) {
      return file;
    }
  }

  return null;
}

export function isTimestampStale(
  timestamp: string | null | undefined,
  refreshIntervalDays: number,
  now = new Date()
): boolean {
  if (!timestamp) {
    return true;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }

  const maxAgeMs = Math.max(refreshIntervalDays, 0) * 24 * 60 * 60 * 1000;
  return now.getTime() - parsed.getTime() > maxAgeMs;
}