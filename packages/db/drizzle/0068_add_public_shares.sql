CREATE TYPE "public"."public_share_resource_type" AS ENUM('chat_session', 'artifact');--> statement-breakpoint
CREATE TABLE "public_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"resource_type" "public_share_resource_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text,
	"payload" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "public_shares" ADD CONSTRAINT "public_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_shares" ADD CONSTRAINT "public_shares_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "public_shares_slug_uniq" ON "public_shares" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "public_shares_org_idx" ON "public_shares" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "public_shares_resource_idx" ON "public_shares" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "public_shares_created_by_idx" ON "public_shares" USING btree ("created_by_user_id");