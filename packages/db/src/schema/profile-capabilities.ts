/**
 * Profile-scoped capability assignments (Hermes-borrow F47, #644).
 *
 * Per-persona capability set: which org skills and which MCP servers a given
 * `agent_personas` row (F21) has been granted. Keyed by `personaId` so the
 * active-persona pointer (`active_personas`, F21/F22) selects the capability
 * set — switching persona switches the capabilities the operator presents.
 *
 *   profile_skill_assignments  → (persona, skill) grant rows
 *   profile_mcp_servers        → (persona, mcp server) grant rows
 *
 * Both tables follow the org-collaboration convention (see `org-library.ts`):
 * a denormalized `organization_id` on every row for ElectricSQL shape-filtering
 * (`organization_id = $1`), plus a composite same-org FK to `agent_personas`
 * (`(persona_id, organization_id) → agent_personas (id, organization_id)`) so a
 * grant can only ever reference a persona in the SAME org. NO secret material
 * lives here — MCP servers are referenced by a stable slug, never by token; the
 * inventory router redacts secrets server-side.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import { relations } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { agentPersonas } from "./personas";
import { skills } from "./workflow";

// ---------------------------------------------------------------------------
// profile_skill_assignments — grant an org skill to a persona
// ---------------------------------------------------------------------------

export const profileSkillAssignments = pgTable(
	"profile_skill_assignments",
	{
		id: uuid().primaryKey().defaultRandom(),
		personaId: uuid("persona_id").notNull(),
		skillId: uuid("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
		// Denormalized for Electric shape filtering (org-library pattern). Also the
		// same-org composite-FK column, so a persona can only be granted a skill in
		// its own org.
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// A grant can be present-but-disabled so a persona keeps the row (and any
		// config) while temporarily turning the skill off — this is what drives the
		// `enabled/total` coverage badge.
		enabled: boolean().notNull().default(true),

		assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
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
		index("profile_skill_assignments_persona_idx").on(t.personaId),
		index("profile_skill_assignments_skill_idx").on(t.skillId),
		index("profile_skill_assignments_org_idx").on(t.organizationId),
		// One assignment row per (persona, skill).
		uniqueIndex("profile_skill_assignments_persona_skill_unique").on(
			t.personaId,
			t.skillId,
		),
		// Same-org guarantee: the grant's persona must live in the grant's org.
		foreignKey({
			columns: [t.personaId, t.organizationId],
			foreignColumns: [agentPersonas.id, agentPersonas.organizationId],
			name: "profile_skill_assignments_persona_org_fk",
		}).onDelete("cascade"),
	],
);

export type InsertProfileSkillAssignment =
	typeof profileSkillAssignments.$inferInsert;
export type SelectProfileSkillAssignment =
	typeof profileSkillAssignments.$inferSelect;

// ---------------------------------------------------------------------------
// profile_mcp_servers — grant an MCP server to a persona
// ---------------------------------------------------------------------------

export const profileMcpServers = pgTable(
	"profile_mcp_servers",
	{
		id: uuid().primaryKey().defaultRandom(),
		personaId: uuid("persona_id").notNull(),
		// Stable slug of the MCP server in the registry (e.g. `rox-builtin`).
		// Referenced by slug — NEVER by token — so no secret lives in this row.
		serverSlug: text("server_slug").notNull(),
		// Denormalized for Electric shape filtering + the same-org composite FK.
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		enabled: boolean().notNull().default(true),

		assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
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
		index("profile_mcp_servers_persona_idx").on(t.personaId),
		index("profile_mcp_servers_org_idx").on(t.organizationId),
		// One grant row per (persona, server slug).
		uniqueIndex("profile_mcp_servers_persona_server_unique").on(
			t.personaId,
			t.serverSlug,
		),
		foreignKey({
			columns: [t.personaId, t.organizationId],
			foreignColumns: [agentPersonas.id, agentPersonas.organizationId],
			name: "profile_mcp_servers_persona_org_fk",
		}).onDelete("cascade"),
	],
);

export type InsertProfileMcpServer = typeof profileMcpServers.$inferInsert;
export type SelectProfileMcpServer = typeof profileMcpServers.$inferSelect;

// ---------------------------------------------------------------------------
// relations
// ---------------------------------------------------------------------------

export const profileSkillAssignmentsRelations = relations(
	profileSkillAssignments,
	({ one }) => ({
		persona: one(agentPersonas, {
			fields: [profileSkillAssignments.personaId],
			references: [agentPersonas.id],
		}),
		skill: one(skills, {
			fields: [profileSkillAssignments.skillId],
			references: [skills.id],
		}),
		organization: one(organizations, {
			fields: [profileSkillAssignments.organizationId],
			references: [organizations.id],
		}),
	}),
);

export const profileMcpServersRelations = relations(
	profileMcpServers,
	({ one }) => ({
		persona: one(agentPersonas, {
			fields: [profileMcpServers.personaId],
			references: [agentPersonas.id],
		}),
		organization: one(organizations, {
			fields: [profileMcpServers.organizationId],
			references: [organizations.id],
		}),
	}),
);
