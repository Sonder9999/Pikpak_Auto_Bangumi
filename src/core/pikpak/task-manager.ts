import { eq, and, or } from "drizzle-orm";
import { getDb } from "../db/connection.ts";
import { pikpakTasks } from "../db/schema.ts";
import { createLogger } from "../logger.ts";
import { PikPakClient } from "./client.ts";

const logger = createLogger("pikpak-task");

export type PikPakTaskRecord = typeof pikpakTasks.$inferSelect;

export interface DownloadSubmissionResult {
  taskRecord: PikPakTaskRecord | null;
  submitted: boolean;
  reason: "submitted" | "duplicate" | "error";
  error?: string;
}

export function getTrackedTaskBySubmissionUrl(magnetUrl: string): PikPakTaskRecord | undefined {
  const db = getDb();
  return db
    .select()
    .from(pikpakTasks)
    .where(
      and(
        eq(pikpakTasks.magnetUrl, magnetUrl),
        or(
          eq(pikpakTasks.status, "pending"),
          eq(pikpakTasks.status, "downloading"),
          eq(pikpakTasks.status, "complete"),
          eq(pikpakTasks.status, "renamed")
        )
      )
    )
    .get();
}

/** Check if a magnet URL was already submitted */
export function isDuplicateSubmission(magnetUrl: string): boolean {
  return getTrackedTaskBySubmissionUrl(magnetUrl) !== undefined;
}

/** Create a task record in the database */
export function createTaskRecord(
  rssItemId: number | null,
  magnetUrl: string,
  originalName?: string
) {
  const db = getDb();
  return db
    .insert(pikpakTasks)
    .values({
      rssItemId,
      magnetUrl,
      originalName: originalName ?? null,
      status: "pending",
    })
    .returning()
    .get();
}

/** Update task status */
export function updateTaskStatus(
  taskId: number,
  status: "pending" | "downloading" | "complete" | "error" | "renamed",
  extra?: { pikpakTaskId?: string; pikpakFileId?: string; cloudPath?: string; errorMessage?: string; renamedName?: string; originalName?: string }
) {
  const db = getDb();
  return db
    .update(pikpakTasks)
    .set({
      status,
      ...extra,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(pikpakTasks.id, taskId))
    .returning()
    .get();
}

/** Get all tasks with a given status */
export function getTasksByStatus(status: string) {
  const db = getDb();
  return db
    .select()
    .from(pikpakTasks)
    .where(eq(pikpakTasks.status, status))
    .all();
}

/** Get all tasks */
export function getAllTasks() {
  const db = getDb();
  return db.select().from(pikpakTasks).all();
}

/** Submit a magnet URL to PikPak and track it */
export async function submitDownload(
  client: PikPakClient,
  magnetUrl: string,
  parentFolderId: string,
  rssItemId: number | null,
  originalName?: string
): Promise<DownloadSubmissionResult> {
  // Check duplicates
  const duplicateTask = getTrackedTaskBySubmissionUrl(magnetUrl);
  if (duplicateTask) {
    logger.info("Skipping duplicate magnet", { magnetUrl: magnetUrl.slice(0, 60) });
    return { taskRecord: duplicateTask, submitted: false, reason: "duplicate" };
  }

  // Create DB record
  const taskRecord = createTaskRecord(rssItemId, magnetUrl, originalName);

  try {
    const resp = await client.offlineDownload(magnetUrl, parentFolderId);

    if (resp.error_code) {
      const error = resp.error ?? "Unknown error";
      updateTaskStatus(taskRecord.id, "error", { errorMessage: error });
      logger.error("Offline download failed", { error });
      return { taskRecord, submitted: false, reason: "error", error };
    }

    updateTaskStatus(taskRecord.id, "downloading", {
      pikpakTaskId: resp.task?.id,
      pikpakFileId: resp.task?.file_id ?? resp.file?.id,
      cloudPath: parentFolderId,
    });

    logger.info("Download submitted", {
      taskId: taskRecord.id,
      pikpakTaskId: resp.task?.id,
    });

    return { taskRecord, submitted: true, reason: "submitted" };
  } catch (e) {
    const error = String(e);
    updateTaskStatus(taskRecord.id, "error", { errorMessage: error });
    logger.error("Download submission exception", { error });
    return { taskRecord, submitted: false, reason: "error", error };
  }
}

/** Poll PikPak for task completion status and update DB records */
export async function pollTaskStatuses(client: PikPakClient): Promise<void> {
  const pendingTasks = [
    ...getTasksByStatus("pending"),
    ...getTasksByStatus("downloading"),
  ].filter((t) => t.pikpakTaskId);

  if (pendingTasks.length === 0) return;

  const remoteTasks = await client.listOfflineTasks(100);
  const remoteMap = new Map(remoteTasks.map((t) => [t.id, t]));

  for (const local of pendingTasks) {
    const remote = remoteMap.get(local.pikpakTaskId!);
    if (!remote) continue;

    if (remote.phase === "PHASE_TYPE_COMPLETE") {
      updateTaskStatus(local.id, "complete", {
        pikpakFileId: remote.file_id,
        originalName: remote.file_name,
      });
      logger.info("Task completed", { taskId: local.id, fileName: remote.file_name });
    } else if (remote.phase === "PHASE_TYPE_ERROR") {
      updateTaskStatus(local.id, "error", {
        errorMessage: remote.message ?? "PikPak task failed",
      });
      logger.warn("Task failed", { taskId: local.id, message: remote.message });
    }
    // PHASE_TYPE_RUNNING → no update needed
  }
}
