CREATE TABLE `browser_history_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`favicon_url` text,
	`source` text DEFAULT 'native' NOT NULL,
	`visited_at` integer NOT NULL,
	`imported_at` integer,
	`uploaded_at` integer
);
--> statement-breakpoint
CREATE INDEX `browser_history_entries_workspace_idx` ON `browser_history_entries` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `browser_history_entries_visited_at_idx` ON `browser_history_entries` (`visited_at`);--> statement-breakpoint
CREATE INDEX `browser_history_entries_uploaded_at_idx` ON `browser_history_entries` (`uploaded_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `browser_history_entries_workspace_url_visited_unq` ON `browser_history_entries` (`workspace_id`,`url`,`visited_at`);--> statement-breakpoint
CREATE TABLE `browser_data_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`accepted` integer DEFAULT false NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`last_uploaded_at` integer,
	`sources` text DEFAULT '[]' NOT NULL
);
