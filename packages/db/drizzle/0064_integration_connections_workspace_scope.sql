CREATE TABLE "integration_inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid,
	"provider" "integration_provider" NOT NULL,
	"external_event_id" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_connections" DROP CONSTRAINT "integration_connections_unique";--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "integration_inbound_events" ADD CONSTRAINT "integration_inbound_events_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_inbound_events_provider_event_unique" ON "integration_inbound_events" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE INDEX "integration_inbound_events_connection_idx" ON "integration_inbound_events" USING btree ("connection_id");--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_org_provider_unique" ON "integration_connections" USING btree ("organization_id","provider") WHERE "integration_connections"."workspace_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_org_provider_workspace_unique" ON "integration_connections" USING btree ("organization_id","provider","workspace_id") WHERE "integration_connections"."workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "integration_connections_workspace_idx" ON "integration_connections" USING btree ("workspace_id");