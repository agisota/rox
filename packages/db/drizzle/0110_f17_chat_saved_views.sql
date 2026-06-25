CREATE TABLE "chat_saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"color" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_saved_views" ADD CONSTRAINT "chat_saved_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_saved_views" ADD CONSTRAINT "chat_saved_views_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_saved_views_org_idx" ON "chat_saved_views" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_saved_views_org_name_unique" ON "chat_saved_views" USING btree ("organization_id","name");