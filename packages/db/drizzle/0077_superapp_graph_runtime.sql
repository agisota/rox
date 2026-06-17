CREATE TYPE "public"."activity_event_kind" AS ENUM('screen_block', 'app_usage', 'session', 'calendar', 'comms', 'feed_read', 'journal', 'file_op');--> statement-breakpoint
CREATE TYPE "public"."edge_relation" AS ENUM('links_to', 'derived_from', 'attached_to', 'scheduled_as', 'blocks', 'mentions', 'authored_by', 'participant_of', 'replies_to', 'child_of', 'tagged_with', 'about', 'references', 'embeds', 'captured_from');--> statement-breakpoint
CREATE TYPE "public"."entity_kind" AS ENUM('note', 'email', 'email_thread', 'message', 'channel', 'task', 'project', 'area', 'calendar_event', 'agent_session', 'activity_event', 'feed', 'feed_item', 'file', 'design_artifact', 'contact', 'osint_entity', 'tag', 'journal');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'archived', 'trashed');--> statement-breakpoint
CREATE TYPE "public"."identity_kind" AS ENUM('email', 'chat', 'attendee', 'git', 'selector', 'phone', 'domain');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_kind" AS ENUM('local', 'zed_gateway', 'openai', 'gemini', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."embedding_job_status" AS ENUM('queued', 'running', 'done', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."runtime_service_kind" AS ENUM('minio', 'qdrant', 'embedder', 'turso', 'electric');--> statement-breakpoint
CREATE TYPE "public"."runtime_service_state" AS ENUM('provisioning', 'healthy', 'degraded', 'stopped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."storage_bucket_prefix" AS ENUM('files', 'frames', 'recordings', 'artifacts', 'exports', 'sessions');--> statement-breakpoint
CREATE TYPE "public"."storage_object_status" AS ENUM('pending', 'stored', 'missing', 'trashed');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"duration_ms" integer,
	"kind" "activity_event_kind" NOT NULL,
	"source_entity_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"primary_email" text,
	"avatar_url" text,
	"linked_user_id" uuid,
	"is_self" boolean DEFAULT false NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid,
	"target_slug" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"relation" "edge_relation" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"kind" "entity_kind" NOT NULL,
	"slug" text,
	"title" text NOT NULL,
	"markdown" text,
	"body" jsonb,
	"storage_ref" jsonb,
	"source_ref" jsonb,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_id_org_uniq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key" uuid NOT NULL,
	"result_entity_id" uuid,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_entity_id" uuid NOT NULL,
	"kind" "identity_kind" NOT NULL,
	"value" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" "embedding_job_status" DEFAULT 'queued' NOT NULL,
	"provider" "ai_provider_kind" DEFAULT 'local' NOT NULL,
	"embedding_version" integer DEFAULT 1 NOT NULL,
	"content_hash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"payload" jsonb NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "runtime_service_kind" NOT NULL,
	"state" "runtime_service_state" DEFAULT 'provisioning' NOT NULL,
	"device_id" text,
	"endpoint" text,
	"version" text,
	"secret_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_health_at" timestamp with time zone,
	"health" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"bucket" text NOT NULL,
	"prefix" "storage_bucket_prefix" NOT NULL,
	"object_key" text NOT NULL,
	"mime" text,
	"size_bytes" bigint,
	"checksum_sha256" text,
	"idempotency_key" uuid,
	"status" "storage_object_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"shape" text NOT NULL,
	"electric_handle" text,
	"electric_offset" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_source_entity_id_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_entity_org_fk" FOREIGN KEY ("entity_id","organization_id") REFERENCES "public"."entities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_source_entity_org_fk" FOREIGN KEY ("source_entity_id","organization_id") REFERENCES "public"."entities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_contact_org_fk" FOREIGN KEY ("contact_entity_id","organization_id") REFERENCES "public"."contacts"("entity_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_jobs" ADD CONSTRAINT "embedding_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_jobs" ADD CONSTRAINT "embedding_jobs_entity_org_fk" FOREIGN KEY ("entity_id","organization_id") REFERENCES "public"."entities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_services" ADD CONSTRAINT "runtime_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_entity_org_fk" FOREIGN KEY ("entity_id","organization_id") REFERENCES "public"."entities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_user_ts_idx" ON "activity_events" USING btree ("user_id","ts");--> statement-breakpoint
CREATE INDEX "activity_events_kind_idx" ON "activity_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "activity_events_source_idx" ON "activity_events" USING btree ("source_entity_id");--> statement-breakpoint
CREATE INDEX "contacts_org_idx" ON "contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contacts_linked_user_idx" ON "contacts" USING btree ("linked_user_id");--> statement-breakpoint
CREATE INDEX "contacts_primary_email_idx" ON "contacts" USING btree ("primary_email");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_entity_org_uniq" ON "contacts" USING btree ("entity_id","organization_id");--> statement-breakpoint
CREATE INDEX "edges_org_idx" ON "edges" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "edges_source_idx" ON "edges" USING btree ("source_entity_id");--> statement-breakpoint
CREATE INDEX "edges_target_idx" ON "edges" USING btree ("target_entity_id");--> statement-breakpoint
CREATE INDEX "edges_relation_idx" ON "edges" USING btree ("relation");--> statement-breakpoint
CREATE UNIQUE INDEX "edges_source_target_relation_uniq" ON "edges" USING btree ("source_entity_id","target_entity_id","relation") WHERE "edges"."target_entity_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "edges_source_relation_slug_uniq" ON "edges" USING btree ("organization_id","source_entity_id","relation","target_slug") WHERE "edges"."target_entity_id" IS NULL AND "edges"."target_slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entities_org_idx" ON "entities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "entities_kind_idx" ON "entities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "entities_project_idx" ON "entities" USING btree ("v2_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_org_kind_slug_uniq" ON "entities" USING btree ("organization_id","kind","slug") WHERE "entities"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idempotency_keys_org_idx" ON "idempotency_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_org_scope_key_uniq" ON "idempotency_keys" USING btree ("organization_id","scope","key");--> statement-breakpoint
CREATE INDEX "identity_links_contact_idx" ON "identity_links" USING btree ("contact_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_links_org_kind_value_uniq" ON "identity_links" USING btree ("organization_id","kind","value");--> statement-breakpoint
CREATE INDEX "embedding_jobs_org_idx" ON "embedding_jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "embedding_jobs_status_sched_idx" ON "embedding_jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "embedding_jobs_entity_idx" ON "embedding_jobs" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_jobs_entity_version_active_uniq" ON "embedding_jobs" USING btree ("entity_id","embedding_version") WHERE "embedding_jobs"."status" IN ('queued','running');--> statement-breakpoint
CREATE INDEX "runtime_services_org_idx" ON "runtime_services" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_services_org_kind_uniq" ON "runtime_services" USING btree ("organization_id","kind") WHERE "runtime_services"."device_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_services_org_kind_device_uniq" ON "runtime_services" USING btree ("organization_id","kind","device_id") WHERE "runtime_services"."device_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "storage_objects_org_idx" ON "storage_objects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "storage_objects_prefix_idx" ON "storage_objects" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "storage_objects_status_idx" ON "storage_objects" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_bucket_key_uniq" ON "storage_objects" USING btree ("bucket","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_org_prefix_checksum_uniq" ON "storage_objects" USING btree ("organization_id","prefix","checksum_sha256") WHERE "storage_objects"."checksum_sha256" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_org_idempotency_uniq" ON "storage_objects" USING btree ("organization_id","idempotency_key") WHERE "storage_objects"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sync_cursors_org_idx" ON "sync_cursors" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_cursors_org_device_shape_uniq" ON "sync_cursors" USING btree ("organization_id","device_id","shape");