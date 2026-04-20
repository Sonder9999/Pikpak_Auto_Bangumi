import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// RSS Sources
export const rssSources = sqliteTable("rss_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  pollIntervalMs: integer("poll_interval_ms").notNull().default(300000),
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
