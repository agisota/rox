CREATE TABLE "note_backlinks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_note_id" uuid NOT NULL,
	"target_note_id" uuid,
	"target_title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_notebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"v2_project_id" uuid,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"markdown" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"knowledge_document_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"public_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_backlinks" ADD CONSTRAINT "note_backlinks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_backlinks" ADD CONSTRAINT "note_backlinks_source_note_id_note_notes_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."note_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_backlinks" ADD CONSTRAINT "note_backlinks_target_note_id_note_notes_id_fk" FOREIGN KEY ("target_note_id") REFERENCES "public"."note_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_notebooks" ADD CONSTRAINT "note_notebooks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_notebooks" ADD CONSTRAINT "note_notebooks_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_notebooks" ADD CONSTRAINT "note_notebooks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_notes" ADD CONSTRAINT "note_notes_notebook_id_note_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."note_notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_notes" ADD CONSTRAINT "note_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_notes" ADD CONSTRAINT "note_notes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_notes" ADD CONSTRAINT "note_notes_knowledge_document_id_knowledge_documents_id_fk" FOREIGN KEY ("knowledge_document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_backlinks_org_idx" ON "note_backlinks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "note_backlinks_source_idx" ON "note_backlinks" USING btree ("source_note_id");--> statement-breakpoint
CREATE INDEX "note_backlinks_target_idx" ON "note_backlinks" USING btree ("target_note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_backlinks_source_target_unique" ON "note_backlinks" USING btree ("source_note_id","target_title");--> statement-breakpoint
CREATE INDEX "note_notebooks_org_idx" ON "note_notebooks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "note_notebooks_owner_idx" ON "note_notebooks" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "note_notebooks_project_idx" ON "note_notebooks" USING btree ("v2_project_id");--> statement-breakpoint
CREATE INDEX "note_notes_notebook_idx" ON "note_notes" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "note_notes_org_idx" ON "note_notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "note_notes_owner_idx" ON "note_notes" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "note_notes_knowledge_document_idx" ON "note_notes" USING btree ("knowledge_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_notes_public_slug_unique" ON "note_notes" USING btree ("public_slug");