CREATE TABLE "active_personas" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"handle" text,
	"accent_color" text NOT NULL,
	"theme_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_personas" ADD CONSTRAINT "active_personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_personas" ADD CONSTRAINT "active_personas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_personas" ADD CONSTRAINT "active_personas_persona_org_fk" FOREIGN KEY ("persona_id","organization_id") REFERENCES "public"."agent_personas"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD CONSTRAINT "agent_personas_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD CONSTRAINT "agent_personas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "active_personas_user_org_pk" ON "active_personas" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "active_personas_persona_idx" ON "active_personas" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "agent_personas_org_idx" ON "agent_personas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_personas_owner_idx" ON "agent_personas" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_personas_org_handle_unique" ON "agent_personas" USING btree ("organization_id","handle");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_personas_id_org_unique" ON "agent_personas" USING btree ("id","organization_id");