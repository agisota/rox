CREATE TYPE "public"."handle_status" AS ENUM('active', 'grace');--> statement-breakpoint
ALTER TYPE "public"."access_resource_type" ADD VALUE 'note';--> statement-breakpoint
CREATE TABLE "identity_handles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_handle" text NOT NULL,
	"current_owner_user_id" uuid,
	"first_owner_user_id" uuid,
	"status" "handle_status" DEFAULT 'active' NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comms_addresses" ADD COLUMN "handle_id" uuid;--> statement-breakpoint
ALTER TABLE "mail_addresses" ADD COLUMN "handle_id" uuid;--> statement-breakpoint
ALTER TABLE "identity_handles" ADD CONSTRAINT "identity_handles_current_owner_user_id_users_id_fk" FOREIGN KEY ("current_owner_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_handles" ADD CONSTRAINT "identity_handles_first_owner_user_id_users_id_fk" FOREIGN KEY ("first_owner_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_handles_normalized_uniq" ON "identity_handles" USING btree ("normalized_handle");--> statement-breakpoint
ALTER TABLE "comms_addresses" ADD CONSTRAINT "comms_addresses_handle_id_identity_handles_id_fk" FOREIGN KEY ("handle_id") REFERENCES "public"."identity_handles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_addresses" ADD CONSTRAINT "mail_addresses_handle_id_identity_handles_id_fk" FOREIGN KEY ("handle_id") REFERENCES "public"."identity_handles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comms_addresses_kind_value_primary_uniq" ON "comms_addresses" USING btree ("kind","value") WHERE "comms_addresses"."is_alias" = false;