/**
 * Rox Org Skill Libraries — org-collaboration epic (WS-O §2.2, design from WS-J §2.2).
 *
 * A *skill library* is a named, org-scoped (optionally project-scoped) grouping
 * of skills (`schema/workflow.ts` `skills`). Libraries let an org curate sets of
 * skills and assign them to teams:
 *   skill_libraries                 → the library itself (org + optional v2 project)
 *   skill_library_items             → membership rows (a skill can sit in many libs)
 *   skill_library_team_assignments  → which teams a library is granted to
 *
 * Pattern-matches the `knowledge_documents` / `artifacts` convention: org cascade
 * FK, `v2_project_id` set-null FK, a denormalized `organization_id` on every
 * leaf/join table so ElectricSQL can shape-filter by org with a plain
 * `organization_id = $1` predicate (the `team_members` denormalization pattern).
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, teams, users } from "./auth";
import { v2Projects } from "./schema";
import { skills } from "./workflow";

// ---------------------------------------------------------------------------
// skill_libraries — a named org/project-scoped grouping of skills
// ---------------------------------------------------------------------------

export const skillLibraries = pgTable(
	"skill_libraries",
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
		description: text(),

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
		index("skill_libraries_org_idx").on(t.organizationId),
		index("skill_libraries_project_idx").on(t.v2ProjectId),
		uniqueIndex("skill_libraries_org_slug_unique").on(t.organizationId, t.slug),
	],
);

export type InsertSkillLibrary = typeof skillLibraries.$inferInsert;
export type SelectSkillLibrary = typeof skillLibraries.$inferSelect;

// ---------------------------------------------------------------------------
// skill_library_items — membership (a skill can appear in many libraries)
// ---------------------------------------------------------------------------

export const skillLibraryItems = pgTable(
	"skill_library_items",
	{
		id: uuid().primaryKey().defaultRandom(),
		libraryId: uuid("library_id")
			.notNull()
			.references(() => skillLibraries.id, { onDelete: "cascade" }),
		skillId: uuid("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
		// Denormalized from skill_libraries.organization_id for Electric shape
		// filtering (mirrors the team_members pattern).
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		position: integer().notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("skill_library_items_library_idx").on(t.libraryId),
		index("skill_library_items_skill_idx").on(t.skillId),
		index("skill_library_items_org_idx").on(t.organizationId),
		uniqueIndex("skill_library_items_library_skill_unique").on(
			t.libraryId,
			t.skillId,
		),
	],
);

export type InsertSkillLibraryItem = typeof skillLibraryItems.$inferInsert;
export type SelectSkillLibraryItem = typeof skillLibraryItems.$inferSelect;

// ---------------------------------------------------------------------------
// skill_library_team_assignments — grant a library to a team
// ---------------------------------------------------------------------------

export const skillLibraryTeamAssignments = pgTable(
	"skill_library_team_assignments",
	{
		id: uuid().primaryKey().defaultRandom(),
		libraryId: uuid("library_id")
			.notNull()
			.references(() => skillLibraries.id, { onDelete: "cascade" }),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		// Denormalized from skill_libraries.organization_id for Electric shape
		// filtering (mirrors the team_members pattern).
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("skill_library_team_assignments_library_idx").on(t.libraryId),
		index("skill_library_team_assignments_team_idx").on(t.teamId),
		index("skill_library_team_assignments_org_idx").on(t.organizationId),
		uniqueIndex("skill_library_team_assignments_library_team_unique").on(
			t.libraryId,
			t.teamId,
		),
	],
);

export type InsertSkillLibraryTeamAssignment =
	typeof skillLibraryTeamAssignments.$inferInsert;
export type SelectSkillLibraryTeamAssignment =
	typeof skillLibraryTeamAssignments.$inferSelect;
