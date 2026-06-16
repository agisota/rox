/**
 * Rox Memory — journal-memory epic.
 *
 * `memory_items` is a per-user curated memory store, grouped into five
 * categories. Items arrive from four sources: the user typing them (`manual`),
 * the daily agent suggesting them (`agent`), an uploaded chat-export archive
 * (`archive`), or a pasted prompt-import dump (`prompt`). Non-manual items land
 * as `suggested` and become `approved`/`dismissed` via the Approve/Decline UI;
 * manual items are `approved` on creation.
 *
 * `memory_import_jobs` tracks the async archive-import lifecycle (upload to
 * Vercel Blob → parse → R1 classify → memory_items). Prompt-import is synchronous
 * and does not create a job.
 *
 * Pattern-matches `knowledge_documents`. NEVER hand-edit migrations — change this
 * file then run `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import {
	memoryCategoryValues,
	memoryImportProviderValues,
	memoryImportStatusValues,
	memorySourceValues,
	memoryStatusValues,
} from "./enums";

export const memoryCategory = pgEnum("memory_category", memoryCategoryValues);
export const memorySource = pgEnum("memory_source", memorySourceValues);
export const memoryStatus = pgEnum("memory_status", memoryStatusValues);
export const memoryImportProvider = pgEnum(
	"memory_import_provider",
	memoryImportProviderValues,
);
export const memoryImportStatus = pgEnum(
	"memory_import_status",
	memoryImportStatusValues,
);

/** Provenance for a memory item (which session/day/import produced it). */
export type MemorySourceRef = {
	sessionId?: string;
	day?: string;
	conversationId?: string;
	importedAt?: string;
} & Record<string, unknown>;

/** Aggregate counts for an archive-import job. */
export type MemoryImportStats = {
	conversations?: number;
	parsed?: number;
	imported?: number;
} & Record<string, unknown>;

// ---------------------------------------------------------------------------
// memory_import_jobs — async archive-import lifecycle
// ---------------------------------------------------------------------------

export const memoryImportJobs = pgTable(
	"memory_import_jobs",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		provider: memoryImportProvider().notNull(),
		blobUrl: text("blob_url"),
		status: memoryImportStatus().notNull().default("pending"),
		stats: jsonb().$type<MemoryImportStats>().notNull().default({}),
		error: text(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("memory_import_jobs_org_idx").on(t.organizationId),
		index("memory_import_jobs_user_idx").on(t.createdBy),
	],
);

export type InsertMemoryImportJob = typeof memoryImportJobs.$inferInsert;
export type SelectMemoryImportJob = typeof memoryImportJobs.$inferSelect;

// ---------------------------------------------------------------------------
// memory_items — curated per-user memory store
// ---------------------------------------------------------------------------

export const memoryItems = pgTable(
	"memory_items",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		category: memoryCategory().notNull().default("general"),
		body: text().notNull(),
		source: memorySource().notNull().default("manual"),
		status: memoryStatus().notNull().default("suggested"),
		sourceRef: jsonb("source_ref").$type<MemorySourceRef>(),
		importJobId: uuid("import_job_id").references(() => memoryImportJobs.id, {
			onDelete: "set null",
		}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("memory_items_org_idx").on(t.organizationId),
		index("memory_items_user_category_status_idx").on(
			t.createdBy,
			t.category,
			t.status,
		),
		index("memory_items_user_status_idx").on(t.createdBy, t.status),
		index("memory_items_import_job_idx").on(t.importJobId),
	],
);

export type InsertMemoryItem = typeof memoryItems.$inferInsert;
export type SelectMemoryItem = typeof memoryItems.$inferSelect;
