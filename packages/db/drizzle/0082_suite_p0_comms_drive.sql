CREATE TYPE "public"."comms_address_kind" AS ENUM('email', 'xmpp', 'mesh', 'inapp');--> statement-breakpoint
CREATE TYPE "public"."comms_delivery_status" AS ENUM('queued', 'sent', 'delivered', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."comms_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."comms_participant_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."comms_presence_state" AS ENUM('online', 'away', 'dnd', 'offline');--> statement-breakpoint
CREATE TYPE "public"."comms_transport" AS ENUM('inapp', 'email', 'xmpp', 'mesh');--> statement-breakpoint
CREATE TYPE "public"."drive_file_status" AS ENUM('pending', 'clean', 'scanning', 'quarantined', 'trashed');--> statement-breakpoint
CREATE TYPE "public"."drive_ref_source" AS ENUM('chat_message', 'email_message', 'canvas', 'other');--> statement-breakpoint
CREATE TYPE "public"."drive_share_perm" AS ENUM('view', 'download');--> statement-breakpoint
ALTER TYPE "public"."rox_ledger_kind" ADD VALUE 'drive_overage';--> statement-breakpoint
CREATE TABLE "comms_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "comms_address_kind" NOT NULL,
	"value" text NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"is_alias" boolean DEFAULT false NOT NULL,
	"alias_expires_at" timestamp with time zone,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"transport" "comms_transport" NOT NULL,
	"to_address" text NOT NULL,
	"status" "comms_delivery_status" DEFAULT 'queued' NOT NULL,
	"provider_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_keypairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"algo" text DEFAULT 'ed25519' NOT NULL,
	"public_key" text NOT NULL,
	"secret_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"transport" "comms_transport" NOT NULL,
	"direction" "comms_direction" NOT NULL,
	"author_user_id" uuid,
	"author_contact_entity_id" uuid,
	"external_id" text,
	"in_reply_to_external_id" text,
	"body" text DEFAULT '' NOT NULL,
	"body_html" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid,
	"contact_entity_id" uuid,
	"role" "comms_participant_role" DEFAULT 'member' NOT NULL,
	"last_read_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"state" "comms_presence_state" DEFAULT 'offline' NOT NULL,
	"per_transport" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject" text,
	"last_message_at" timestamp with time zone,
	"dedup_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_file_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"source_kind" "drive_ref_source" NOT NULL,
	"source_id" uuid NOT NULL,
	"organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" "drive_file_status" DEFAULT 'pending' NOT NULL,
	"scan_result" jsonb,
	"trashed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_files_size_nonneg" CHECK ("drive_files"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "drive_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_id" uuid,
	"folder_id" uuid,
	"token" text NOT NULL,
	"password_hash" text,
	"expires_at" timestamp with time zone,
	"permission" "drive_share_perm" DEFAULT 'view' NOT NULL,
	"revoked_at" timestamp with time zone,
	"takedown" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_shares_one_target" CHECK (("drive_shares"."file_id" IS NOT NULL) <> ("drive_shares"."folder_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "storage_quota" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quota_bytes" bigint DEFAULT 10737418240 NOT NULL,
	"bytes_used" bigint DEFAULT 0 NOT NULL,
	"overage_opt_in" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_quota_bytes_used_nonneg" CHECK ("storage_quota"."bytes_used" >= 0)
);
--> statement-breakpoint
ALTER TABLE "comms_addresses" ADD CONSTRAINT "comms_addresses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_addresses" ADD CONSTRAINT "comms_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_deliveries" ADD CONSTRAINT "comms_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_deliveries" ADD CONSTRAINT "comms_deliveries_message_id_comms_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."comms_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_keypairs" ADD CONSTRAINT "comms_keypairs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_keypairs" ADD CONSTRAINT "comms_keypairs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_messages" ADD CONSTRAINT "comms_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_messages" ADD CONSTRAINT "comms_messages_thread_id_comms_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comms_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_messages" ADD CONSTRAINT "comms_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_participants" ADD CONSTRAINT "comms_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_participants" ADD CONSTRAINT "comms_participants_thread_id_comms_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comms_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_participants" ADD CONSTRAINT "comms_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_presence" ADD CONSTRAINT "comms_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_presence" ADD CONSTRAINT "comms_presence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_threads" ADD CONSTRAINT "comms_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_file_refs" ADD CONSTRAINT "drive_file_refs_file_id_drive_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."drive_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_file_refs" ADD CONSTRAINT "drive_file_refs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_file_versions" ADD CONSTRAINT "drive_file_versions_file_id_drive_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."drive_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_folder_id_drive_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."drive_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_parent_id_drive_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."drive_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_shares" ADD CONSTRAINT "drive_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_shares" ADD CONSTRAINT "drive_shares_file_id_drive_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."drive_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_shares" ADD CONSTRAINT "drive_shares_folder_id_drive_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."drive_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_quota" ADD CONSTRAINT "storage_quota_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comms_addresses_org_kind_value_uniq" ON "comms_addresses" USING btree ("organization_id","kind","value");--> statement-breakpoint
CREATE INDEX "comms_addresses_user_idx" ON "comms_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comms_addresses_kind_value_idx" ON "comms_addresses" USING btree ("kind","value");--> statement-breakpoint
CREATE INDEX "comms_deliveries_message_idx" ON "comms_deliveries" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "comms_deliveries_org_status_idx" ON "comms_deliveries" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "comms_keypairs_user_algo_uniq" ON "comms_keypairs" USING btree ("user_id","algo");--> statement-breakpoint
CREATE INDEX "comms_messages_org_thread_created_idx" ON "comms_messages" USING btree ("organization_id","thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "comms_messages_transport_external_uniq" ON "comms_messages" USING btree ("transport","external_id") WHERE "comms_messages"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "comms_messages_author_idx" ON "comms_messages" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comms_participants_thread_user_uniq" ON "comms_participants" USING btree ("thread_id","user_id") WHERE "comms_participants"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "comms_participants_thread_idx" ON "comms_participants" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "comms_participants_user_idx" ON "comms_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comms_presence_org_state_idx" ON "comms_presence" USING btree ("organization_id","state");--> statement-breakpoint
CREATE INDEX "comms_threads_org_last_message_idx" ON "comms_threads" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE INDEX "comms_threads_org_dedup_idx" ON "comms_threads" USING btree ("organization_id","dedup_key");--> statement-breakpoint
CREATE INDEX "drive_file_refs_file_idx" ON "drive_file_refs" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_file_refs_source_uniq" ON "drive_file_refs" USING btree ("source_kind","source_id","file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_file_versions_file_version_uniq" ON "drive_file_versions" USING btree ("file_id","version");--> statement-breakpoint
CREATE INDEX "drive_files_user_folder_idx" ON "drive_files" USING btree ("user_id","folder_id");--> statement-breakpoint
CREATE INDEX "drive_files_user_sha_idx" ON "drive_files" USING btree ("user_id","sha256");--> statement-breakpoint
CREATE INDEX "drive_files_status_idx" ON "drive_files" USING btree ("status");--> statement-breakpoint
CREATE INDEX "drive_files_trashed_idx" ON "drive_files" USING btree ("trashed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_files_user_sha_version_uniq" ON "drive_files" USING btree ("user_id","sha256","version");--> statement-breakpoint
CREATE INDEX "drive_folders_user_parent_idx" ON "drive_folders" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_folders_sibling_name_uniq" ON "drive_folders" USING btree ("user_id","parent_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_shares_token_uniq" ON "drive_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "drive_shares_user_idx" ON "drive_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drive_shares_file_idx" ON "drive_shares" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "drive_shares_folder_idx" ON "drive_shares" USING btree ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_quota_user_uniq" ON "storage_quota" USING btree ("user_id");