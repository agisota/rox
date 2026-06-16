CREATE TYPE "public"."journal_entry_status" AS ENUM('pending', 'generated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."memory_category" AS ENUM('projects', 'identity', 'instructions', 'career', 'general');--> statement-breakpoint
CREATE TYPE "public"."memory_import_provider" AS ENUM('chatgpt', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."memory_import_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."memory_source" AS ENUM('manual', 'agent', 'archive', 'prompt');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('suggested', 'approved', 'dismissed');--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"day" date NOT NULL,
	"reflection" text,
	"learnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tips" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "journal_entry_status" DEFAULT 'pending' NOT NULL,
	"model_id" text,
	"source_session_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"provider" "memory_import_provider" NOT NULL,
	"blob_url" text,
	"status" "memory_import_status" DEFAULT 'pending' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"category" "memory_category" DEFAULT 'general' NOT NULL,
	"body" text NOT NULL,
	"source" "memory_source" DEFAULT 'manual' NOT NULL,
	"status" "memory_status" DEFAULT 'suggested' NOT NULL,
	"source_ref" jsonb,
	"import_job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_import_jobs" ADD CONSTRAINT "memory_import_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_import_jobs" ADD CONSTRAINT "memory_import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_import_job_id_memory_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."memory_import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_entries_org_idx" ON "journal_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "journal_entries_user_day_idx" ON "journal_entries" USING btree ("created_by","day");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_org_user_day_unique" ON "journal_entries" USING btree ("organization_id","created_by","day");--> statement-breakpoint
CREATE INDEX "memory_import_jobs_org_idx" ON "memory_import_jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "memory_import_jobs_user_idx" ON "memory_import_jobs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "memory_items_org_idx" ON "memory_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "memory_items_user_category_status_idx" ON "memory_items" USING btree ("created_by","category","status");--> statement-breakpoint
CREATE INDEX "memory_items_user_status_idx" ON "memory_items" USING btree ("created_by","status");--> statement-breakpoint
CREATE INDEX "memory_items_import_job_idx" ON "memory_items" USING btree ("import_job_id");