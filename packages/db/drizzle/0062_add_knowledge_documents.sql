CREATE TYPE "public"."knowledge_document_type" AS ENUM('note', 'prd', 'spec', 'doc', 'meeting_summary', 'reference');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_kind" AS ENUM('manual', 'conversation', 'agent_run', 'obsidian_import', 'file');--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"type" "knowledge_document_type" DEFAULT 'note' NOT NULL,
	"source_kind" "knowledge_source_kind" DEFAULT 'manual' NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"markdown" text,
	"frontmatter" jsonb,
	"body" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ref" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"target_document_id" uuid,
	"target_slug" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_source_document_id_knowledge_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_target_document_id_knowledge_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_documents_org_idx" ON "knowledge_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_project_idx" ON "knowledge_documents" USING btree ("v2_project_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_type_idx" ON "knowledge_documents" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_org_slug_unique" ON "knowledge_documents" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "knowledge_links_org_idx" ON "knowledge_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_links_source_idx" ON "knowledge_links" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "knowledge_links_target_idx" ON "knowledge_links" USING btree ("target_document_id");--> statement-breakpoint
CREATE INDEX "knowledge_links_target_slug_idx" ON "knowledge_links" USING btree ("target_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_links_source_target_unique" ON "knowledge_links" USING btree ("source_document_id","target_slug");