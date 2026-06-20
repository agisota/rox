ALTER TABLE `settings` ADD `dictation_enabled` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `settings` ADD `ambient_capture_enabled` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `settings` ADD `voice_agent_context` text DEFAULT '';