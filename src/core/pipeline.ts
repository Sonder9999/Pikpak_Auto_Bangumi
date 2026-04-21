import { getSubject, initBangumi } from "./bangumi/index.ts";
import { loadConfig, getConfig, resolveConfigPath } from "./config/config.ts";
import { getDb } from "./db/connection.ts";
import { applyFilters } from "./filter/filter-engine.ts";
import { createLogger, setGlobalLogLevel } from "./logger.ts";
import { rawParser } from "./parser/raw-parser.ts";
import { getPikPakClient } from "./pikpak/client.ts";
import { pollTaskStatuses, submitDownload } from "./pikpak/task-manager.ts";
import { processRenames, setPostRenameHandler, type RenameResult } from "./renamer/renamer.ts";
import { getReplayState, getReplayableItems, type ReplayStatus, type StoredRssItem, updateReplayState } from "./rss/item-store.ts";
import { getSourceById } from "./rss/source-crud.ts";
import { setNewItemHandler, startScheduler, stopScheduler } from "./rss/scheduler.ts";
import { backfillDanmakuForRenamedTasks, downloadDanmaku } from "./danmaku/service.ts";
import { searchAnime, initTmdb } from "./tmdb/index.ts";
import type { PikPakClient } from "./pikpak/client.ts";

const logger = createLogger("pipeline");

let pollTimer: ReturnType<typeof setInterval> | null = null;
let submissionQueue: Promise<void> = Promise.resolve();

export interface ReplaySummary {
  scanned: number;
  submitted: number;
  duplicates: number;
  filtered: number;
  errored: number;
  skipped: number;
}

type SubmissionMode = "new" | "replay";

function enqueueSubmissionWork<T>(work: () => Promise<T>): Promise<T> {
  const run = submissionQueue.then(work, work);
  submissionQueue = run.then(() => undefined, () => undefined);
  return run;
}

function isTerminalReplayStatus(status: ReplayStatus | undefined): boolean {
  return status === "submitted" || status === "duplicate";
}

function emptyReplaySummary(): ReplaySummary {
  return {
    scanned: 0,
    submitted: 0,
    duplicates: 0,
    filtered: 0,
    errored: 0,
    skipped: 0,
  };
}

/** Initialize core services: config, DB, PikPak auth */
export async function initCore(configPath?: string): Promise<boolean> {
  const config = loadConfig(configPath);
  setGlobalLogLevel(config.general.logLevel);
  const resolvedDbPath = resolveConfigPath(config.general.dbPath);
  const resolvedTokenPath = resolveConfigPath(config.pikpak.tokenCachePath);

  logger.info("Initializing core", { mode: config.general.mode, dbPath: resolvedDbPath });

  getDb(resolvedDbPath);

  const client = getPikPakClient({
    tokenPath: resolvedTokenPath,
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

async function resolveParentFolderId(client: PikPakClient, item: StoredRssItem, baseId: string): Promise<string> {
  const config = getConfig();
  const source = getSourceById(item.sourceId);
  const ep = rawParser(item.title);
  if (!ep || !config.rename.enabled || config.rename.method === "none") {
    return baseId;
  }

  let title = ep.nameEn ?? ep.nameZh ?? ep.nameJp ?? "Unknown";
  const season = String(ep.season).padStart(2, "0");
  let year = ep.year ?? "";

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
    .replace(/\s*\(\)\s*/g, "");

  const subParts = folderPath.split("/").filter((part) => part.length > 0);
  let currentId = baseId;
  for (const part of subParts) {
    currentId = await client.ensureFolder(currentId, part);
  }

  logger.debug("Per-anime folder resolved", { title, season, folderPath, parentId: currentId });
  return currentId;
}

async function processStoredItems(
  client: PikPakClient,
  items: StoredRssItem[],
  mode: SubmissionMode,
  trigger: string
): Promise<ReplaySummary> {
  const config = getConfig();
  const summary: ReplaySummary = {
    scanned: items.length,
    submitted: 0,
    duplicates: 0,
    filtered: 0,
    errored: 0,
    skipped: 0,
  };

  if (items.length === 0) {
    return summary;
  }

  if (!client.isAuthenticated()) {
    if (mode === "new") {
      for (const item of items) {
        updateReplayState(item.id, "error", { decisionReason: "PikPak client is not authenticated" });
        summary.errored += 1;
      }
    } else {
      logger.info("Replay skipped because PikPak is not authenticated", { trigger, count: items.length });
    }
    return summary;
  }

  const bySource = new Map<number, StoredRssItem[]>();
  for (const item of items) {
    const replayState = getReplayState(item.id);
    if (isTerminalReplayStatus(replayState?.status)) {
      summary.skipped += 1;
      continue;
    }

    if (!item.magnetUrl && !item.torrentUrl && !item.link) {
      updateReplayState(item.id, "error", { decisionReason: "RSS item does not contain a usable download URL" });
      summary.errored += 1;
      continue;
    }

    const list = bySource.get(item.sourceId) ?? [];
    list.push(item);
    bySource.set(item.sourceId, list);
  }

  const passedTitles = new Set<string>();
  for (const [sourceId, sourceItems] of bySource) {
    const filterableItems = sourceItems.map((item) => ({ title: item.title, sourceId: item.sourceId }));
    const passed = applyFilters(filterableItems, sourceId);
    for (const pass of passed) {
      passedTitles.add(pass.title);
    }
  }

  let baseId: string | null = null;

  for (const item of items) {
    const replayState = getReplayState(item.id);
    if (isTerminalReplayStatus(replayState?.status)) {
      summary.skipped += 1;
      continue;
    }

    const url = item.magnetUrl ?? item.torrentUrl ?? item.link;
    if (!url) {
      continue;
    }

    if (!passedTitles.has(item.title)) {
      updateReplayState(item.id, "filtered", { decisionReason: "Item does not match current filter rules" });
      summary.filtered += 1;
      continue;
    }

    try {
      if (!baseId) {
        baseId = await client.ensurePath(config.pikpak.cloudBasePath);
      }

      const parentId = await resolveParentFolderId(client, item, baseId);
      const submission = await submitDownload(client, url, parentId, item.id, item.title);

      if (submission.reason === "submitted") {
        updateReplayState(item.id, "submitted", { linkedTaskId: submission.taskRecord?.id ?? null });
        summary.submitted += 1;
        continue;
      }

      if (submission.reason === "duplicate") {
        updateReplayState(item.id, "duplicate", {
          decisionReason: "Submission URL already exists in tracked PikPak tasks",
          linkedTaskId: submission.taskRecord?.id ?? null,
        });
        summary.duplicates += 1;
        continue;
      }

      updateReplayState(item.id, "error", {
        decisionReason: submission.error ?? "PikPak download submission failed",
        linkedTaskId: submission.taskRecord?.id ?? null,
      });
      summary.errored += 1;
    } catch (error) {
      updateReplayState(item.id, "error", { decisionReason: String(error) });
      summary.errored += 1;
    }
  }

  logger.info("Stored item batch processed", { trigger, mode, ...summary });
  return summary;
}

/** Handle new RSS items: filter → download */
async function handleNewItems(items: StoredRssItem[]): Promise<void> {
  const client = getPikPakClient();
  await enqueueSubmissionWork(() => processStoredItems(client, items, "new", "scheduler-new-items"));
}

export async function replayStoredItems(
  client: PikPakClient = getPikPakClient(),
  options?: { sourceId?: number; trigger?: string }
): Promise<ReplaySummary> {
  if (!client.isAuthenticated()) {
    logger.info("Replay request skipped because PikPak is not authenticated", { trigger: options?.trigger ?? "manual-replay" });
    return emptyReplaySummary();
  }

  const items = getReplayableItems(options?.sourceId);
  if (items.length === 0) {
    return emptyReplaySummary();
  }

  return enqueueSubmissionWork(() => processStoredItems(client, items, "replay", options?.trigger ?? "manual-replay"));
}

/** Start the main processing loop */
export function startPipeline(): void {
  const client = getPikPakClient();
  const config = getConfig();

  setNewItemHandler(handleNewItems);

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
        pikpakFileId: result.pikpakFileId,
      });
    });
    logger.info("Danmaku post-rename handler registered");
  }

  client.setAuthRecoveredHandler(async () => {
    await replayStoredItems(client, { trigger: "auth-recovered" });
    if (config.dandanplay.enabled) {
      await backfillDanmakuForRenamedTasks(client);
    }
  });

  if (client.isAuthenticated()) {
    void replayStoredItems(client, { trigger: "startup" }).catch((error) => {
      logger.error("Startup replay failed", { error: String(error) });
    });

    if (config.dandanplay.enabled) {
      void backfillDanmakuForRenamedTasks(client).catch((error) => {
        logger.warn("Startup danmaku backfill failed", { error: String(error) });
      });
    }
  }

  startScheduler();

  pollTimer = setInterval(async () => {
    try {
      await pollTaskStatuses(client);
      await processRenames(client);
      if (config.dandanplay.enabled) {
        await backfillDanmakuForRenamedTasks(client);
      }
    } catch (err) {
      logger.error("Pipeline poll error", { error: String(err) });
    }
  }, 30_000);

  logger.info("Pipeline started");
}

/** Stop the pipeline */
export function stopPipeline(): void {
  stopScheduler();
  getPikPakClient().setAuthRecoveredHandler(null);
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  logger.info("Pipeline stopped");
}
