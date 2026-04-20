CREATE TABLE `danmaku_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`episode_id` integer NOT NULL,
	`anime_title` text NOT NULL,
	`episode_title` text,
	`pikpak_file_id` text,
	`xml_file_id` text,
	`downloaded_at` text NOT NULL
);
