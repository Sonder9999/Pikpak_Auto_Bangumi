import { createLogger } from "../logger.ts";
import { getConfig } from "../config/config.ts";
import type { PikPakClient } from "../pikpak/client.ts";
import { getTasksByStatus, updateTaskStatus } from "../pikpak/task-manager.ts";
import { rawParser } from "../parser/raw-parser.ts";
import { getSubject } from "../bangumi/index.ts";
import { getSourceByRssItemId } from "../rss/source-crud.ts";
import { searchAnime } from "../tmdb/index.ts";
import type { Episode } from "../parser/types.ts";

const logger = createLogger("renamer");

/** Rename result passed to post-rename hooks */
export interface RenameResult {
  taskId: number;
  pikpakFileId: string;
  parentFolderId: string;
  renamedName: string;
  parsedEpisode: Episode;
}

/** Post-rename callback type */
export type PostRenameHandler = (client: PikPakClient, result: RenameResult) => Promise<void>;

export interface BuildRenameOptions {
  bangumiSubjectId?: number | null;
}

let _postRenameHandler: PostRenameHandler | null = null;

/** Register a callback to be invoked after each successful rename */
export function setPostRenameHandler(handler: PostRenameHandler | null): void {
  _postRenameHandler = handler;
}

/** Render a rename template with episode metadata */
export function renderTemplate(template: string, ep: Episode, ext: string): string {
  const season = String(ep.season).padStart(2, "0");
  const episode = String(ep.episode).padStart(2, "0");

  return template
    .replace(/\{season\}/g, season)
    .replace(/\{episode\}/g, episode)
    .replace(/\{title\}/g, ep.nameEn ?? ep.nameZh ?? ep.nameJp ?? "Unknown")
    .replace(/\{year\}/g, ep.year ?? "")
    .replace(/\{group\}/g, ep.group ?? "")
    .replace(/\{resolution\}/g, ep.resolution ?? "")
    .replace(/\{source\}/g, ep.source ?? "")
    .replace(/\{ext\}/g, ext);
}

/** Extract file extension from name */
function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1 || dot === 0) return "";
  return fileName.slice(dot + 1);
}

/** Build the renamed file name from original name using config template. Also returns parsed episode. */
export async function buildRenamedName(
  originalName: string,
  options: BuildRenameOptions = {}
): Promise<{ name: string; episode: Episode } | null> {
  const config = getConfig();
  const ep = rawParser(originalName);
  if (!ep || ep.episode <= 0) {
    logger.warn("Cannot parse episode metadata for rename", { originalName });
    return null;
  }

  // Default season=1 if not found
  if (ep.season <= 0) {
    ep.season = 1;
  }

  // Bangumi metadata takes precedence when a source is explicitly bound.
  if (config.rename.method === "advance") {
    let resolvedByBangumi = false;

    if (options.bangumiSubjectId) {
      const subject = await getSubject(options.bangumiSubjectId);
      const bangumiTitle = subject?.nameCn?.trim() || subject?.name?.trim() || null;

      if (subject && bangumiTitle) {
        ep.nameEn = bangumiTitle;
        ep.nameZh = subject.nameCn ?? ep.nameZh ?? null;
        ep.nameJp = subject.name ?? ep.nameJp ?? null;
        ep.year = subject.year;
        resolvedByBangumi = true;
        logger.info("Bangumi metadata applied for rename", {
          subjectId: options.bangumiSubjectId,
          title: bangumiTitle,
          year: subject.year,
        });
      }
    }

    if (!resolvedByBangumi) {
      const parsedTitle = ep.nameEn ?? ep.nameZh ?? ep.nameJp ?? "Unknown";
      const tmdb = await searchAnime(parsedTitle);
      if (tmdb) {
        ep.nameEn = tmdb.officialTitle;
        ep.year = tmdb.year;
      }
    }
  }

  const ext = getExtension(originalName);
  const template = config.rename.template;
  const renamed = renderTemplate(template, ep, ext);
  logger.debug("Template rendered", { originalName, renamed, template });
  return { name: renamed, episode: ep };
}

/** Rename a single file on PikPak with retry logic */
async function renameWithRetry(
  client: PikPakClient,
  fileId: string,
  newName: string,
  maxRetries: number,
  baseDelayMs: number
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.info("Rename attempt", { fileId, newName, attempt, maxRetries });
    const result = await client.renameFile(fileId, newName);
    if (result) {
      logger.info("Rename succeeded", { fileId, newName, attempt });
      return true;
    }
    if (attempt < maxRetries) {
      const delay = baseDelayMs * attempt;
      logger.warn("Rename failed, retrying", { fileId, attempt, nextDelayMs: delay });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  logger.error("Rename failed after all retries", { fileId, newName, maxRetries });
  return false;
}

/** Process all completed tasks that need renaming */
export async function processRenames(client: PikPakClient): Promise<number> {
  const config = getConfig();
  if (!config.rename.enabled) {
    logger.debug("Rename disabled in config");
    return 0;
  }

  const completeTasks = getTasksByStatus("complete");
  if (completeTasks.length === 0) return 0;

  logger.info("Processing renames", { count: completeTasks.length });
  let renamed = 0;

  for (const task of completeTasks) {
    if (!task.pikpakFileId) {
      logger.warn("Task has no file ID, skipping rename", { taskId: task.id });
      continue;
    }

    // Get file details to know original name
    const originalName = task.originalName;
    if (!originalName) {
      logger.warn("Task has no original name, skipping rename", { taskId: task.id });
      continue;
    }

    const source = task.rssItemId ? getSourceByRssItemId(task.rssItemId) : undefined;
    const renameInfo = await buildRenamedName(originalName, {
      bangumiSubjectId: source?.bangumiSubjectId ?? null,
    });
    if (!renameInfo) {
      logger.warn("Could not build rename target", { taskId: task.id, originalName });
      updateTaskStatus(task.id, "error", { errorMessage: "Cannot parse metadata for rename" });
      continue;
    }

    const ok = await renameWithRetry(
      client,
      task.pikpakFileId,
      renameInfo.name,
      config.rename.maxRetries,
      config.rename.retryBaseDelayMs
    );

    if (ok) {
      updateTaskStatus(task.id, "renamed", { renamedName: renameInfo.name });
      renamed++;

      // Post-rename hook (e.g., danmaku download)
      if (_postRenameHandler) {
        try {
          await _postRenameHandler(client, {
            taskId: task.id,
            pikpakFileId: task.pikpakFileId,
            parentFolderId: task.cloudPath ?? "",
            renamedName: renameInfo.name,
            parsedEpisode: renameInfo.episode,
          });
        } catch (e) {
          logger.warn("Post-rename handler failed", { taskId: task.id, error: String(e) });
        }
      }
    } else {
      updateTaskStatus(task.id, "error", { errorMessage: `Rename failed: ${renameInfo.name}` });
    }
  }

  logger.info("Rename batch complete", { total: completeTasks.length, renamed });
  return renamed;
}
