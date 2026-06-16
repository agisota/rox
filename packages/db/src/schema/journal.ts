/**
 * Rox Journal — journal-memory epic.
 *
 * `journal_entries` is a per-user, per-day AI-generated reflection produced from
 * that day's chat sessions by the Rox R1 model. One row per (organization, user,
 * day). Four content streams live as columns: a narrative `reflection`,
 * `learnings`, `memory_suggestions` (candidates surfaced into the Memory
 * feature), and `tips`. Daily server-side generation upserts the row
 * idempotently on (organization_id, created_by, day).
 *
 * Pattern-matches `knowledge_documents` (org cascade FK, user FK, jsonb payloads,
 * timezone timestamps, indexes). NEVER hand-edit migrations — change this file
 * then run `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	date,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { journalEntryStatusValues, type MemoryCategory } from "./enums";

export const journalEntryStatus = pgEnum(
	"journal_entry_status",
	journalEntryStatusValues,
);

/** A single learning/insight distilled from the day. */
export type JournalLearning = {
	text: string;
} & Record<string, unknown>;

/** A memory candidate surfaced from the day; mirrors a Memory category. */
export type JournalMemorySuggestion = {
	body: string;
	category: MemoryCategory;
} & Record<string, unknown>;

/** A quick tip / hack / recommendation for the user. */
export type JournalTip = {
	text: string;
} & Record<string, unknown>;

export const journalEntries = pgTable(
	"journal_entries",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// The calendar day this entry summarizes (UTC date, no time component).
		day: date().notNull(),

		// Stream 1 — narrative reflection on the day's sessions.
		reflection: text(),
		// Stream 2 — insights/learnings distilled from the day.
		learnings: jsonb().$type<JournalLearning[]>().notNull().default([]),
		// Stream 3 — memory candidates (also materialized as memory_items rows).
		memorySuggestions: jsonb("memory_suggestions")
			.$type<JournalMemorySuggestion[]>()
			.notNull()
			.default([]),
		// Stream 4 — recommendations / hacks / quick tips.
		tips: jsonb().$type<JournalTip[]>().notNull().default([]),

		status: journalEntryStatus().notNull().default("pending"),
		modelId: text("model_id"),
		// Which chat sessions fed this entry (for regeneration + provenance).
		sourceSessionIds: jsonb("source_session_ids")
			.$type<string[]>()
			.notNull()
			.default([]),
		generatedAt: timestamp("generated_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("journal_entries_org_idx").on(t.organizationId),
		index("journal_entries_user_day_idx").on(t.createdBy, t.day),
		uniqueIndex("journal_entries_org_user_day_unique").on(
			t.organizationId,
			t.createdBy,
			t.day,
		),
	],
);

export type InsertJournalEntry = typeof journalEntries.$inferInsert;
export type SelectJournalEntry = typeof journalEntries.$inferSelect;
