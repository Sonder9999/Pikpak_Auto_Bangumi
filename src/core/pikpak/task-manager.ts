import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection.ts";
import { pikpakTasks } from "../db/schema.ts";
import { createLogger } from "../logger.ts";
import { PikPakClient } from "./client.ts";

const logger = createLogger("pikpak-task");

/** Check if a magnet URL was already submitted */
export function isDuplicateSubmission(magnetUrl: string): boolean {
  const db = getDb();
  const existing = db
    .select()
    .from(pikpakTasks)
    .where(
      and(
        eq(pikpakTasks.magnetUrl, magnetUrl),
        // Not in error state (allow retry of failed tasks)
        eq(pikpakTasks.status, "pending")
      )
    )
    .get();

  if (!existing) {
    // Also check active downloads
    const downloading = db
      .select()
      .from(pikpakTasks)
      .where(
        and(
          eq(pikpakTasks.magnetUrl, magnetUrl),
          eq(pikpakTasks.status, "downloading")
        )
      )
      .get();

    if (!downloading) {
      // Check completed
      const complete = db
        .select()
        .from(pikpakTasks)
        .where(
          and(
            eq(pikpakTasks.magnetUrl, magnetUrl),
            eq(pikpakTasks.status, "complete")
          )
        )
        .get();

      if (!complete) {
        const renamed = db
          .select()
          .from(pikpakTasks)
          .where(
            and(
              eq(pikpakTasks.magnetUrl, magnetUrl),
              eq(pikpakTasks.status, "renamed")
            )
          )
          .get();
        return !!renamed;
      }
      return true;
    }
    return true;
  }
  return true;
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
): Promise<{ taskRecord: ReturnType<typeof createTaskRecord>; submitted: boolean }> {
  // Check duplicates
  if (isDuplicateSubmission(magnetUrl)) {
    logger.info("Skipping duplicate magnet", { magnetUrl: magnetUrl.slice(0, 60) });
    return { taskRecord: null as never, submitted: false };
  }

  // Create DB record
  const taskRecord = createTaskRecord(rssItemId, magnetUrl, originalName);

  try {
    const resp = await client.offlineDownload(magnetUrl, parentFolderId);

    if (resp.error_code) {
      updateTaskStatus(taskRecord.id, "error", { errorMessage: resp.error ?? "Unknown error" });
      logger.error("Offline download failed", { error: resp.error });
      return { taskRecord, submitted: false };
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

    return { taskRecord, submitted: true };
  } catch (e) {
    updateTaskStatus(taskRecord.id, "error", { errorMessage: String(e) });
    logger.error("Download submission exception", { error: String(e) });
    return { taskRecord, submitted: false };
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
