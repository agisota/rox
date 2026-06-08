CREATE TABLE "payment_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attribution_id" uuid,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"external_id" text NOT NULL,
	"amount_usd" numeric(20, 6) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_attribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"landing_page" text,
	"referrer" text,
	"last_utm_source" text,
	"last_utm_medium" text,
	"last_utm_campaign" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_touch_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD CONSTRAINT "payment_attributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD CONSTRAINT "payment_attributions_attribution_id_user_attribution_id_fk" FOREIGN KEY ("attribution_id") REFERENCES "public"."user_attribution"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_attribution" ADD CONSTRAINT "user_attribution_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attributions_provider_external_uniq" ON "payment_attributions" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "payment_attributions_user_idx" ON "payment_attributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_attributions_utm_campaign_idx" ON "payment_attributions" USING btree ("utm_campaign");--> statement-breakpoint
CREATE UNIQUE INDEX "user_attribution_user_id_uniq" ON "user_attribution" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_attribution_utm_source_idx" ON "user_attribution" USING btree ("utm_source");--> statement-breakpoint
CREATE INDEX "user_attribution_utm_campaign_idx" ON "user_attribution" USING btree ("utm_campaign");