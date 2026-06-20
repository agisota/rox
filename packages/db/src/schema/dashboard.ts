/**
 * Rox Collaborative Org Dashboard — org-collaboration epic (WS-O §2.3, design
 * from WS-J §2.2).
 *
 * A *dashboard* is an org-scoped (optionally project-scoped) collaborative board
 * composed of typed *sections* (config / recommendation / note / priority /
 * artifact / product / reference / log) that each hold ordered *entries*.
 *
 *   dashboards          → the board (org + optional v2 project)
 *   dashboard_sections  → typed buckets (kind = dashboard_section_kind enum)
 *   dashboard_entries   → ordered items; an entry may carry inline jsonb `body`
 *                         AND/OR reference a `knowledge_documents` row so the
 *                         board REUSES the notebook MDX substrate instead of
 *                         duplicating document storage (WS-J §1.6 design rule).
 *
 * Every section/entry denormalizes `organization_id` (and entries also carry
 * `dashboard_id`) so ElectricSQL shape-filters by org with a plain
 * `organization_id = $1` predicate — the `team_members` denormalization pattern.
 *
 * The ephemeral presence/cursor layer (LiveBlocks, WS-L D3) mounts ON this
 * durable surface; LiveBlocks never owns content — these tables do.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { dashboardSectionKindValues } from "./enums";
import { knowledgeDocuments } from "./knowledge";
import { v2Projects } from "./schema";

// ---------------------------------------------------------------------------
// pgEnum
// ---------------------------------------------------------------------------

export const dashboardSectionKind = pgEnum(
	"dashboard_section_kind",
	dashboardSectionKindValues,
);

// ---------------------------------------------------------------------------
// dashboards — the collaborative board
// ---------------------------------------------------------------------------

export const dashboards = pgTable(
	"dashboards",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),

		slug: text().notNull(),
		name: text().notNull(),

		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
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
		index("dashboards_org_idx").on(t.organizationId),
		index("dashboards_project_idx").on(t.v2ProjectId),
		uniqueIndex("dashboards_org_slug_unique").on(t.organizationId, t.slug),
	],
);

export type InsertDashboard = typeof dashboards.$inferInsert;
export type SelectDashboard = typeof dashboards.$inferSelect;

// ---------------------------------------------------------------------------
// dashboard_sections — typed buckets within a board
// ---------------------------------------------------------------------------

export const dashboardSections = pgTable(
	"dashboard_sections",
	{
		id: uuid().primaryKey().defaultRandom(),
		dashboardId: uuid("dashboard_id")
			.notNull()
			.references(() => dashboards.id, { onDelete: "cascade" }),
		// Denormalized from dashboards.organization_id for Electric shape filtering.
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		kind: dashboardSectionKind().notNull(),
		title: text(),
		position: integer().notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("dashboard_sections_dashboard_idx").on(t.dashboardId),
		index("dashboard_sections_org_idx").on(t.organizationId),
	],
);

export type InsertDashboardSection = typeof dashboardSections.$inferInsert;
export type SelectDashboardSection = typeof dashboardSections.$inferSelect;

// ---------------------------------------------------------------------------
// dashboard_entries — ordered items; inline jsonb body and/or notebook MDX ref
// ---------------------------------------------------------------------------

export const dashboardEntries = pgTable(
	"dashboard_entries",
	{
		id: uuid().primaryKey().defaultRandom(),
		sectionId: uuid("section_id")
			.notNull()
			.references(() => dashboardSections.id, { onDelete: "cascade" }),
		// Denormalized from sections for direct board-level queries + Electric.
		dashboardId: uuid("dashboard_id")
			.notNull()
			.references(() => dashboards.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// Inline structured body the editor keeps alongside (or instead of) a
		// referenced notebook document.
		body: jsonb().$type<Record<string, unknown>>(),
		// REUSE the notebook MDX substrate: when set, the entry renders the
		// referenced knowledge_documents row. set-null so deleting a document
		// detaches the entry rather than removing it.
		knowledgeDocumentId: uuid("knowledge_document_id").references(
			() => knowledgeDocuments.id,
			{ onDelete: "set null" },
		),

		status: text(),
		priority: text(),
		position: integer().notNull().default(0),

		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
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
		index("dashboard_entries_section_idx").on(t.sectionId),
		index("dashboard_entries_dashboard_idx").on(t.dashboardId),
		index("dashboard_entries_org_idx").on(t.organizationId),
		index("dashboard_entries_knowledge_document_idx").on(t.knowledgeDocumentId),
	],
);

export type InsertDashboardEntry = typeof dashboardEntries.$inferInsert;
export type SelectDashboardEntry = typeof dashboardEntries.$inferSelect;
