CREATE TABLE "journal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"automation_id" uuid,
	"automation_run_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_events" ADD CONSTRAINT "journal_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_events" ADD CONSTRAINT "journal_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_events" ADD CONSTRAINT "journal_events_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_events" ADD CONSTRAINT "journal_events_automation_run_id_automation_runs_id_fk" FOREIGN KEY ("automation_run_id") REFERENCES "public"."automation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_events_org_user_created_idx" ON "journal_events" USING btree ("organization_id","created_by","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "journal_events_automation_idx" ON "journal_events" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "journal_events_automation_run_idx" ON "journal_events" USING btree ("automation_run_id");