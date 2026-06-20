CREATE TYPE "public"."xmpp_account_status" AS ENUM('active', 'suspended', 'reserved', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."xmpp_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."xmpp_fed_policy" AS ENUM('allow', 'deny', 'throttle');--> statement-breakpoint
CREATE TYPE "public"."xmpp_subscription" AS ENUM('none', 'to', 'from', 'both', 'pending_out', 'pending_in');--> statement-breakpoint
ALTER TYPE "public"."identity_kind" ADD VALUE 'xmpp';--> statement-breakpoint
CREATE TABLE "xmpp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"jid_localpart" text NOT NULL,
	"domain" text DEFAULT 'xmpp.rox.one' NOT NULL,
	"status" "xmpp_account_status" DEFAULT 'active' NOT NULL,
	"resource_policy" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xmpp_federation_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"policy" "xmpp_fed_policy" DEFAULT 'allow' NOT NULL,
	"rate_per_min" integer,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xmpp_jid_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"jid_localpart" text NOT NULL,
	"reserved_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xmpp_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xmpp_offline_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "xmpp_direction" NOT NULL,
	"from_jid" text NOT NULL,
	"to_jid" text NOT NULL,
	"stanza_kind" text NOT NULL,
	"stanza" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin_id" text,
	"delivered_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xmpp_roster_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"remote_jid" text NOT NULL,
	"contact_entity_id" uuid,
	"subscription" "xmpp_subscription" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "xmpp_accounts" ADD CONSTRAINT "xmpp_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xmpp_accounts" ADD CONSTRAINT "xmpp_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xmpp_jid_aliases" ADD CONSTRAINT "xmpp_jid_aliases_account_id_xmpp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."xmpp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xmpp_offline_queue" ADD CONSTRAINT "xmpp_offline_queue_account_id_xmpp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."xmpp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xmpp_roster_links" ADD CONSTRAINT "xmpp_roster_links_account_id_xmpp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."xmpp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xmpp_roster_links" ADD CONSTRAINT "xmpp_roster_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "xmpp_accounts_domain_localpart_uniq" ON "xmpp_accounts" USING btree ("domain","jid_localpart");--> statement-breakpoint
CREATE UNIQUE INDEX "xmpp_accounts_user_uniq" ON "xmpp_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "xmpp_accounts_user_idx" ON "xmpp_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "xmpp_accounts_org_idx" ON "xmpp_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xmpp_federation_policy_domain_uniq" ON "xmpp_federation_policy" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "xmpp_jid_aliases_localpart_uniq" ON "xmpp_jid_aliases" USING btree ("jid_localpart");--> statement-breakpoint
CREATE INDEX "xmpp_jid_aliases_account_idx" ON "xmpp_jid_aliases" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "xmpp_nonces_expires_idx" ON "xmpp_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "xmpp_offline_queue_account_origin_uniq" ON "xmpp_offline_queue" USING btree ("account_id","origin_id") WHERE "xmpp_offline_queue"."origin_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "xmpp_offline_queue_account_delivered_idx" ON "xmpp_offline_queue" USING btree ("account_id","delivered_at");--> statement-breakpoint
CREATE INDEX "xmpp_offline_queue_expires_idx" ON "xmpp_offline_queue" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "xmpp_roster_links_account_remote_uniq" ON "xmpp_roster_links" USING btree ("account_id","remote_jid");--> statement-breakpoint
CREATE INDEX "xmpp_roster_links_account_idx" ON "xmpp_roster_links" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "xmpp_roster_links_org_idx" ON "xmpp_roster_links" USING btree ("organization_id");