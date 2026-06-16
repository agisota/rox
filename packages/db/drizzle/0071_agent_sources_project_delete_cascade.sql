ALTER TABLE "agent_sources" DROP CONSTRAINT "agent_sources_v2_project_id_v2_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_sources" ADD CONSTRAINT "agent_sources_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE cascade ON UPDATE no action;