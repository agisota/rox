CREATE TYPE "public"."rox_ledger_kind" AS ENUM('topup', 'request_charge', 'adjustment', 'seed');--> statement-breakpoint
CREATE TYPE "public"."rox_topup_status" AS ENUM('pending', 'confirmed', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "model_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"public_usd_per_m_in" numeric(20, 6) DEFAULT '0' NOT NULL,
	"public_usd_per_m_out" numeric(20, 6) DEFAULT '0' NOT NULL,
	"pricing_family" text NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"params" jsonb,
	"specs" jsonb,
	"tools" jsonb,
	"limits" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rox_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance_rox" numeric(20, 6) DEFAULT '500' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rox_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"delta_rox" numeric(20, 6) NOT NULL,
	"kind" "rox_ledger_kind" NOT NULL,
	"usage_request_id" uuid,
	"topup_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rox_topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"usdt_amount" numeric(20, 6) NOT NULL,
	"rox_amount" numeric(20, 6) NOT NULL,
	"dvnet_invoice_id" text NOT NULL,
	"status" "rox_topup_status" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"chat_session_id" uuid,
	"model_id" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"usd_cost" numeric(20, 6) DEFAULT '0' NOT NULL,
	"rox_cost" numeric(20, 6) DEFAULT '0' NOT NULL,
	"trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rox_balances" ADD CONSTRAINT "rox_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rox_ledger" ADD CONSTRAINT "rox_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rox_ledger" ADD CONSTRAINT "rox_ledger_usage_request_id_usage_requests_id_fk" FOREIGN KEY ("usage_request_id") REFERENCES "public"."usage_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rox_ledger" ADD CONSTRAINT "rox_ledger_topup_id_rox_topups_id_fk" FOREIGN KEY ("topup_id") REFERENCES "public"."rox_topups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rox_topups" ADD CONSTRAINT "rox_topups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_requests" ADD CONSTRAINT "usage_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_requests" ADD CONSTRAINT "usage_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_requests" ADD CONSTRAINT "usage_requests_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_catalog_model_id_uniq" ON "model_catalog" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "model_catalog_provider_idx" ON "model_catalog" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "model_catalog_pricing_family_idx" ON "model_catalog" USING btree ("pricing_family");--> statement-breakpoint
CREATE UNIQUE INDEX "rox_balances_user_id_uniq" ON "rox_balances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rox_ledger_user_created_idx" ON "rox_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "rox_ledger_kind_idx" ON "rox_ledger" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "rox_topups_dvnet_invoice_id_uniq" ON "rox_topups" USING btree ("dvnet_invoice_id");--> statement-breakpoint
CREATE INDEX "rox_topups_user_idx" ON "rox_topups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rox_topups_status_idx" ON "rox_topups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "usage_requests_user_created_idx" ON "usage_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_requests_model_idx" ON "usage_requests" USING btree ("model_id");