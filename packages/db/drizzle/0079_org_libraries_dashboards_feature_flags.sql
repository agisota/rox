CREATE TYPE "public"."dashboard_section_kind" AS ENUM('config', 'recommendation', 'note', 'priority', 'artifact', 'product', 'reference', 'log');--> statement-breakpoint
CREATE TABLE "browser_data_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_browser_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"favicon_url" text,
	"visited_at" timestamp with time zone NOT NULL,
	"visit_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"body" jsonb,
	"knowledge_document_id" uuid,
	"status" text,
	"priority" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "dashboard_section_kind" NOT NULL,
	"title" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" boolean NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_libraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_library_team_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "browser_data_consents" ADD CONSTRAINT "browser_data_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_data_consents" ADD CONSTRAINT "browser_data_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_browser_history" ADD CONSTRAINT "workspace_browser_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_browser_history" ADD CONSTRAINT "workspace_browser_history_v2_workspace_id_v2_workspaces_id_fk" FOREIGN KEY ("v2_workspace_id") REFERENCES "public"."v2_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_browser_history" ADD CONSTRAINT "workspace_browser_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_entries" ADD CONSTRAINT "dashboard_entries_section_id_dashboard_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."dashboard_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_entries" ADD CONSTRAINT "dashboard_entries_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_entries" ADD CONSTRAINT "dashboard_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_entries" ADD CONSTRAINT "dashboard_entries_knowledge_document_id_knowledge_documents_id_fk" FOREIGN KEY ("knowledge_document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_entries" ADD CONSTRAINT "dashboard_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_sections" ADD CONSTRAINT "dashboard_sections_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_sections" ADD CONSTRAINT "dashboard_sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_libraries" ADD CONSTRAINT "skill_libraries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_libraries" ADD CONSTRAINT "skill_libraries_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_libraries" ADD CONSTRAINT "skill_libraries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_library_items" ADD CONSTRAINT "skill_library_items_library_id_skill_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."skill_libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_library_items" ADD CONSTRAINT "skill_library_items_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_library_items" ADD CONSTRAINT "skill_library_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_library_team_assignments" ADD CONSTRAINT "skill_library_team_assignments_library_id_skill_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."skill_libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_library_team_assignments" ADD CONSTRAINT "skill_library_team_assignments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "auth"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_library_team_assignments" ADD CONSTRAINT "skill_library_team_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "browser_data_consents_org_idx" ON "browser_data_consents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "browser_data_consents_user_idx" ON "browser_data_consents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "browser_data_consents_org_user_unique" ON "browser_data_consents" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_browser_history_org_idx" ON "workspace_browser_history" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workspace_browser_history_workspace_idx" ON "workspace_browser_history" USING btree ("v2_workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_browser_history_user_idx" ON "workspace_browser_history" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_browser_history_workspace_user_url_unique" ON "workspace_browser_history" USING btree ("v2_workspace_id","user_id","url");--> statement-breakpoint
CREATE INDEX "dashboard_entries_section_idx" ON "dashboard_entries" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "dashboard_entries_dashboard_idx" ON "dashboard_entries" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "dashboard_entries_org_idx" ON "dashboard_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "dashboard_entries_knowledge_document_idx" ON "dashboard_entries" USING btree ("knowledge_document_id");--> statement-breakpoint
CREATE INDEX "dashboard_sections_dashboard_idx" ON "dashboard_sections" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "dashboard_sections_org_idx" ON "dashboard_sections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "dashboards_org_idx" ON "dashboards" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "dashboards_project_idx" ON "dashboards" USING btree ("v2_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboards_org_slug_unique" ON "dashboards" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "user_feature_flags_user_idx" ON "user_feature_flags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_feature_flags_user_key_unique" ON "user_feature_flags" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "skill_libraries_org_idx" ON "skill_libraries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "skill_libraries_project_idx" ON "skill_libraries" USING btree ("v2_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_libraries_org_slug_unique" ON "skill_libraries" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "skill_library_items_library_idx" ON "skill_library_items" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "skill_library_items_skill_idx" ON "skill_library_items" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_library_items_org_idx" ON "skill_library_items" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_library_items_library_skill_unique" ON "skill_library_items" USING btree ("library_id","skill_id");--> statement-breakpoint
CREATE INDEX "skill_library_team_assignments_library_idx" ON "skill_library_team_assignments" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "skill_library_team_assignments_team_idx" ON "skill_library_team_assignments" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "skill_library_team_assignments_org_idx" ON "skill_library_team_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_library_team_assignments_library_team_unique" ON "skill_library_team_assignments" USING btree ("library_id","team_id");