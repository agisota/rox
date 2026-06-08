CREATE TYPE "public"."v2_host_kind" AS ENUM('local', 'remote', 'sandbox');--> statement-breakpoint
CREATE TYPE "public"."v2_host_provider" AS ENUM('daytona', 'modal', 'e2b', 'self');--> statement-breakpoint
ALTER TABLE "v2_hosts" ADD COLUMN "kind" "v2_host_kind" DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "v2_hosts" ADD COLUMN "provider" "v2_host_provider";--> statement-breakpoint
ALTER TABLE "v2_hosts" ADD COLUMN "expires_at" timestamp with time zone;