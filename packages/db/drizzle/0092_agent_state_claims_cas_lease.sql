CREATE TABLE "agent_state_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"key" text NOT NULL,
	"owner_device" text NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_state_claims" ADD CONSTRAINT "agent_state_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_state_claims_org_idx" ON "agent_state_claims" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_state_claims_lease_idx" ON "agent_state_claims" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_state_claims_org_scope_key_uniq" ON "agent_state_claims" USING btree ("organization_id","scope","scope_id","key");