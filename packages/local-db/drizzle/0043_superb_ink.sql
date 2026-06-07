CREATE TABLE `execution_circuits` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`spec_json` text NOT NULL,
	`validation_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `execution_circuits_task_id_idx` ON `execution_circuits` (`task_id`);--> statement-breakpoint
CREATE INDEX `execution_circuits_status_idx` ON `execution_circuits` (`status`);--> statement-breakpoint
CREATE TABLE `experience_trace_events` (
	`id` text PRIMARY KEY NOT NULL,
	`transition_run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`payload_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`transition_run_id`) REFERENCES `transition_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `experience_trace_events_transition_run_id_idx` ON `experience_trace_events` (`transition_run_id`);--> statement-breakpoint
CREATE INDEX `experience_trace_events_sequence_idx` ON `experience_trace_events` (`sequence`);--> statement-breakpoint
CREATE TABLE `transition_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`circuit_id` text NOT NULL,
	`transition_id` text NOT NULL,
	`status` text NOT NULL,
	`workspace_id` text,
	`agent_run_id` text,
	`runtime_snapshot_json` text NOT NULL,
	`monad_snapshot_json` text NOT NULL,
	`output_json` text,
	`validation_result_json` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`circuit_id`) REFERENCES `execution_circuits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transition_runs_circuit_id_idx` ON `transition_runs` (`circuit_id`);--> statement-breakpoint
CREATE INDEX `transition_runs_transition_id_idx` ON `transition_runs` (`transition_id`);--> statement-breakpoint
CREATE INDEX `transition_runs_status_idx` ON `transition_runs` (`status`);