import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// RSS Sources
export const rssSources = sqliteTable("rss_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  pollIntervalMs: integer("poll_interval_ms").notNull().default(300000),
  bangumiSubjectId: integer("bangumi_subject_id"),
  mikanBangumiId: integer("mikan_bangumi_id"),
  lastSuccessAt: text("last_success_at"),
  lastErrorAt: text("last_error_at"),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// RSS Items (processed entries)
export const rssItems = sqliteTable("rss_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceId: integer("source_id").notNull().references(() => rssSources.id, { onDelete: "cascade" }),
  guid: text("guid").notNull(),
  title: text("title").notNull(),
  link: text("link"),
  magnetUrl: text("magnet_url"),
  torrentUrl: text("torrent_url"),
  homepage: text("homepage"),
  processed: integer("processed", { mode: "boolean" }).notNull().default(false),
  replayStatus: text("replay_status", { enum: ["pending", "filtered", "submitted", "duplicate", "error"] }).notNull().default("pending"),
  decisionReason: text("decision_reason"),
  linkedTaskId: integer("linked_task_id").references(() => pikpakTasks.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Filter Rules
export const filterRules = sqliteTable("filter_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pattern: text("pattern").notNull(),
  mode: text("mode", { enum: ["include", "exclude"] }).notNull(),
  sourceId: integer("source_id").references(() => rssSources.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// PikPak Tasks
export const pikpakTasks = sqliteTable("pikpak_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rssItemId: integer("rss_item_id").references(() => rssItems.id),
  magnetUrl: text("magnet_url").notNull(),
  pikpakTaskId: text("pikpak_task_id"),
  pikpakFileId: text("pikpak_file_id"),
  cloudPath: text("cloud_path"),
  status: text("status", { enum: ["pending", "downloading", "complete", "error", "renamed"] }).notNull().default("pending"),
  originalName: text("original_name"),
  renamedName: text("renamed_name"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Episode Delivery State
export const episodeDeliveryState = sqliteTable("episode_delivery_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  normalizedTitle: text("normalized_title").notNull(),
  seasonNumber: integer("season_number").notNull(),
  episodeNumber: integer("episode_number").notNull(),
  cloudPath: text("cloud_path").notNull(),
  videoStatus: text("video_status", { enum: ["delivered", "missing"] }).notNull().default("missing"),
  videoFileName: text("video_file_name"),
  videoFileId: text("video_file_id"),
  videoVerifiedAt: text("video_verified_at"),
  danmakuStatus: text("danmaku_status", { enum: ["pending", "fresh", "missing", "error"] }).notNull().default("pending"),
  danmakuUploadedAt: text("danmaku_uploaded_at"),
  danmakuCheckedAt: text("danmaku_checked_at"),
  xmlFileName: text("xml_file_name"),
  xmlFileId: text("xml_file_id"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Danmaku Cache
export const danmakuCache = sqliteTable("danmaku_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  episodeId: integer("episode_id").notNull(),
  animeTitle: text("anime_title").notNull(),
  episodeTitle: text("episode_title"),
  pikpakFileId: text("pikpak_file_id"),
  xmlFileId: text("xml_file_id"),
  downloadedAt: text("downloaded_at").notNull().$defaultFn(() => new Date().toISOString()),
});
