ALTER TABLE `rss_items` ADD `replay_status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `rss_items` ADD `decision_reason` text;
--> statement-breakpoint
ALTER TABLE `rss_items` ADD `linked_task_id` integer REFERENCES `pikpak_tasks`(`id`);