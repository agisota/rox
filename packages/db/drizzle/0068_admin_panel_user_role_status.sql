ALTER TABLE "auth"."sessions" ADD COLUMN "impersonated_by" uuid;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "ban_expires_at" timestamp;