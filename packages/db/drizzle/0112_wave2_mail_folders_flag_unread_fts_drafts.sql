CREATE TYPE "public"."mail_folder" AS ENUM('inbox', 'archive', 'spam', 'trash');--> statement-breakpoint
CREATE TABLE "mail_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"thread_id" uuid,
	"to_addrs" text DEFAULT '' NOT NULL,
	"cc_addrs" text DEFAULT '' NOT NULL,
	"bcc_addrs" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_threads" ADD COLUMN "folder" "mail_folder" DEFAULT 'inbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD COLUMN "is_flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_drafts" ADD CONSTRAINT "mail_drafts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_drafts" ADD CONSTRAINT "mail_drafts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_drafts" ADD CONSTRAINT "mail_drafts_thread_id_mail_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."mail_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_drafts_owner_updated_idx" ON "mail_drafts" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "mail_drafts_org_idx" ON "mail_drafts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "mail_drafts_thread_idx" ON "mail_drafts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "mail_messages_fts_idx" ON "mail_messages" USING gin (to_tsvector('simple', coalesce("subject", '') || ' ' || coalesce("snippet", '') || ' ' || coalesce("from_addr", '') || ' ' || coalesce("from_name", '')));--> statement-breakpoint
CREATE INDEX "mail_threads_owner_folder_idx" ON "mail_threads" USING btree ("owner_user_id","folder","last_message_at");