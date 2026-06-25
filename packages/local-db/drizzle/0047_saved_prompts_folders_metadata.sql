ALTER TABLE `saved_prompts` ADD `folder` text;--> statement-breakpoint
ALTER TABLE `saved_prompts` ADD `tags` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `saved_prompts` ADD `is_favorite` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `saved_prompts` ADD `copy_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `saved_prompts` ADD `last_used_at` integer;--> statement-breakpoint
ALTER TABLE `saved_prompts` ADD `position` integer;--> statement-breakpoint
CREATE INDEX `saved_prompts_folder_idx` ON `saved_prompts` (`folder`);--> statement-breakpoint
CREATE INDEX `saved_prompts_is_favorite_idx` ON `saved_prompts` (`is_favorite`);--> statement-breakpoint
CREATE INDEX `saved_prompts_copy_count_idx` ON `saved_prompts` (`copy_count`);--> statement-breakpoint
CREATE INDEX `saved_prompts_position_idx` ON `saved_prompts` (`position`);
