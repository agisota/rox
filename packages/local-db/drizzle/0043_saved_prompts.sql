CREATE TABLE `saved_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saved_prompts_updated_at_idx` ON `saved_prompts` (`updated_at`);