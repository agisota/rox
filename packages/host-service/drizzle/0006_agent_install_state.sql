CREATE TABLE `agent_install_state` (
	`preset_id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'agent' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`version` text,
	`last_error` text,
	`installed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_install_state_status_idx` ON `agent_install_state` (`status`);