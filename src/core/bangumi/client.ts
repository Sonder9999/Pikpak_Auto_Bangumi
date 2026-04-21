import { createLogger } from "../logger.ts";

const logger = createLogger("bangumi");

const BANGUMI_BASE_URL = "https://api.bgm.tv/v0";
const COLLECTION_CACHE_TTL_MS = 5 * 60 * 1000;

let bangumiToken = "";

const collectionCache = new Map<number, { expiresAt: number; value: BangumiCollection[] }>();

interface BangumiImagePayload {
  large?: string | null;
  common?: string | null;
  medium?: string | null;
  small?: string | null;
  grid?: string | null;
}

interface BangumiRatingPayload {
  score?: number | null;
  total?: number | null;
}

interface BangumiTagPayload {
  name?: string | null;
  count?: number | null;
}

interface BangumiSubjectPayload {
  id: number;
  name?: string | null;
  name_cn?: string | null;
  date?: string | null;
  eps?: number | null;
  summary?: string | null;
  images?: BangumiImagePayload | null;
  rating?: BangumiRatingPayload | null;
  tags?: BangumiTagPayload[] | null;
  url?: string | null;
}

interface BangumiCollectionPayload {
  type?: number | null;
  subject?: BangumiSubjectPayload | null;
}

export interface BangumiImageSet {
  large: string | null;
  common: string | null;
  medium: string | null;
  small: string | null;
  grid: string | null;
}

export interface BangumiRating {
  score: number | null;
  total: number | null;
}

export interface BangumiTag {
  name: string;
  count: number;
}

export interface BangumiSubject {
  id: number;
  name: string;
  nameCn: string | null;
  date: string | null;
  year: string | null;
  eps: number | null;
  summary: string | null;
  images: BangumiImageSet;
  rating: BangumiRating;
  tags: BangumiTag[];
  url: string;
}

export interface BangumiCollection {
  type: number;
  subject: BangumiSubject;
}

export class BangumiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BangumiRequestError";
  }
}

export function initBangumi(token: string): void {
  bangumiToken = token.trim();
  collectionCache.clear();
  logger.info("Bangumi client initialized", { configured: bangumiToken.length > 0 });
}

export function isBangumiConfigured(): boolean {
  return bangumiToken.length > 0;
}

function normalizeUrl(value: string | null | undefined, baseUrl = BANGUMI_BASE_URL): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function buildHeaders(): Headers {
  return new Headers({
    Authorization: `Bearer ${bangumiToken}`,
    Accept: "application/json",
    "User-Agent": "Pikpak-Auto-Bangumi/0.1.0",
  });
}

let currentUsername: string | null = null;

export async function fetchBangumi(path: string): Promise<Response> {
  const url = `${BANGUMI_BASE_URL}${path}`;
  logger.info("Bangumi request", { path });

  const response = await fetch(url, {
    headers: buildHeaders(),
  });

  logger.info("Bangumi response", { path, status: response.status });

  if (!response.ok) {
    throw new BangumiRequestError(`Bangumi request failed: ${response.status}`, response.status);
  }

  return response;
}

function getYear(date: string | null | undefined): string | null {
  if (!date) {
    return null;
  }

  const match = date.match(/^(\d{4})/);
  return match ? match[1] : null;
}

function mapImages(images?: BangumiImagePayload | null): BangumiImageSet {
  return {
    large: normalizeUrl(images?.large),
    common: normalizeUrl(images?.common),
    medium: normalizeUrl(images?.medium),
    small: normalizeUrl(images?.small),
    grid: normalizeUrl(images?.grid),
  };
}

function mapSubject(subject: BangumiSubjectPayload): BangumiSubject {
  return {
    id: subject.id,
    name: subject.name?.trim() || `subject-${subject.id}`,
    nameCn: subject.name_cn?.trim() || null,
    date: subject.date?.trim() || null,
    year: getYear(subject.date),
    eps: typeof subject.eps === "number" ? subject.eps : null,
    summary: subject.summary?.trim() || null,
    images: mapImages(subject.images),
    rating: {
      score: typeof subject.rating?.score === "number" ? subject.rating.score : null,
      total: typeof subject.rating?.total === "number" ? subject.rating.total : null,
    },
    tags: (subject.tags ?? [])
      .filter((tag): tag is BangumiTagPayload => Boolean(tag?.name))
      .map((tag) => ({
        name: tag.name!.trim(),
        count: typeof tag.count === "number" ? tag.count : 0,
      })),
    url: normalizeUrl(subject.url, "https://bgm.tv") ?? `https://bgm.tv/subject/${subject.id}`,
  };
}

export async function getCollections(type = 3): Promise<BangumiCollection[] | null> {
  if (!isBangumiConfigured()) {
    logger.debug("Bangumi collections skipped: no token configured");
    return null;
  }

  if (!currentUsername) {
    try {
      const meRes = await fetchBangumi("/me");
      const meData = (await meRes.json()) as { username: string };
      currentUsername = meData.username;
      logger.info("Bangumi current user resolved", { username: currentUsername });
    } catch (err) {
      logger.error("Failed to resolve Bangumi current user", err);
      return null;
    }
  }

  const cached = collectionCache.get(type);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug("Bangumi collection cache hit", { type });
    return cached.value;
  }

  const response = await fetchBangumi(`/users/${currentUsername}/collections?subject_type=2&type=${type}`);
  const payload = (await response.json()) as { data: (BangumiCollectionPayload & { subject: BangumiSubjectPayload })[] };

  const value = (payload.data || [])
    .filter((item) => Boolean(item.subject?.id))
    .map((item) => ({
      type: typeof item.type === "number" ? item.type : type,
      subject: mapSubject(item.subject),
    }));

  collectionCache.set(type, { expiresAt: Date.now() + COLLECTION_CACHE_TTL_MS, value });
  logger.info("Bangumi collections cached", { type, count: value.length });
  return value;
}

export async function getSubject(subjectId: number): Promise<BangumiSubject | null> {
  if (!isBangumiConfigured()) {
    logger.debug("Bangumi subject skipped: no token configured", { subjectId });
    return null;
  }

  try {
    const response = await fetchBangumi(`/subjects/${subjectId}`);
    const payload = (await response.json()) as BangumiSubjectPayload;
    return mapSubject(payload);
  } catch (error) {
    if (error instanceof BangumiRequestError && error.status === 404) {
      logger.warn("Bangumi subject not found", { subjectId });
      return null;
    }
    throw error;
  }
}