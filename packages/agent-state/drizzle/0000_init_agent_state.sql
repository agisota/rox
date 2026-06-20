CREATE TABLE `agent_run_coord` (
	`run_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_device` text NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`heartbeat_at` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_run_coord_workspace_idx` ON `agent_run_coord` (`org_id`,`workspace_id`);--> statement-breakpoint
CREATE TABLE `agent_state_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`device_id` text NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_state_entries_org_scope_key_uniq` ON `agent_state_entries` (`org_id`,`scope`,`scope_id`,`key`);--> statement-breakpoint
CREATE INDEX `agent_state_entries_scope_idx` ON `agent_state_entries` (`org_id`,`scope`,`scope_id`);--> statement-breakpoint
CREATE TABLE `host_presence` (
	`device_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`host_kind` text NOT NULL,
	`state` text DEFAULT 'offline' NOT NULL,
	`last_seen_at` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `host_presence_org_idx` ON `host_presence` (`org_id`);