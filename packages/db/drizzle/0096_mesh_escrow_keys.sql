CREATE TABLE "mesh_escrow_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"nostr_pubkey" text NOT NULL,
	"label" text,
	"active" jsonb DEFAULT '{"active":true}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mesh_escrow_keys" ADD CONSTRAINT "mesh_escrow_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mesh_escrow_keys_pubkey_uniq" ON "mesh_escrow_keys" USING btree ("nostr_pubkey");--> statement-breakpoint
CREATE INDEX "mesh_escrow_keys_org_idx" ON "mesh_escrow_keys" USING btree ("organization_id");