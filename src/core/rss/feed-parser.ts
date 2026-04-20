import { XMLParser } from "fast-xml-parser";
import { createLogger } from "../logger.ts";

const logger = createLogger("rss");

export interface RssFeedItem {
  title: string;
  guid: string;
  link: string | null;
  magnetUrl: string | null;
  torrentUrl: string | null;
  homepage: string | null;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export async function fetchRssFeed(
  url: string,
  timeoutMs = 30000
): Promise<RssFeedItem[]> {
  logger.info("Fetching RSS feed", { url });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PikPak-Auto-Bangumi/0.1.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    return parseRssXml(xml);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseRssXml(xml: string): RssFeedItem[] {
  const parsed = xmlParser.parse(xml);
  const items: RssFeedItem[] = [];

  const channel = parsed?.rss?.channel;
  if (!channel) {
    logger.warn("No channel found in RSS XML");
    return items;
  }

  let rawItems = channel.item;
  if (!rawItems) return items;
  if (!Array.isArray(rawItems)) rawItems = [rawItems];

  for (const item of rawItems) {
    const title = item.title ?? "";
    const guid = item.guid?.["#text"] ?? item.guid ?? item.link ?? title;
    const link = item.link ?? null;
    const homepage = item.link ?? null;

    let magnetUrl: string | null = null;
    let torrentUrl: string | null = null;

    // Check enclosure for torrent/magnet
    const enclosure = item.enclosure;
    if (enclosure) {
      const enclosureUrl = enclosure["@_url"] ?? "";
      if (enclosureUrl.startsWith("magnet:")) {
        magnetUrl = enclosureUrl;
      } else if (
        enclosureUrl.endsWith(".torrent") ||
        enclosure["@_type"] === "application/x-bittorrent"
      ) {
        torrentUrl = enclosureUrl;
      }
    }

    // Check link for magnet
    if (!magnetUrl && typeof link === "string" && link.startsWith("magnet:")) {
      magnetUrl = link;
    }

    items.push({
      title: String(title),
      guid: String(guid),
      link,
      magnetUrl,
      torrentUrl,
      homepage,
    });
  }

  logger.info("RSS feed parsed", { itemCount: items.length });
  return items;
}
