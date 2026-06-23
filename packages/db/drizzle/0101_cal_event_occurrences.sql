CREATE TABLE "cal_event_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"original_start" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"override_title" text,
	"override_description" text,
	"override_location" text,
	"override_dtstart" timestamp with time zone,
	"override_dtend" timestamp with time zone,
	"override_all_day" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cal_event_occurrences_end_after_start" CHECK ("cal_event_occurrences"."override_dtend" IS NULL OR "cal_event_occurrences"."override_dtstart" IS NULL OR "cal_event_occurrences"."override_dtend" >= "cal_event_occurrences"."override_dtstart")
);
--> statement-breakpoint
ALTER TABLE "cal_event_occurrences" ADD CONSTRAINT "cal_event_occurrences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_event_occurrences" ADD CONSTRAINT "cal_event_occurrences_event_id_cal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."cal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_event_occurrences" ADD CONSTRAINT "cal_event_occurrences_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cal_event_occurrences_event_original_uniq" ON "cal_event_occurrences" USING btree ("event_id","original_start");--> statement-breakpoint
CREATE INDEX "cal_event_occurrences_org_event_idx" ON "cal_event_occurrences" USING btree ("organization_id","event_id");