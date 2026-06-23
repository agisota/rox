CREATE TYPE "public"."mesh_delivery_status" AS ENUM('queued', 'sent', 'delivered', 'reconciled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."mesh_device_status" AS ENUM('active', 'revoked', 'reserved');--> statement-breakpoint
CREATE TYPE "public"."mesh_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TABLE "mesh_delivery_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid,
	"idempotency_key" text NOT NULL,
	"direction" "mesh_direction" NOT NULL,
	"status" "mesh_delivery_status" DEFAULT 'delivered' NOT NULL,
	"hops" integer,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconciled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mesh_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_label" text,
	"nostr_pubkey" text NOT NULL,
	"noise_static_pub" text,
	"ed25519_pub" text,
	"status" "mesh_device_status" DEFAULT 'active' NOT NULL,
	"reserved_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mesh_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mesh_relays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"url" text NOT NULL,
	"enabled" jsonb DEFAULT '{"enabled":true}'::jsonb NOT NULL,
	"priority" smallint DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mesh_delivery_log" ADD CONSTRAINT "mesh_delivery_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesh_devices" ADD CONSTRAINT "mesh_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesh_devices" ADD CONSTRAINT "mesh_devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesh_relays" ADD CONSTRAINT "mesh_relays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mesh_delivery_log_org_key_dir_uniq" ON "mesh_delivery_log" USING btree ("organization_id","idempotency_key","direction");--> statement-breakpoint
CREATE INDEX "mesh_delivery_log_message_idx" ON "mesh_delivery_log" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "mesh_delivery_log_status_idx" ON "mesh_delivery_log" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "mesh_devices_pubkey_uniq" ON "mesh_devices" USING btree ("nostr_pubkey");--> statement-breakpoint
CREATE INDEX "mesh_devices_user_idx" ON "mesh_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mesh_devices_org_idx" ON "mesh_devices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "mesh_devices_pubkey_status_idx" ON "mesh_devices" USING btree ("nostr_pubkey","status");--> statement-breakpoint
CREATE INDEX "mesh_nonces_expires_idx" ON "mesh_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mesh_relays_org_url_uniq" ON "mesh_relays" USING btree ("organization_id","url") WHERE "mesh_relays"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mesh_relays_global_url_uniq" ON "mesh_relays" USING btree ("url") WHERE "mesh_relays"."organization_id" IS NULL;--> statement-breakpoint
CREATE INDEX "mesh_relays_org_idx" ON "mesh_relays" USING btree ("organization_id");