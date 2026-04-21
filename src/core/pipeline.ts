import { createLogger } from "./logger.ts";
import { getSubject, initBangumi } from "./bangumi/index.ts";
import { loadConfig, getConfig } from "./config/config.ts";
import { getDb } from "./db/connection.ts";
import { getPikPakClient } from "./pikpak/client.ts";
import { setNewItemHandler, startScheduler, stopScheduler } from "./rss/scheduler.ts";
import { applyFilters } from "./filter/filter-engine.ts";
import { submitDownload, pollTaskStatuses } from "./pikpak/task-manager.ts";
import { processRenames, renderTemplate } from "./renamer/renamer.ts";
import { setPostRenameHandler } from "./renamer/renamer.ts";
import { downloadDanmaku } from "./danmaku/service.ts";
import { setGlobalLogLevel } from "./logger.ts";
import { rawParser } from "./parser/raw-parser.ts";
import { getSourceById } from "./rss/source-crud.ts";
import { searchAnime, initTmdb } from "./tmdb/index.ts";
import type { StoredRssItem } from "./rss/item-store.ts";
import type { PikPakClient } from "./pikpak/client.ts";
import type { RenameResult } from "./renamer/renamer.ts";

const logger = createLogger("pipeline");

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Initialize core services: config, DB, PikPak auth */
export async function initCore(configPath?: string): Promise<boolean> {
  const config = loadConfig(configPath);
  setGlobalLogLevel(config.general.logLevel);

  logger.info("Initializing core", { mode: config.general.mode, dbPath: config.general.dbPath });

  // Initialize database
  getDb(config.general.dbPath);

  // Authenticate PikPak
  const client = getPikPakClient({
    tokenPath: config.pikpak.tokenCachePath,
    deviceId: config.pikpak.deviceId || undefined,
    refreshToken: config.pikpak.refreshToken || undefined,
  });

  const authenticated = await client.authenticate(
    config.pikpak.username || undefined,
    config.pikpak.password || undefined
  );

  if (!authenticated) {
    logger.error("PikPak authentication failed — downloads will not work");
  } else {
    logger.info("PikPak authenticated", { mode: client.getMode() });
  }

  // Initialize TMDB if configured
  const tmdbCfg = config.tmdb;
  if (tmdbCfg.apiKey) {
    initTmdb(tmdbCfg.apiKey, tmdbCfg.language);
    logger.info("TMDB initialized", { language: tmdbCfg.language });
  } else {
    logger.info("TMDB not configured — advance mode will fall back to parsed title");
  }

  initBangumi(config.bangumi.token);

  return authenticated;
}

/** Handle new RSS items: filter → download */
async function handleNewItems(items: StoredRssItem[]): Promise<void> {
  const config = getConfig();
  const client = getPikPakClient();

  // Apply filters per source
  const bySource = new Map<number, StoredRssItem[]>();
  for (const item of items.filter((it) => it.magnetUrl || it.torrentUrl || it.link)) {
    const list = bySource.get(item.sourceId) ?? [];
    list.push(item);
    bySource.set(item.sourceId, list);
  }

  const passedTitles = new Set<string>();
  for (const [sourceId, sourceItems] of bySource) {
    const filterableItems = sourceItems.map((item) => ({ title: item.title, sourceId: item.sourceId }));
    const passed = applyFilters(filterableItems, sourceId);
    for (const p of passed) passedTitles.add(p.title);
  }

  const toDownload = items.filter(
    (item) => passedTitles.has(item.title) && (item.magnetUrl || item.torrentUrl || item.link)
  );

  if (toDownload.length === 0) {
    logger.debug("No items passed filtering", { total: items.length });
    return;
  }

  // Ensure base path exists
  const baseId = await client.ensurePath(config.pikpak.cloudBasePath);

  for (const item of toDownload) {
    const url = item.magnetUrl ?? item.torrentUrl ?? item.link!;
    const source = getSourceById(item.sourceId);

    // Parse episode info to determine per-anime subfolder
    const ep = rawParser(item.title);
    let parentId = baseId;

    if (ep && config.rename.enabled && config.rename.method !== "none") {
      let title = ep.nameEn ?? ep.nameZh ?? ep.nameJp ?? "Unknown";
      const season = String(ep.season).padStart(2, "0");
      let year = ep.year ?? "";

      // Bangumi metadata takes precedence when the RSS source is bound to a subject.
      if (config.rename.method === "advance") {
        let resolvedByBangumi = false;

        if (source?.bangumiSubjectId) {
          const subject = await getSubject(source.bangumiSubjectId);
          const bangumiTitle = subject?.nameCn?.trim() || subject?.name?.trim() || null;

          if (subject && bangumiTitle) {
            title = bangumiTitle;
            year = subject.year ?? "";
            ep.year = subject.year;
            resolvedByBangumi = true;
            logger.info("Bangumi metadata applied", {
              sourceId: item.sourceId,
              subjectId: source.bangumiSubjectId,
              official: title,
              year,
            });
          }
        }

        if (!resolvedByBangumi) {
          const tmdb = await searchAnime(title);
          if (tmdb) {
            title = tmdb.officialTitle;
            year = tmdb.year ?? "";
            ep.year = tmdb.year;
            logger.info("TMDB metadata applied", { original: ep.nameEn, official: title, year });
          } else {
            logger.warn("TMDB lookup failed, using parsed title", { title });
          }
        }
      }

      const folderPath = config.rename.folderPattern
        .replace(/\{title\}/g, title)
        .replace(/\{season\}/g, season)
        .replace(/\{year\}/g, year)
        .replace(/\s*\(\)\s*/g, ""); // Remove empty parentheses if year is missing

      // Create subfolder path under base (e.g., "Kuroneko to Majo no Kyoushitsu/Season 01")
      const subParts = folderPath.split("/").filter((p) => p.length > 0);
      let currentId = baseId;
      for (const part of subParts) {
        currentId = await client.ensureFolder(currentId, part);
      }
      parentId = currentId;
      logger.debug("Per-anime folder resolved", { title, season, folderPath, parentId });
    }

    await submitDownload(client, url, parentId, item.id, item.title);
  }

  logger.info("Download batch processed", { submitted: toDownload.length });
}

/** Start the main processing loop */
export function startPipeline(): void {
  const client = getPikPakClient();

  // Set RSS new-item handler
  setNewItemHandler(handleNewItems);
  startScheduler();

  // Register danmaku post-rename handler
  const config = getConfig();
  if (config.dandanplay.enabled) {
    setPostRenameHandler(async (pikpakClient: PikPakClient, result: RenameResult) => {
      const title = result.parsedEpisode.nameEn ?? result.parsedEpisode.nameZh ?? result.parsedEpisode.nameJp;
      if (!title) {
        logger.debug("No anime title for danmaku search, skipping");
        return;
      }
      await downloadDanmaku(pikpakClient, {
        animeTitle: title,
        episode: result.parsedEpisode.episode,
        parentFolderId: result.parentFolderId,
        videoFileName: result.renamedName,
      });
    });
    logger.info("Danmaku post-rename handler registered");
  }

  // Poll task statuses and trigger renames periodically
  pollTimer = setInterval(async () => {
    try {
      await pollTaskStatuses(client);
      await processRenames(client);
    } catch (err) {
      logger.error("Pipeline poll error", { error: String(err) });
    }
  }, 30_000); // every 30s

  logger.info("Pipeline started");
}

/** Stop the pipeline */
export function stopPipeline(): void {
  stopScheduler();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  logger.info("Pipeline stopped");
}
