CREATE TYPE "public"."voice_transcription_status" AS ENUM('transcribed', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "voice_transcriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"raw_text" text,
	"processed_ru" text,
	"processed_en" text,
	"language" text,
	"duration_ms" integer,
	"audio_blob_url" text,
	"status" "voice_transcription_status" DEFAULT 'transcribed' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_transcriptions" ADD CONSTRAINT "voice_transcriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_transcriptions" ADD CONSTRAINT "voice_transcriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_transcriptions_org_idx" ON "voice_transcriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "voice_transcriptions_user_created_idx" ON "voice_transcriptions" USING btree ("created_by","created_at");