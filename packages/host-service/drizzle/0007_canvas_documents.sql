CREATE TABLE `canvas_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`path` text NOT NULL,
	`node_count` integer DEFAULT 0 NOT NULL,
	`edge_count` integer DEFAULT 0 NOT NULL,
	`group_count` integer DEFAULT 0 NOT NULL,
	`node_types_json` text DEFAULT '{}' NOT NULL,
	`refs_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `canvas_documents_workspace_id_idx` ON `canvas_documents` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `canvas_documents_updated_at_idx` ON `canvas_documents` (`updated_at`);