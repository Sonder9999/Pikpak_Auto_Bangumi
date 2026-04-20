import { createLogger } from "../logger.ts";
import { getConfig } from "../config/config.ts";
import type { PikPakClient } from "../pikpak/client.ts";
import { getTasksByStatus, updateTaskStatus } from "../pikpak/task-manager.ts";
import { rawParser } from "../parser/raw-parser.ts";
import type { Episode } from "../parser/types.ts";

const logger = createLogger("renamer");

/** Render a rename template with episode metadata */
export function renderTemplate(template: string, ep: Episode, ext: string): string {
  const season = String(ep.season).padStart(2, "0");
  const episode = String(ep.episode).padStart(2, "0");

  return template
    .replace(/\{season\}/g, season)
    .replace(/\{episode\}/g, episode)
    .replace(/\{title\}/g, ep.nameEn ?? ep.nameZh ?? ep.nameJp ?? "Unknown")
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

/** Build the renamed file name from original name using config template */
export function buildRenamedName(originalName: string): string | null {
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

  const ext = getExtension(originalName);
  const template = config.rename.template;
  const renamed = renderTemplate(template, ep, ext);
  logger.debug("Template rendered", { originalName, renamed, template });
  return renamed;
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

    const newName = buildRenamedName(originalName);
    if (!newName) {
      logger.warn("Could not build rename target", { taskId: task.id, originalName });
      updateTaskStatus(task.id, "error", { errorMessage: "Cannot parse metadata for rename" });
      continue;
    }

    const ok = await renameWithRetry(
      client,
      task.pikpakFileId,
      newName,
      config.rename.maxRetries,
      config.rename.retryBaseDelayMs
    );

    if (ok) {
      updateTaskStatus(task.id, "renamed", { renamedName: newName });
      renamed++;
    } else {
      updateTaskStatus(task.id, "error", { errorMessage: `Rename failed: ${newName}` });
    }
  }

  logger.info("Rename batch complete", { total: completeTasks.length, renamed });
  return renamed;
}
