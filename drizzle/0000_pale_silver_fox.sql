CREATE TABLE `filter_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`pattern` text NOT NULL,
	`mode` text NOT NULL,
	`source_id` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `rss_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pikpak_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rss_item_id` integer,
	`magnet_url` text NOT NULL,
	`pikpak_task_id` text,
	`pikpak_file_id` text,
	`cloud_path` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`original_name` text,
	`renamed_name` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`rss_item_id`) REFERENCES `rss_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rss_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`guid` text NOT NULL,
	`title` text NOT NULL,
	`link` text,
	`magnet_url` text,
	`torrent_url` text,
	`homepage` text,
	`processed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `rss_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rss_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`poll_interval_ms` integer DEFAULT 300000 NOT NULL,
	`last_success_at` text,
	`last_error_at` text,
	`last_error` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
