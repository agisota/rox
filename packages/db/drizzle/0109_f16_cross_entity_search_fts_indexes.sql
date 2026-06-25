CREATE INDEX "chat_messages_fts_idx" ON "chat_messages" USING gin (to_tsvector('simple', coalesce("content", '')));--> statement-breakpoint
CREATE INDEX "drive_files_fts_idx" ON "drive_files" USING gin (to_tsvector('simple', coalesce("name", '')));--> statement-breakpoint
CREATE INDEX "journal_entries_fts_idx" ON "journal_entries" USING gin (to_tsvector('simple', coalesce("reflection", '')));--> statement-breakpoint
CREATE INDEX "tasks_fts_idx" ON "tasks" USING gin (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("description", '')));