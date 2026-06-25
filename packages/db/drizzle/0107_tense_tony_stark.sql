ALTER TABLE "chat_sessions" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
CREATE INDEX "chat_sessions_org_pinned_idx" ON "chat_sessions" USING btree ("organization_id","pinned","pinned_at");