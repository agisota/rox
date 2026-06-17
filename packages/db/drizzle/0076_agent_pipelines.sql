ALTER TYPE "public"."object_type" ADD VALUE 'pipeline_trigger';--> statement-breakpoint
ALTER TYPE "public"."trigger_kind" ADD VALUE 'project_initialized';--> statement-breakpoint
ALTER TYPE "public"."trigger_kind" ADD VALUE 'service_connected';--> statement-breakpoint
ALTER TYPE "public"."workflow_engine" ADD VALUE 'pipeline';--> statement-breakpoint
CREATE TABLE "pipeline_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"workflow_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"trigger_kind" "trigger_kind" NOT NULL,
	"match_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "agent_config" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "accumulated_context" jsonb;--> statement-breakpoint
ALTER TABLE "pipeline_triggers" ADD CONSTRAINT "pipeline_triggers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_triggers" ADD CONSTRAINT "pipeline_triggers_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_triggers" ADD CONSTRAINT "pipeline_triggers_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_triggers_match_idx" ON "pipeline_triggers" USING btree ("trigger_kind","enabled");--> statement-breakpoint
CREATE INDEX "pipeline_triggers_project_idx" ON "pipeline_triggers" USING btree ("v2_project_id");--> statement-breakpoint
CREATE INDEX "pipeline_triggers_workflow_idx" ON "pipeline_triggers" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "pipeline_triggers_org_idx" ON "pipeline_triggers" USING btree ("organization_id");