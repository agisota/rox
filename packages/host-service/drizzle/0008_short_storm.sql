CREATE TABLE `sync_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`dedup_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_outbox_dedup_key_unique` ON `sync_outbox` (`dedup_key`);--> statement-breakpoint
CREATE INDEX `sync_outbox_next_attempt_at_idx` ON `sync_outbox` (`next_attempt_at`);--> statement-breakpoint
ALTER TABLE `host_settings` ADD `projects_base_dir` text;--> statement-breakpoint
ALTER TABLE `host_settings` ADD `local_first_create` integer;--> statement-breakpoint
ALTER TABLE `host_settings` ADD `auto_init_git` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `cloud_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `sync_state` text DEFAULT 'synced' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `cloud_id` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `sync_state` text DEFAULT 'synced' NOT NULL;