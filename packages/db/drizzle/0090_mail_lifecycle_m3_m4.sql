ALTER TYPE "public"."rox_ledger_kind" ADD VALUE 'mail_send';--> statement-breakpoint
ALTER TYPE "public"."mail_status" ADD VALUE 'complained';--> statement-breakpoint
ALTER TABLE "mail_addresses" ADD COLUMN "complaint_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "mail_messages_provider_evt_idx" ON "mail_messages" USING btree ("provider_event_id");