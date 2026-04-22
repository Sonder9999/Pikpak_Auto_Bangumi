import { getSubject, getSubjectRelations, type BangumiSubject } from "../bangumi/index.ts";
import { createLogger } from "../logger.ts";
import { rawParser, parseSeasonNumberFromText } from "../parser/raw-parser.ts";
import type { Episode } from "../parser/types.ts";

const logger = createLogger("season-resolution");

interface BangumiContinuationContext {
  seasonOrdinal: number;
  cumulativeEpisodes: number;
}

export interface ResolveCanonicalEpisodeOptions {
  bangumiSubjectId?: number | null;
  mikanBangumiId?: number | null;
}

export interface CanonicalEpisodeResolution {
  episode: Episode | null;
  subject: BangumiSubject | null;
}

function isPrequelRelation(value: string | null | undefined): boolean {
  return /前传|前作|prequel/i.test(value ?? "");
}

async function resolveBangumiContinuationContext(
  subjectId: number,
  visited = new Set<number>()
): Promise<BangumiContinuationContext | null> {
  if (visited.has(subjectId)) {
    return null;
  }

  visited.add(subjectId);
  const relations = await getSubjectRelations(subjectId);
  if (!relations) {
    return null;
  }

  const prequels = relations.filter((relation) => relation.type === 2 && isPrequelRelation(relation.relation));
  if (prequels.length === 0) {
    return { seasonOrdinal: 1, cumulativeEpisodes: 0 };
  }

  if (prequels.length !== 1) {
    logger.debug("Skipping continuation chain because prequels are ambiguous", { subjectId, prequelCount: prequels.length });
    return null;
  }

  const prequel = prequels[0]!;
  const prequelSubject = await getSubject(prequel.id);
  if (!prequelSubject || !prequelSubject.eps || prequelSubject.eps <= 0) {
    logger.debug("Skipping continuation chain because prequel episodes are unavailable", {
      subjectId,
      prequelId: prequel.id,
      prequelEpisodes: prequelSubject?.eps ?? null,
    });
    return null;
  }

  const parentContext = await resolveBangumiContinuationContext(prequel.id, visited);
  if (!parentContext) {
    return null;
  }

  return {
    seasonOrdinal: parentContext.seasonOrdinal + 1,
    cumulativeEpisodes: parentContext.cumulativeEpisodes + prequelSubject.eps,
  };
}

function extractSubjectSeasonNumber(subject: BangumiSubject | null): number | null {
  if (!subject) {
    return null;
  }

  return parseSeasonNumberFromText(subject.nameCn) ?? parseSeasonNumberFromText(subject.name);
}

export async function resolveCanonicalEpisode(
  originalName: string,
  options: ResolveCanonicalEpisodeOptions = {}
): Promise<CanonicalEpisodeResolution> {
  const episode = rawParser(originalName);
  if (!episode || episode.episode <= 0) {
    return { episode: null, subject: null };
  }

  if (options.bangumiSubjectId === null || options.bangumiSubjectId === undefined) {
    return { episode, subject: null };
  }

  const subject = await getSubject(options.bangumiSubjectId);
  if (!subject) {
    logger.debug("Falling back to raw parser because Bangumi subject metadata is unavailable", {
      bangumiSubjectId: options.bangumiSubjectId,
      originalName,
    });
    return { episode, subject: null };
  }

  const subjectSeason = extractSubjectSeasonNumber(subject);
  const rawSeason = episode.season;
  const shouldResolveContinuationContext = (subjectSeason === null && rawSeason > 1)
    || (subject.eps !== null && episode.episode > subject.eps);
  const continuationContext = shouldResolveContinuationContext
    ? await resolveBangumiContinuationContext(subject.id)
    : null;

  const canonicalSeason = continuationContext?.seasonOrdinal
    ?? subjectSeason
    ?? (episode.season > 0 ? episode.season : 1);

  const normalizedEpisode = (() => {
    if (!continuationContext || !subject.eps || subject.eps <= 0) {
      return episode.episode;
    }

    const localEpisode = episode.episode - continuationContext.cumulativeEpisodes;
    if (localEpisode > 0 && localEpisode <= subject.eps) {
      return localEpisode;
    }

    return episode.episode;
  })();

  episode.season = canonicalSeason;
  episode.episode = normalizedEpisode;

  logger.debug("Canonical episode resolved", {
    originalName,
    bangumiSubjectId: subject.id,
    rawSeason,
    canonicalSeason,
    canonicalEpisode: normalizedEpisode,
  });

  return { episode, subject };
}