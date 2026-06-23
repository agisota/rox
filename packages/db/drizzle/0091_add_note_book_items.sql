CREATE TABLE "note_book_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"note_book_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_book_items" ADD CONSTRAINT "note_book_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_book_items" ADD CONSTRAINT "note_book_items_note_book_id_note_notebooks_id_fk" FOREIGN KEY ("note_book_id") REFERENCES "public"."note_notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_book_items" ADD CONSTRAINT "note_book_items_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_book_items" ADD CONSTRAINT "note_book_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_book_items_org_idx" ON "note_book_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "note_book_items_book_idx" ON "note_book_items" USING btree ("note_book_id","sort_order");--> statement-breakpoint
CREATE INDEX "note_book_items_doc_idx" ON "note_book_items" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_book_items_book_doc_uniq" ON "note_book_items" USING btree ("note_book_id","document_id");