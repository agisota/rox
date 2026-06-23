CREATE TYPE "public"."registration_provider" AS ENUM('telegram', 'yandex', 'x', 'github', 'email');--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "handle" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "registration_provider" "registration_provider";--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "provider_account_id" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "display_username" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "provider_avatar_url" text;