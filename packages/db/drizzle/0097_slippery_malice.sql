CREATE TABLE "live_transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"room_name" text NOT NULL,
	"speaker_identity" text NOT NULL,
	"speaker_name" text NOT NULL,
	"text" text NOT NULL,
	"language" text,
	"created_by" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_transcript_segments" ADD CONSTRAINT "live_transcript_segments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_transcript_segments" ADD CONSTRAINT "live_transcript_segments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_transcript_segments_room_captured_idx" ON "live_transcript_segments" USING btree ("room_name","captured_at");--> statement-breakpoint
CREATE INDEX "live_transcript_segments_org_idx" ON "live_transcript_segments" USING btree ("organization_id");