CREATE TABLE "profile_mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"server_slug" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_skill_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_mcp_servers" ADD CONSTRAINT "profile_mcp_servers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_mcp_servers" ADD CONSTRAINT "profile_mcp_servers_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_mcp_servers" ADD CONSTRAINT "profile_mcp_servers_persona_org_fk" FOREIGN KEY ("persona_id","organization_id") REFERENCES "public"."agent_personas"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_skill_assignments" ADD CONSTRAINT "profile_skill_assignments_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_skill_assignments" ADD CONSTRAINT "profile_skill_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_skill_assignments" ADD CONSTRAINT "profile_skill_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_skill_assignments" ADD CONSTRAINT "profile_skill_assignments_persona_org_fk" FOREIGN KEY ("persona_id","organization_id") REFERENCES "public"."agent_personas"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_mcp_servers_persona_idx" ON "profile_mcp_servers" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "profile_mcp_servers_org_idx" ON "profile_mcp_servers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_mcp_servers_persona_server_unique" ON "profile_mcp_servers" USING btree ("persona_id","server_slug");--> statement-breakpoint
CREATE INDEX "profile_skill_assignments_persona_idx" ON "profile_skill_assignments" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "profile_skill_assignments_skill_idx" ON "profile_skill_assignments" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "profile_skill_assignments_org_idx" ON "profile_skill_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_skill_assignments_persona_skill_unique" ON "profile_skill_assignments" USING btree ("persona_id","skill_id");