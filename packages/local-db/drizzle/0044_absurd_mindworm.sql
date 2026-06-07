DROP INDEX `execution_circuits_task_id_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `execution_circuits_task_id_unique_idx` ON `execution_circuits` (`task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experience_trace_events_run_sequence_unique_idx` ON `experience_trace_events` (`transition_run_id`,`sequence`);