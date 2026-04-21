import { createLogger } from "../logger.ts";
import {
  getMikanBangumi,
  parseBangumiSubjectIdFromUrl,
  parseMikanBangumiIdFromRssUrl,
} from "./scraper.ts";

const logger = createLogger("mikan-identity");

export interface ResolveMikanBangumiIdentityInput {
  rssUrl?: string | null;
  mikanBangumiId?: number | null;
  bangumiSubjectId?: number | null;
}

export interface ResolvedMikanBangumiIdentity {
  mikanBangumiId: number;
  bangumiTvUrl: string;
  bangumiSubjectId: number;
  mikanRssUrl: string | null;
  title: string;
}

export async function resolveMikanBangumiIdentity(
  input: ResolveMikanBangumiIdentityInput,
): Promise<ResolvedMikanBangumiIdentity> {
  const parsedMikanBangumiId = parseMikanBangumiIdFromRssUrl(input.rssUrl);
  const resolvedMikanBangumiId = input.mikanBangumiId ?? parsedMikanBangumiId;

  if (!resolvedMikanBangumiId) {
    throw new Error("Mikan bangumi id is required");
  }

  if (
    input.mikanBangumiId !== null
    && input.mikanBangumiId !== undefined
    && parsedMikanBangumiId !== null
    && input.mikanBangumiId !== parsedMikanBangumiId
  ) {
    throw new Error("Mikan bangumi id does not match the RSS URL");
  }

  const detail = await getMikanBangumi(resolvedMikanBangumiId);
  if (!detail) {
    throw new Error(`Mikan bangumi not found: ${resolvedMikanBangumiId}`);
  }

  const bangumiTvUrl = detail.bangumiTvUrl;
  const resolvedBangumiSubjectId = detail.bangumiSubjectId ?? parseBangumiSubjectIdFromUrl(bangumiTvUrl);

  if (!bangumiTvUrl || !resolvedBangumiSubjectId) {
    logger.warn("Failed to resolve Bangumi subject from Mikan detail", { mikanBangumiId: resolvedMikanBangumiId });
    throw new Error(`Bangumi subject link not found for Mikan bangumi ${resolvedMikanBangumiId}`);
  }

  if (
    input.bangumiSubjectId !== null
    && input.bangumiSubjectId !== undefined
    && input.bangumiSubjectId !== resolvedBangumiSubjectId
  ) {
    throw new Error(
      `Bangumi subject id mismatch: expected ${input.bangumiSubjectId}, resolved ${resolvedBangumiSubjectId}`,
    );
  }

  logger.info("Resolved Mikan to Bangumi identity", {
    mikanBangumiId: resolvedMikanBangumiId,
    bangumiSubjectId: resolvedBangumiSubjectId,
  });

  return {
    mikanBangumiId: resolvedMikanBangumiId,
    bangumiTvUrl,
    bangumiSubjectId: resolvedBangumiSubjectId,
    mikanRssUrl: detail.mikanRssUrl,
    title: detail.title,
  };
}