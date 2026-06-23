CREATE TYPE "public"."cal_reminder_channel" AS ENUM('in_app', 'email');--> statement-breakpoint
CREATE TYPE "public"."cal_reminder_status" AS ENUM('scheduled', 'fired', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cal_reminder_trigger" AS ENUM('relative', 'absolute');--> statement-breakpoint
CREATE TABLE "cal_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"channel" "cal_reminder_channel" DEFAULT 'in_app' NOT NULL,
	"trigger_kind" "cal_reminder_trigger" DEFAULT 'relative' NOT NULL,
	"offset_minutes" integer,
	"absolute_fire_at" timestamp with time zone,
	"next_fire_at" timestamp with time zone NOT NULL,
	"last_fired_at" timestamp with time zone,
	"status" "cal_reminder_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cal_reminders_trigger_xor" CHECK ((
				("cal_reminders"."trigger_kind" = 'relative' AND "cal_reminders"."offset_minutes" IS NOT NULL AND "cal_reminders"."absolute_fire_at" IS NULL)
				OR
				("cal_reminders"."trigger_kind" = 'absolute' AND "cal_reminders"."absolute_fire_at" IS NOT NULL AND "cal_reminders"."offset_minutes" IS NULL)
			))
);
--> statement-breakpoint
ALTER TABLE "cal_reminders" ADD CONSTRAINT "cal_reminders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_reminders" ADD CONSTRAINT "cal_reminders_event_id_cal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."cal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_reminders" ADD CONSTRAINT "cal_reminders_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cal_reminders_org_event_idx" ON "cal_reminders" USING btree ("organization_id","event_id");--> statement-breakpoint
CREATE INDEX "cal_reminders_due_idx" ON "cal_reminders" USING btree ("status","next_fire_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cal_reminders_event_owner_channel_offset_uniq" ON "cal_reminders" USING btree ("event_id","owner_user_id","channel","offset_minutes") WHERE "cal_reminders"."offset_minutes" IS NOT NULL;