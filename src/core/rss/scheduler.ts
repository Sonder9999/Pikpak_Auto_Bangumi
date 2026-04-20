import { createLogger } from "../logger.ts";
import { getEnabledSources, recordSuccess, recordFailure } from "./source-crud.ts";
import { fetchRssFeed } from "./feed-parser.ts";
import { storeNewItems, type StoredRssItem } from "./item-store.ts";
import { getConfig } from "../config/config.ts";

const logger = createLogger("rss-scheduler");

type NewItemHandler = (items: StoredRssItem[]) => void | Promise<void>;

interface SchedulerState {
  timers: Map<number, ReturnType<typeof setInterval>>;
  running: boolean;
  onNewItems: NewItemHandler | null;
}

const state: SchedulerState = {
  timers: new Map(),
  running: false,
  onNewItems: null,
};

export function setNewItemHandler(handler: NewItemHandler) {
  state.onNewItems = handler;
}

async function pollSource(sourceId: number, sourceUrl: string, sourceName: string) {
  const config = getConfig();
  try {
    logger.info("Polling RSS source", { sourceId, name: sourceName });
    const feedItems = await fetchRssFeed(sourceUrl, config.rss.requestTimeoutMs);
    const newItems = storeNewItems(sourceId, feedItems);
    recordSuccess(sourceId);

    if (newItems.length > 0 && state.onNewItems) {
      await state.onNewItems(newItems);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordFailure(sourceId, message);
    logger.error("RSS poll failed", { sourceId, name: sourceName, error: message });
  }
}

export function startScheduler() {
  if (state.running) {
    logger.warn("Scheduler already running");
    return;
  }

  state.running = true;
  const sources = getEnabledSources();

  for (const source of sources) {
    // Poll immediately, then on interval
    pollSource(source.id, source.url, source.name);

    const timer = setInterval(
      () => pollSource(source.id, source.url, source.name),
      source.pollIntervalMs
    );
    state.timers.set(source.id, timer);
  }

  logger.info("RSS scheduler started", { sourceCount: sources.length });
}

export function stopScheduler() {
  for (const [id, timer] of state.timers) {
    clearInterval(timer);
    state.timers.delete(id);
  }
  state.running = false;
  logger.info("RSS scheduler stopped");
}

export function refreshScheduler() {
  stopScheduler();
  startScheduler();
}

export function isSchedulerRunning(): boolean {
  return state.running;
}
