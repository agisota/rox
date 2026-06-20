CREATE TYPE "public"."cal_attendee_status" AS ENUM('needs_action', 'accepted', 'declined', 'tentative');--> statement-breakpoint
CREATE TYPE "public"."cal_event_status" AS ENUM('confirmed', 'tentative', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."cal_share_role" AS ENUM('reader', 'writer', 'owner');--> statement-breakpoint
CREATE TABLE "cal_calendar_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "cal_share_role" DEFAULT 'reader' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cal_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cal_event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text,
	"status" "cal_attendee_status" DEFAULT 'needs_action' NOT NULL,
	"is_organizer" boolean DEFAULT false NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cal_event_attendees_one_identity" CHECK (("cal_event_attendees"."user_id" IS NOT NULL) <> ("cal_event_attendees"."email" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"dtstart" timestamp with time zone NOT NULL,
	"dtend" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"rrule" text,
	"exdates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "cal_event_status" DEFAULT 'confirmed' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cal_events_end_after_start" CHECK ("cal_events"."dtend" >= "cal_events"."dtstart")
);
--> statement-breakpoint
ALTER TABLE "cal_calendar_shares" ADD CONSTRAINT "cal_calendar_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_calendar_shares" ADD CONSTRAINT "cal_calendar_shares_calendar_id_cal_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."cal_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_calendar_shares" ADD CONSTRAINT "cal_calendar_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_calendars" ADD CONSTRAINT "cal_calendars_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_calendars" ADD CONSTRAINT "cal_calendars_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_event_attendees" ADD CONSTRAINT "cal_event_attendees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_event_attendees" ADD CONSTRAINT "cal_event_attendees_event_id_cal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."cal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_event_attendees" ADD CONSTRAINT "cal_event_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_events" ADD CONSTRAINT "cal_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_events" ADD CONSTRAINT "cal_events_calendar_id_cal_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."cal_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_events" ADD CONSTRAINT "cal_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cal_calendar_shares_calendar_user_uniq" ON "cal_calendar_shares" USING btree ("calendar_id","user_id");--> statement-breakpoint
CREATE INDEX "cal_calendar_shares_user_idx" ON "cal_calendar_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cal_calendar_shares_org_idx" ON "cal_calendar_shares" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cal_calendars_org_owner_idx" ON "cal_calendars" USING btree ("organization_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "cal_event_attendees_event_idx" ON "cal_event_attendees" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "cal_event_attendees_user_idx" ON "cal_event_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cal_event_attendees_event_user_uniq" ON "cal_event_attendees" USING btree ("event_id","user_id") WHERE "cal_event_attendees"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cal_event_attendees_event_email_uniq" ON "cal_event_attendees" USING btree ("event_id","email") WHERE "cal_event_attendees"."email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cal_events_org_calendar_dtstart_idx" ON "cal_events" USING btree ("organization_id","calendar_id","dtstart");--> statement-breakpoint
CREATE INDEX "cal_events_calendar_idx" ON "cal_events" USING btree ("calendar_id");