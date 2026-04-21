CREATE TABLE `episode_delivery_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_title` text NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`cloud_path` text NOT NULL,
	`video_status` text DEFAULT 'missing' NOT NULL,
	`video_file_name` text,
	`video_file_id` text,
	`video_verified_at` text,
	`danmaku_status` text DEFAULT 'pending' NOT NULL,
	`danmaku_uploaded_at` text,
	`danmaku_checked_at` text,
	`xml_file_name` text,
	`xml_file_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);