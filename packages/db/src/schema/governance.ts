/**
 * Workspace governance items (#517) — Electric-synced, org-scoped store for the
 * v2 workspace "Управление" panel: ЦЕЛИ (goals), ЗАДАЧИ (tasks), МИССИИ
 * (missions).
 *
 * Replaces the former localStorage-only collection with a real Postgres table
 * that syncs through the electric-proxy org shape, mirroring the per-org synced
 * pattern of `automations` (org cascade FK + bare `v2_workspace_id`) and the
 * org+author spine of `memory_items` (`organization_id` + `created_by`, both
 * cascade FKs). Governance items are shared across the org's workspace members,
 * so the electric shape filter is a plain `organization_id = $1`; `created_by`
 * is kept for audit/attribution parity, not for per-user isolation.
 *
 * The renderer generates the row `id` (crypto.randomUUID) and inserts it
 * optimistically, so the column carries a `defaultRandom()` for server-side
 * inserts but accepts a client-provided id — same as `automations`/`v2_*`.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { governanceKindValues } from "./enums";
import { v2Workspaces } from "./schema";

export const governanceKind = pgEnum("governance_kind", governanceKindValues);

// ---------------------------------------------------------------------------
// workspace_governance_items — per-(organization, v2 workspace) goals/tasks/
// missions shown in the "Управление" panel.
// ---------------------------------------------------------------------------

export const workspaceGovernanceItems = pgTable(
	"workspace_governance_items",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// The v2 workspace this item belongs to. Real FK (governance is strictly
		// per-workspace), unlike `automations.v2_workspace_id` which is optional.
		v2WorkspaceId: uuid("v2_workspace_id")
			.notNull()
			.references(() => v2Workspaces.id, { onDelete: "cascade" }),
		// Author of the item — kept for audit/attribution parity with
		// `memory_items`; org members share the panel, so this is not a scope key.
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		kind: governanceKind().notNull(),
		text: text().notNull(),
		/** Sort order within (v2_workspace_id, kind); lower renders first. */
		order: integer().notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("workspace_governance_items_organization_idx").on(t.organizationId),
		index("workspace_governance_items_workspace_idx").on(t.v2WorkspaceId),
	],
);

export type InsertWorkspaceGovernanceItem =
	typeof workspaceGovernanceItems.$inferInsert;
export type SelectWorkspaceGovernanceItem =
	typeof workspaceGovernanceItems.$inferSelect;
