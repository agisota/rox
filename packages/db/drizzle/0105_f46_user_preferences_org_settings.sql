CREATE TABLE "org_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"values" jsonb DEFAULT '{"defaultLocale":"","defaultTagPrefs":[],"sharedViews":[],"defaultLocaleUpdatedAt":0,"defaultTagPrefsUpdatedAt":0,"sharedViewsUpdatedAt":0}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"values" jsonb DEFAULT '{"pins":[],"tagPrefs":[],"savedViews":[],"disclosure":{},"locale":"","rightPanelPeek":false,"pinsUpdatedAt":0,"tagPrefsUpdatedAt":0,"savedViewsUpdatedAt":0,"disclosureUpdatedAt":0,"localeUpdatedAt":0,"rightPanelPeekUpdatedAt":0}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_settings_org_unique" ON "org_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_org_user_unique" ON "user_preferences" USING btree ("organization_id","created_by");--> statement-breakpoint
CREATE INDEX "user_preferences_org_idx" ON "user_preferences" USING btree ("organization_id");