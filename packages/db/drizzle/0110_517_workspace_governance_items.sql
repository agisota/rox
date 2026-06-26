CREATE TYPE "public"."governance_kind" AS ENUM('goal', 'task', 'mission');--> statement-breakpoint
CREATE TABLE "workspace_governance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"kind" "governance_kind" NOT NULL,
	"text" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_governance_items" ADD CONSTRAINT "workspace_governance_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_governance_items" ADD CONSTRAINT "workspace_governance_items_v2_workspace_id_v2_workspaces_id_fk" FOREIGN KEY ("v2_workspace_id") REFERENCES "public"."v2_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_governance_items" ADD CONSTRAINT "workspace_governance_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_governance_items_organization_idx" ON "workspace_governance_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workspace_governance_items_workspace_idx" ON "workspace_governance_items" USING btree ("v2_workspace_id");