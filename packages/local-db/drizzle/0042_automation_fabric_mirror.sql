CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_id` text,
	`step_id` text,
	`status` text NOT NULL,
	`title` text,
	`payload` text,
	`reason` text,
	`requested_by_user_id` text,
	`resolved_by_user_id` text,
	`resolved_at` text,
	`expires_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `approval_requests_org_idx` ON `approval_requests` (`organization_id`);--> statement-breakpoint
CREATE INDEX `approval_requests_run_idx` ON `approval_requests` (`run_id`);--> statement-breakpoint
CREATE INDEX `approval_requests_status_idx` ON `approval_requests` (`status`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`v2_project_id` text,
	`run_id` text,
	`kind` text NOT NULL,
	`title` text,
	`body` text,
	`markdown` text,
	`blob_pathname` text,
	`media_type` text,
	`created_by_user_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `artifacts_org_idx` ON `artifacts` (`organization_id`);--> statement-breakpoint
CREATE INDEX `artifacts_run_idx` ON `artifacts` (`run_id`);--> statement-breakpoint
CREATE TABLE `object_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `object_relations_source_idx` ON `object_relations` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `object_relations_target_idx` ON `object_relations` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `skill_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`surface` text NOT NULL,
	`object_type` text,
	`placement` text,
	`label` text,
	`enabled` integer NOT NULL,
	`config` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `skill_bindings_skill_idx` ON `skill_bindings` (`skill_id`);--> statement-breakpoint
CREATE INDEX `skill_bindings_surface_idx` ON `skill_bindings` (`surface`,`object_type`);--> statement-breakpoint
CREATE TABLE `skill_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`input_schema` text,
	`output_schema` text,
	`workflow_deployment_id` text,
	`legacy_automation_id` text,
	`sim_workflow_external_id` text,
	`run_modes` text,
	`documentation_md` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `skill_versions_skill_idx` ON `skill_versions` (`skill_id`);--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`v2_project_id` text,
	`owner_user_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`visibility` text NOT NULL,
	`current_version_id` text,
	`icon` text,
	`category` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `skills_org_idx` ON `skills` (`organization_id`);--> statement-breakpoint
CREATE INDEX `skills_kind_idx` ON `skills` (`kind`);--> statement-breakpoint
CREATE TABLE `workflow_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`v2_project_id` text,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`engine` text NOT NULL,
	`draft_state` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_definitions_org_idx` ON `workflow_definitions` (`organization_id`);--> statement-breakpoint
CREATE INDEX `workflow_definitions_project_idx` ON `workflow_definitions` (`v2_project_id`);--> statement-breakpoint
CREATE TABLE `workflow_run_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`parent_step_id` text,
	`block_id` text NOT NULL,
	`block_type` text NOT NULL,
	`block_name` text,
	`status` text NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`started_at` text,
	`ended_at` text,
	`duration_ms` integer,
	`cost` text
);
--> statement-breakpoint
CREATE INDEX `workflow_run_steps_run_idx` ON `workflow_run_steps` (`run_id`);--> statement-breakpoint
CREATE INDEX `workflow_run_steps_parent_idx` ON `workflow_run_steps` (`parent_step_id`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`v2_project_id` text,
	`workflow_id` text,
	`workflow_version_id` text,
	`skill_id` text,
	`skill_version_id` text,
	`parent_run_id` text,
	`trigger_kind` text NOT NULL,
	`trigger_ref` text,
	`status` text NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`context_pack_id` text,
	`cost` text,
	`started_at` text,
	`ended_at` text,
	`created_by_user_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_runs_org_idx` ON `workflow_runs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `workflow_runs_workflow_idx` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `workflow_runs_skill_idx` ON `workflow_runs` (`skill_id`);--> statement-breakpoint
CREATE INDEX `workflow_runs_parent_idx` ON `workflow_runs` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `workflow_runs_status_idx` ON `workflow_runs` (`status`);