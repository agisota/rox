CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."artifact_kind" AS ENUM('markdown_doc', 'json', 'table', 'file', 'repo_report', 'task_plan', 'pr_plan', 'meeting_summary');--> statement-breakpoint
CREATE TYPE "public"."evaluation_status" AS ENUM('pending', 'running', 'passed', 'failed', 'error');--> statement-breakpoint
CREATE TYPE "public"."object_type" AS ENUM('organization', 'project', 'workspace', 'repo', 'task', 'issue', 'pr', 'chat_session', 'workflow', 'skill', 'run', 'artifact', 'approval', 'policy');--> statement-breakpoint
CREATE TYPE "public"."skill_binding_surface" AS ENUM('object_action', 'command_palette', 'workflow_node', 'agent_tool', 'api', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."skill_kind" AS ENUM('instruction', 'workflow', 'tool', 'agent', 'template');--> statement-breakpoint
CREATE TYPE "public"."skill_status" AS ENUM('draft', 'published', 'deprecated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."skill_visibility" AS ENUM('private', 'project', 'organization', 'public');--> statement-breakpoint
CREATE TYPE "public"."trigger_kind" AS ENUM('manual', 'command', 'chat', 'schedule', 'webhook', 'api', 'mcp', 'repo_connected', 'branch_created', 'commit_pushed', 'pr_opened', 'task_created', 'task_status_changed', 'file_uploaded', 'approval_resolved', 'agent_run_finished');--> statement-breakpoint
CREATE TYPE "public"."workflow_deployment_status" AS ENUM('active', 'inactive', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workflow_engine" AS ENUM('superset', 'sim_sidecar', 'legacy_automation', 'external_tool');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'canceled', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('draft', 'published', 'deprecated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."workflow_step_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'waiting_approval', 'canceled');--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid,
	"step_id" uuid,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"block_id" text,
	"title" text,
	"payload" jsonb,
	"reason" text,
	"requested_by_user_id" uuid,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"run_id" uuid,
	"kind" "artifact_kind" NOT NULL,
	"title" text,
	"body" jsonb,
	"markdown" text,
	"blob_pathname" text,
	"media_type" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"included_object_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retrieval_config" jsonb,
	"redaction_policy" jsonb,
	"token_budget" integer,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suite_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected_output" jsonb,
	"output_schema" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"status" "evaluation_status" NOT NULL,
	"actual_output" jsonb,
	"failures" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"suite_id" uuid NOT NULL,
	"skill_version_id" uuid,
	"status" "evaluation_status" DEFAULT 'pending' NOT NULL,
	"pass_rate" real,
	"total_cases" integer,
	"passed_cases" integer,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "object_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_type" "object_type" NOT NULL,
	"source_id" text NOT NULL,
	"relation_type" text NOT NULL,
	"target_type" "object_type" NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"surface" "skill_binding_surface" NOT NULL,
	"object_type" "object_type",
	"placement" text,
	"label" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"workflow_deployment_id" uuid,
	"legacy_automation_id" uuid,
	"sim_workflow_external_id" text,
	"external_tool_ref" jsonb,
	"documentation_md" text,
	"examples" jsonb,
	"run_modes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_context" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_connections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_secrets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"owner_user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "skill_kind" NOT NULL,
	"status" "skill_status" DEFAULT 'draft' NOT NULL,
	"visibility" "skill_visibility" DEFAULT 'private' NOT NULL,
	"current_version_id" uuid,
	"icon" text,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"engine" "workflow_engine" DEFAULT 'superset' NOT NULL,
	"draft_state" jsonb NOT NULL,
	"status" "workflow_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"status" "workflow_deployment_status" DEFAULT 'active' NOT NULL,
	"deployed_by_user_id" uuid,
	"deployed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"parent_step_id" uuid,
	"block_id" text NOT NULL,
	"block_type" text NOT NULL,
	"block_name" text,
	"status" "workflow_step_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_ms" integer,
	"cost" jsonb
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"workflow_id" uuid,
	"workflow_version_id" uuid,
	"skill_id" uuid,
	"skill_version_id" uuid,
	"parent_run_id" uuid,
	"trigger_kind" "trigger_kind" NOT NULL,
	"trigger_ref" jsonb,
	"status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"context_pack_id" uuid,
	"cost" jsonb,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"state_snapshot" jsonb NOT NULL,
	"validation_snapshot" jsonb,
	"changelog" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_step_id_workflow_run_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."workflow_run_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_packs" ADD CONSTRAINT "context_packs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_packs" ADD CONSTRAINT "context_packs_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_cases" ADD CONSTRAINT "evaluation_cases_suite_id_evaluation_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."evaluation_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_cases" ADD CONSTRAINT "evaluation_cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_run_id_evaluation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_case_id_evaluation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."evaluation_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_suite_id_evaluation_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."evaluation_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_skill_version_id_skill_versions_id_fk" FOREIGN KEY ("skill_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suites" ADD CONSTRAINT "evaluation_suites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suites" ADD CONSTRAINT "evaluation_suites_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suites" ADD CONSTRAINT "evaluation_suites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_relations" ADD CONSTRAINT "object_relations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_bindings" ADD CONSTRAINT "skill_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_bindings" ADD CONSTRAINT "skill_bindings_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_workflow_deployment_id_workflow_deployments_id_fk" FOREIGN KEY ("workflow_deployment_id") REFERENCES "public"."workflow_deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_legacy_automation_id_automations_id_fk" FOREIGN KEY ("legacy_automation_id") REFERENCES "public"."automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_deployed_by_user_id_users_id_fk" FOREIGN KEY ("deployed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_parent_step_id_fk" FOREIGN KEY ("parent_step_id") REFERENCES "public"."workflow_run_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_skill_version_id_skill_versions_id_fk" FOREIGN KEY ("skill_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_context_pack_id_context_packs_id_fk" FOREIGN KEY ("context_pack_id") REFERENCES "public"."context_packs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_parent_run_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_requests_org_idx" ON "approval_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "approval_requests_run_idx" ON "approval_requests" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "approval_requests_status_idx" ON "approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "artifacts_org_idx" ON "artifacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "artifacts_project_idx" ON "artifacts" USING btree ("v2_project_id");--> statement-breakpoint
CREATE INDEX "artifacts_run_idx" ON "artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "context_packs_org_idx" ON "context_packs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "evaluation_cases_suite_idx" ON "evaluation_cases" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "evaluation_results_run_idx" ON "evaluation_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "evaluation_runs_suite_idx" ON "evaluation_runs" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "evaluation_runs_version_idx" ON "evaluation_runs" USING btree ("skill_version_id");--> statement-breakpoint
CREATE INDEX "evaluation_suites_skill_idx" ON "evaluation_suites" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "object_relations_source_idx" ON "object_relations" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "object_relations_target_idx" ON "object_relations" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "object_relations_org_idx" ON "object_relations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "object_relations_edge_uniq" ON "object_relations" USING btree ("source_type","source_id","relation_type","target_type","target_id");--> statement-breakpoint
CREATE INDEX "skill_bindings_skill_idx" ON "skill_bindings" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_bindings_surface_idx" ON "skill_bindings" USING btree ("surface","object_type","enabled");--> statement-breakpoint
CREATE INDEX "skill_bindings_org_idx" ON "skill_bindings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_versions_skill_number_uniq" ON "skill_versions" USING btree ("skill_id","version_number");--> statement-breakpoint
CREATE INDEX "skill_versions_skill_idx" ON "skill_versions" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_versions_org_idx" ON "skill_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "skill_versions_deployment_idx" ON "skill_versions" USING btree ("workflow_deployment_id");--> statement-breakpoint
CREATE INDEX "skill_versions_legacy_automation_idx" ON "skill_versions" USING btree ("legacy_automation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_org_project_slug_uniq" ON "skills" USING btree ("organization_id","v2_project_id","slug");--> statement-breakpoint
CREATE INDEX "skills_org_idx" ON "skills" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "skills_project_idx" ON "skills" USING btree ("v2_project_id");--> statement-breakpoint
CREATE INDEX "skills_kind_idx" ON "skills" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_definitions_org_project_slug_uniq" ON "workflow_definitions" USING btree ("organization_id","v2_project_id","slug");--> statement-breakpoint
CREATE INDEX "workflow_definitions_org_idx" ON "workflow_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_definitions_project_idx" ON "workflow_definitions" USING btree ("v2_project_id");--> statement-breakpoint
CREATE INDEX "workflow_definitions_owner_idx" ON "workflow_definitions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "workflow_deployments_workflow_idx" ON "workflow_deployments" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_deployments_org_idx" ON "workflow_deployments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_deployments_active_env_uniq" ON "workflow_deployments" USING btree ("workflow_id","environment") WHERE "workflow_deployments"."status" = 'active';--> statement-breakpoint
CREATE INDEX "workflow_run_steps_run_idx" ON "workflow_run_steps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_run_steps_parent_idx" ON "workflow_run_steps" USING btree ("parent_step_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_org_idx" ON "workflow_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_project_idx" ON "workflow_runs" USING btree ("v2_project_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_skill_idx" ON "workflow_runs" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_runs_parent_idx" ON "workflow_runs" USING btree ("parent_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_workflow_number_uniq" ON "workflow_versions" USING btree ("workflow_id","version_number");--> statement-breakpoint
CREATE INDEX "workflow_versions_workflow_idx" ON "workflow_versions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_versions_org_idx" ON "workflow_versions" USING btree ("organization_id");