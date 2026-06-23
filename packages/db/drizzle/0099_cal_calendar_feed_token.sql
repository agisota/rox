ALTER TABLE "cal_calendars" ADD COLUMN "feed_token" text;--> statement-breakpoint
ALTER TABLE "cal_calendars" ADD COLUMN "feed_token_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cal_calendars" ADD COLUMN "feed_busy_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cal_calendars_feed_token_uniq" ON "cal_calendars" USING btree ("feed_token") WHERE "cal_calendars"."feed_token" IS NOT NULL;