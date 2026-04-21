import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import { createLogger } from "../logger.ts";

const logger = createLogger("mikan");

const MIKAN_BASE_URL = "https://mikanani.me";

export interface MikanSearchResult {
  mikanId: number;
  title: string;
  posterUrl: string | null;
}

export interface MikanEpisode {
  title: string;
  size: string;
  updatedAt: string;
  magnet: string;
}

export interface MikanSubgroup {
  id: number;
  name: string;
  rssUrl: string;
  episodes: MikanEpisode[];
}

export interface MikanBangumiDetail {
  mikanId: number;
  title: string;
  posterUrl: string | null;
  bangumiTvUrl: string | null;
  mikanRssUrl: string | null;
  summary: string | null;
  subgroups: MikanSubgroup[];
}

export class MikanRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MikanRequestError";
  }
}

function toAbsoluteMikanUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, MIKAN_BASE_URL).toString();
  } catch {
    return value;
  }
}

function fetchMikan(url: string): Promise<Response> {
  logger.info("Mikan request", { url });
  return fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Pikpak-Auto-Bangumi/0.1.0",
    },
  });
}

function parseBackgroundImage(style: string | null | undefined): string | null {
  if (!style) {
    return null;
  }

  const match = style.match(/url\((['"]?)(.*?)\1\)/i);
  return match ? toAbsoluteMikanUrl(match[2]) : null;
}

function findNextEpisodeTable(node: HTMLElement): HTMLElement | null {
  let sibling = node.nextElementSibling;

  while (sibling) {
    if (sibling.classList.contains("episode-table")) {
      return sibling;
    }

    if (sibling.classList.contains("subgroup-text")) {
      return null;
    }

    sibling = sibling.nextElementSibling;
  }

  return null;
}

function extractEpisodes(tableNode: HTMLElement | null): MikanEpisode[] {
  if (!tableNode) return [];

  const rows = tableNode.querySelectorAll("tbody tr");
  return rows.map((row) => {
    const episodeTitle = row.querySelector("a.magnet-link-wrap")?.text.trim() || "";
    const magnet = row.querySelector("a[data-clipboard-text]")?.getAttribute("data-clipboard-text") || "";
    const cells = row.querySelectorAll("td");
    const size = cells[2]?.text.trim() || "";
    const updatedAt = cells[3]?.text.trim() || "";

    return {
      title: episodeTitle,
      size,
      updatedAt,
      magnet
    };
  }).filter(e => e.title);
}

export function parseMikanSearchHtml(html: string): MikanSearchResult[] {
  const root = parse(html);
  const results = root.querySelectorAll("ul.list-inline.an-ul li a");

  return results
    .map((anchor) => {
      const href = anchor.getAttribute("href") || "";
      const match = href.match(/\/Home\/Bangumi\/(\d+)/);
      if (!match) {
        return null;
      }

      const title = anchor.querySelector(".an-text")?.text.trim() || "";
      if (!title) {
        return null;
      }

      return {
        mikanId: Number(match[1]),
        title,
        posterUrl: toAbsoluteMikanUrl(anchor.querySelector("span[data-src]")?.getAttribute("data-src")),
      } satisfies MikanSearchResult;
    })
    .filter((result): result is MikanSearchResult => result !== null);
}

export function parseMikanBangumiHtml(html: string, mikanId: number): MikanBangumiDetail {
  const root = parse(html);
  const titleNode = root.querySelector("p.bangumi-title");

  if (!titleNode) {
    throw new Error("Mikan bangumi title node not found");
  }

  const subgroupNodes = root.querySelectorAll("div.subgroup-text");
  const subgroups = subgroupNodes
    .map((node) => {
      const subgroupId = Number(node.getAttribute("id") || "0");
      const publishGroupLink = node
        .querySelectorAll("a")
        .find((anchor) => (anchor.getAttribute("href") || "").startsWith("/Home/PublishGroup/"));
      const rssLink = node
        .querySelectorAll("a")
        .find((anchor) => (anchor.getAttribute("href") || "").includes("/RSS/Bangumi?"));

      if (!subgroupId || !publishGroupLink) {
        return null;
      }

      const episodes = extractEpisodes(findNextEpisodeTable(node));

      return {
        id: subgroupId,
        name: publishGroupLink.text.trim(),
        rssUrl:
          toAbsoluteMikanUrl(rssLink?.getAttribute("href")) ||
          `${MIKAN_BASE_URL}/RSS/Bangumi?bangumiId=${mikanId}&subgroupid=${subgroupId}`,
        episodes,
      } satisfies MikanSubgroup;
    })
    .filter((item): item is MikanSubgroup => item !== null);

  return {
    mikanId,
    title: titleNode.text.trim(),
    posterUrl: parseBackgroundImage(root.querySelector("div.bangumi-poster")?.getAttribute("style")),
    bangumiTvUrl: toAbsoluteMikanUrl(root.querySelector("a.w-other-c[href*='bgm.tv/subject/']")?.getAttribute("href")),
    mikanRssUrl: toAbsoluteMikanUrl(titleNode.querySelector("a.mikan-rss")?.getAttribute("href")),
    summary: root.querySelector("div.bangumi-intro")?.text.trim() || null,
    subgroups,
  };
}

export async function searchMikan(query: string): Promise<MikanSearchResult[]> {
  const keyword = query.trim();
  if (!keyword) {
    return [];
  }

  const url = `${MIKAN_BASE_URL}/Home/Search?searchstr=${encodeURIComponent(keyword)}`;
  const response = await fetchMikan(url);

  if (!response.ok) {
    throw new MikanRequestError(`Mikan search failed: ${response.status}`, response.status);
  }

  const html = await response.text();

  try {
    const results = parseMikanSearchHtml(html);
    logger.info("Mikan search parsed", { query: keyword, count: results.length });
    return results;
  } catch (error) {
    logger.warn("Mikan search parsing failed", { query: keyword, error: String(error) });
    return [];
  }
}

export async function getMikanBangumi(mikanId: number): Promise<MikanBangumiDetail | null> {
  const url = `${MIKAN_BASE_URL}/Home/Bangumi/${mikanId}`;
  const response = await fetchMikan(url);

  if (response.status === 404) {
    logger.warn("Mikan bangumi not found", { mikanId });
    return null;
  }

  if (!response.ok) {
    throw new MikanRequestError(`Mikan bangumi failed: ${response.status}`, response.status);
  }

  const html = await response.text();
  return parseMikanBangumiHtml(html, mikanId);
}