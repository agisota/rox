CREATE TYPE "public"."durable_session_status" AS ENUM('starting', 'running', 'idle', 'ended', 'error');--> statement-breakpoint
CREATE TYPE "public"."terminal_status" AS ENUM('starting', 'running', 'idle', 'ended', 'error');--> statement-breakpoint
CREATE TABLE "durable_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"host_id" text NOT NULL,
	"agent" text DEFAULT 'claude' NOT NULL,
	"status" "durable_session_status" DEFAULT 'idle' NOT NULL,
	"title" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"host_id" text NOT NULL,
	"title" text,
	"status" "terminal_status" DEFAULT 'idle' NOT NULL,
	"exit_code" integer,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "durable_sessions" ADD CONSTRAINT "durable_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "durable_sessions" ADD CONSTRAINT "durable_sessions_workspace_id_v2_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."v2_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "durable_sessions" ADD CONSTRAINT "durable_sessions_host_fk" FOREIGN KEY ("organization_id","host_id") REFERENCES "public"."v2_hosts"("organization_id","machine_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_workspace_id_v2_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."v2_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_host_fk" FOREIGN KEY ("organization_id","host_id") REFERENCES "public"."v2_hosts"("organization_id","machine_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "durable_sessions_organization_id_idx" ON "durable_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "durable_sessions_workspace_id_idx" ON "durable_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "durable_sessions_host_id_idx" ON "durable_sessions" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "terminals_organization_id_idx" ON "terminals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "terminals_workspace_id_idx" ON "terminals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "terminals_host_id_idx" ON "terminals" USING btree ("host_id");