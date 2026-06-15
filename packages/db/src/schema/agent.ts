/**
 * Agent-native — external agent "source" registry.
 *
 * An `agent_sources` row is a first-class, org-scoped registry entry for an
 * external agent backend (Claude Code, Codex, Cursor, OpenCode, a raw MCP
 * server, or a generic HTTP endpoint). Credentials are NEVER stored in
 * plaintext: either link an existing OAuth credential via
 * `integration_connection_id`, or store AES-encrypted material in
 * `encrypted_config` (mirrors the `secrets` model).
 *
 * Follows the `workflow.ts` conventions: `uuid().primaryKey().defaultRandom()`,
 * org cascade FK + org index, timestamptz `created_at`/`updated_at` with
 * `$onUpdate`, enums sourced from `enums.ts`, a lifecycle `status` enum instead
 * of `deleted_at`, and `$inferInsert`/`$inferSelect` exports.
 *
 * NOTE: never hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
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
import { agentSourceKindValues, agentSourceStatusValues } from "./enums";
import { integrationConnections, v2Projects } from "./schema";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const agentSourceKind = pgEnum(
	"agent_source_kind",
	agentSourceKindValues,
);
export const agentSourceStatus = pgEnum(
	"agent_source_status",
	agentSourceStatusValues,
);

// ---------------------------------------------------------------------------
// agent_sources — registry of external agent backends per org/project
// ---------------------------------------------------------------------------

export const agentSources = pgTable(
	"agent_sources",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		slug: text().notNull(),
		name: text().notNull(),
		description: text(),
		kind: agentSourceKind().notNull(),
		status: agentSourceStatus().notNull().default("active"),

		// Optional link to an existing OAuth credential (for OAuth-backed sources).
		integrationConnectionId: uuid("integration_connection_id").references(
			() => integrationConnections.id,
			{ onDelete: "set null" },
		),
		// AES-encrypted credential blob (api-key / endpoint sources). Plaintext
		// credentials are never stored here.
		encryptedConfig: text("encrypted_config"),

		config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		capabilities: jsonb().$type<string[]>().notNull().default([]),
		endpointUrl: text("endpoint_url"),
		version: text(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("agent_sources_org_project_slug_uniq").on(
			t.organizationId,
			t.v2ProjectId,
			t.slug,
		),
		index("agent_sources_org_idx").on(t.organizationId),
		index("agent_sources_project_idx").on(t.v2ProjectId),
		index("agent_sources_kind_idx").on(t.kind),
	],
);

export type InsertAgentSource = typeof agentSources.$inferInsert;
export type SelectAgentSource = typeof agentSources.$inferSelect;
