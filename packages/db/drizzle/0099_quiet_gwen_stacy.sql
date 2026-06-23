CREATE TABLE "comment_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_entity_org_fk" FOREIGN KEY ("entity_id","organization_id") REFERENCES "public"."entities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_thread_id_comment_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comment_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_threads_org_idx" ON "comment_threads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "comment_threads_project_idx" ON "comment_threads" USING btree ("v2_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_threads_org_entity_uniq" ON "comment_threads" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE INDEX "comments_org_idx" ON "comments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "comments_thread_created_idx" ON "comments" USING btree ("thread_id","created_at");