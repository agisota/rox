ALTER TYPE "public"."integration_provider" ADD VALUE 'telegram';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'discord';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'notion';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'obsidian';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'fibery';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'lark';--> statement-breakpoint
ALTER TABLE "v2_hosts" ADD COLUMN "port" integer;--> statement-breakpoint
ALTER TABLE "v2_hosts" ADD COLUMN "protocol" text;