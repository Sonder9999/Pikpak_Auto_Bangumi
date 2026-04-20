import { createLogger } from "../logger.ts";
import { getConfig } from "../config/config.ts";
import type {
  SearchEpisodesResponse,
  GetCommentsResponse,
  DandanplayEpisode,
  DandanplayComment,
} from "./types.ts";

const logger = createLogger("dandanplay");

const API_BASE = "https://api.dandanplay.net";

export class DandanplayClient {
  private appId: string;
  private appSecret: string;
  private chConvert: number;

  constructor(opts?: { appId?: string; appSecret?: string; chConvert?: number }) {
    const config = getConfig();
    this.appId = opts?.appId ?? config.dandanplay.appId;
    this.appSecret = opts?.appSecret ?? config.dandanplay.appSecret;
    this.chConvert = opts?.chConvert ?? config.dandanplay.chConvert;
  }

  isConfigured(): boolean {
    return this.appId.length > 0 && this.appSecret.length > 0;
  }

  private async request<T>(url: string, params?: Record<string, string>): Promise<T> {
    if (!this.isConfigured()) {
      logger.info("DanDanPlay not configured, skipping API call");
      throw new DandanplayError("DanDanPlay appId/appSecret not configured", url);
    }

    let fullUrl = `${API_BASE}${url}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      fullUrl += `?${qs}`;
    }

    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-AppId": this.appId,
      "X-AppSecret": this.appSecret,
    };

    logger.debug("API request", { url: fullUrl.slice(0, 120) });

    let resp: Response;
    try {
      resp = await fetch(fullUrl, { method: "GET", headers });
    } catch (e) {
      logger.error("API network error", { url: fullUrl.slice(0, 120), error: String(e) });
      throw new DandanplayError(`Network error: ${String(e)}`, url);
    }

    if (!resp.ok) {
      logger.error("API non-2xx response", { url: fullUrl.slice(0, 120), status: resp.status });
      throw new DandanplayError(`HTTP ${resp.status}`, url);
    }

    const data = (await resp.json()) as T & { errorCode?: number; errorMessage?: string; success?: boolean };
    if (data.errorCode !== undefined && data.errorCode !== 0) {
      logger.warn("API error response", { errorCode: data.errorCode, errorMessage: data.errorMessage });
      throw new DandanplayError(data.errorMessage ?? `errorCode ${data.errorCode}`, url);
    }

    return data;
  }

  /** Search episodes by anime title and episode number */
  async searchEpisodes(animeTitle: string, episodeNumber: number): Promise<DandanplayEpisode[]> {
    logger.info("Searching episodes", { animeTitle, episodeNumber });

    const resp = await this.request<SearchEpisodesResponse>("/api/v2/search/episodes", {
      anime: animeTitle,
      episode: String(episodeNumber),
    });

    const episodes: DandanplayEpisode[] = [];
    for (const anime of resp.animes ?? []) {
      for (const ep of anime.episodes ?? []) {
        episodes.push({ ...ep, animeTitle: ep.animeTitle ?? anime.animeTitle });
      }
    }

    logger.info("Search results", { animeTitle, episodeNumber, count: episodes.length });
    return episodes;
  }

  /** Get danmaku comments for a specific episode */
  async getComments(episodeId: number): Promise<DandanplayComment[]> {
    logger.info("Fetching comments", { episodeId });

    const resp = await this.request<GetCommentsResponse>(
      `/api/v2/comment/${episodeId}`,
      {
        withRelated: "true",
        chConvert: String(this.chConvert),
      }
    );

    logger.info("Comments fetched", { episodeId, count: resp.count ?? resp.comments?.length ?? 0 });
    return resp.comments ?? [];
  }
}

export class DandanplayError extends Error {
  endpoint: string;

  constructor(message: string, endpoint: string) {
    super(message);
    this.name = "DandanplayError";
    this.endpoint = endpoint;
  }
}
