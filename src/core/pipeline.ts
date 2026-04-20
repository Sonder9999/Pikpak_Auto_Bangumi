import { createLogger } from "./logger.ts";
import { loadConfig, getConfig } from "./config/config.ts";
import { getDb } from "./db/connection.ts";
import { getPikPakClient } from "./pikpak/client.ts";
import { setNewItemHandler, startScheduler, stopScheduler } from "./rss/scheduler.ts";
import { applyFilters } from "./filter/filter-engine.ts";
import { submitDownload, pollTaskStatuses } from "./pikpak/task-manager.ts";
import { processRenames } from "./renamer/renamer.ts";
import { setGlobalLogLevel } from "./logger.ts";
import type { StoredRssItem } from "./rss/item-store.ts";

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

  return authenticated;
}

/** Handle new RSS items: filter → download */
async function handleNewItems(items: StoredRssItem[]): Promise<void> {
  const config = getConfig();
  const client = getPikPakClient();

  // Apply filters
  const filterableItems = items
    .filter((item) => item.magnetUrl || item.link)
    .map((item) => ({ title: item.title, sourceId: item.sourceId }));

  const passed = applyFilters(filterableItems);
  const passedTitles = new Set(passed.map((p) => p.title));

  const toDownload = items.filter(
    (item) => passedTitles.has(item.title) && (item.magnetUrl || item.link)
  );

  if (toDownload.length === 0) {
    logger.debug("No items passed filtering", { total: items.length });
    return;
  }

  // Ensure target folder exists
  const parentId = await client.ensurePath(config.pikpak.cloudBasePath);

  for (const item of toDownload) {
    const url = item.magnetUrl ?? item.link!;
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
