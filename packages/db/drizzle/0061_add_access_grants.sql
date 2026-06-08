CREATE TYPE "public"."access_grantee_type" AS ENUM('user', 'team', 'organization');--> statement-breakpoint
CREATE TYPE "public"."access_resource_type" AS ENUM('project', 'workspace', 'host');--> statement-breakpoint
CREATE TYPE "public"."access_role" AS ENUM('viewer', 'editor', 'admin');--> statement-breakpoint
CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"resource_type" "access_resource_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"grantee_type" "access_grantee_type" NOT NULL,
	"grantee_id" uuid NOT NULL,
	"role" "access_role" NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_grants_unique" UNIQUE("organization_id","resource_type","resource_id","grantee_type","grantee_id")
);
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_grants_organization_id_idx" ON "access_grants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "access_grants_resource_idx" ON "access_grants" USING btree ("resource_type","resource_id");