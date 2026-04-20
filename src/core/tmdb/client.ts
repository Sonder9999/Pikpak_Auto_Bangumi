import { createLogger } from "../logger.ts";

const logger = createLogger("tmdb");

let tmdbApiKey = "";
let tmdbLanguage = "zh-CN";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// In-memory cache to avoid redundant API calls within a session
const cache = new Map<string, TmdbSearchResult | null>();

export function initTmdb(apiKey: string, language = "zh-CN"): void {
  tmdbApiKey = apiKey;
  tmdbLanguage = language;
  cache.clear();
}

export interface TmdbSearchResult {
  officialTitle: string;
  year: string | null;
  posterPath: string | null;
  tmdbId: number;
  season: number;
}

interface TmdbTvResult {
  id: number;
  name: string;
  original_name: string;
  first_air_date?: string;
  poster_path?: string | null;
  number_of_seasons?: number;
}

interface TmdbSearchResponse {
  results: TmdbTvResult[];
  total_results: number;
}

export async function searchAnime(
  title: string,
  language: string = tmdbLanguage,
): Promise<TmdbSearchResult | null> {
  if (!tmdbApiKey) {
    logger.debug("TMDB skipped: no API key configured");
    return null;
  }
  const cacheKey = `${title}:${language}`;
  if (cache.has(cacheKey)) {
    logger.debug("TMDB cache hit", { title });
    return cache.get(cacheKey)!;
  }

  const url = `${TMDB_BASE_URL}/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(title)}&language=${language}`;
  logger.debug("Searching TMDB", { title, language });

  const res = await fetch(url);
  if (!res.ok) {
    logger.warn("TMDB search failed", { status: res.status, title });
    cache.set(cacheKey, null);
    return null;
  }

  const data = (await res.json()) as TmdbSearchResponse;
  logger.debug("TMDB search results", { title, count: data.total_results });

  if (data.results.length === 0) {
    logger.info("No TMDB results found", { title });
    cache.set(cacheKey, null);
    return null;
  }

  const top = data.results[0];
  const year = top.first_air_date ? top.first_air_date.split("-")[0] : null;
  const officialTitle = top.name || top.original_name;

  logger.info("TMDB match found", {
    query: title,
    officialTitle,
    year,
    tmdbId: top.id,
  });

  const result: TmdbSearchResult = {
    officialTitle,
    year,
    posterPath: top.poster_path ?? null,
    tmdbId: top.id,
    season: top.number_of_seasons ?? 1,
  };
  cache.set(cacheKey, result);
  return result;
}
