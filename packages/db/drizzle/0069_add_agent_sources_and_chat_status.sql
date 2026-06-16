CREATE TYPE "public"."agent_source_kind" AS ENUM('claude_code', 'codex', 'cursor', 'opencode', 'mcp', 'external_http');--> statement-breakpoint
CREATE TYPE "public"."agent_source_status" AS ENUM('draft', 'active', 'deprecated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."chat_session_status" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TYPE "public"."object_type" ADD VALUE 'agent_source';--> statement-breakpoint
CREATE TABLE "agent_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"owner_user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "agent_source_kind" NOT NULL,
	"status" "agent_source_status" DEFAULT 'active' NOT NULL,
	"integration_connection_id" uuid,
	"encrypted_config" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"endpoint_url" text,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "status" "chat_session_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "labels" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "agent_sources" ADD CONSTRAINT "agent_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sources" ADD CONSTRAINT "agent_sources_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sources" ADD CONSTRAINT "agent_sources_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sources" ADD CONSTRAINT "agent_sources_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sources_org_project_slug_uniq" ON "agent_sources" USING btree ("organization_id","v2_project_id","slug");--> statement-breakpoint
CREATE INDEX "agent_sources_org_idx" ON "agent_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_sources_project_idx" ON "agent_sources" USING btree ("v2_project_id");--> statement-breakpoint
CREATE INDEX "agent_sources_kind_idx" ON "agent_sources" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "chat_sessions_org_status_idx" ON "chat_sessions" USING btree ("organization_id","status");