CREATE TABLE "user_ambient_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"ambient_enabled" boolean DEFAULT false NOT NULL,
	"voice_agent_context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_ambient_settings" ADD CONSTRAINT "user_ambient_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ambient_settings" ADD CONSTRAINT "user_ambient_settings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_ambient_settings_org_user_unique" ON "user_ambient_settings" USING btree ("organization_id","created_by");--> statement-breakpoint
CREATE INDEX "user_ambient_settings_enabled_idx" ON "user_ambient_settings" USING btree ("ambient_enabled","organization_id");