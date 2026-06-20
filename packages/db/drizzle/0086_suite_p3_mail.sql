CREATE TYPE "public"."mail_address_kind" AS ENUM('primary', 'alias');--> statement-breakpoint
CREATE TYPE "public"."mail_address_status" AS ENUM('active', 'grace', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."mail_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."mail_provider" AS ENUM('cloudflare', 'resend');--> statement-breakpoint
CREATE TYPE "public"."mail_status" AS ENUM('received', 'quarantined', 'sending', 'sent', 'delivered', 'bounced', 'failed');--> statement-breakpoint
CREATE TABLE "mail_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"local_part" text NOT NULL,
	"domain" text DEFAULT 'rox.one' NOT NULL,
	"address" text NOT NULL,
	"kind" "mail_address_kind" DEFAULT 'primary' NOT NULL,
	"status" "mail_address_status" DEFAULT 'active' NOT NULL,
	"grace_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_id" text,
	"is_inline" boolean DEFAULT false NOT NULL,
	"blob_key" text NOT NULL,
	"drive_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"message_id" uuid,
	"provider" "mail_provider" NOT NULL,
	"event_type" text NOT NULL,
	"provider_event_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"address_id" uuid,
	"thread_id" uuid,
	"direction" "mail_direction" NOT NULL,
	"status" "mail_status" NOT NULL,
	"rfc_message_id" text,
	"in_reply_to" text,
	"references_ids" text[],
	"from_addr" text NOT NULL,
	"from_name" text,
	"to_addrs" text[] NOT NULL,
	"cc_addrs" text[] DEFAULT '{}',
	"bcc_addrs" text[] DEFAULT '{}',
	"reply_to" text,
	"subject" text,
	"snippet" text,
	"raw_blob_key" text,
	"body_text_key" text,
	"body_html_key" text,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"has_calendar_invite" boolean DEFAULT false NOT NULL,
	"spam_score" integer,
	"spf_pass" boolean,
	"dkim_pass" boolean,
	"dmarc_pass" boolean,
	"provider" "mail_provider" NOT NULL,
	"provider_event_id" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"root_message_ref" text,
	"subject_norm" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_addresses" ADD CONSTRAINT "mail_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_addresses" ADD CONSTRAINT "mail_addresses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_attachments" ADD CONSTRAINT "mail_attachments_message_id_mail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mail_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_attachments" ADD CONSTRAINT "mail_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_events" ADD CONSTRAINT "mail_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_events" ADD CONSTRAINT "mail_events_message_id_mail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mail_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_address_id_mail_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."mail_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_thread_id_mail_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."mail_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_addresses_address_uniq" ON "mail_addresses" USING btree ("address");--> statement-breakpoint
CREATE INDEX "mail_addresses_user_idx" ON "mail_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mail_addresses_org_idx" ON "mail_addresses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "mail_attachments_message_idx" ON "mail_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "mail_attachments_org_idx" ON "mail_attachments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_events_provider_evt_uniq" ON "mail_events" USING btree ("provider","provider_event_id") WHERE "mail_events"."provider_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "mail_events_message_idx" ON "mail_events" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_owner_msgid_uniq" ON "mail_messages" USING btree ("owner_user_id","rfc_message_id") WHERE "mail_messages"."rfc_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "mail_messages_owner_received_idx" ON "mail_messages" USING btree ("owner_user_id","received_at");--> statement-breakpoint
CREATE INDEX "mail_messages_thread_idx" ON "mail_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "mail_messages_status_idx" ON "mail_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mail_messages_org_idx" ON "mail_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "mail_nonces_expires_idx" ON "mail_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mail_threads_owner_last_idx" ON "mail_threads" USING btree ("owner_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "mail_threads_org_idx" ON "mail_threads" USING btree ("organization_id");