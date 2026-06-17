/**
 * Graph core (#01) — `entities`, the universal node.
 *
 * A single org-scoped table backs every "thing" in Rox: notes, tasks, emails,
 * contacts, agent sessions, files, tags, … (see `entityKindValues`). Domain
 * subsystems add their own 1:1 detail tables keyed on `entities.id` and NEVER
 * redefine this table — the graph-service is the only writer of nodes.
 *
 * Provenance (`sourceRef`) is the NEUTRAL `EntitySourceRef` from `_shared.ts`,
 * not the domain `KnowledgeSourceRef` — the core must not depend on any domain
 * file. Linkable kinds (note/contact/tag/…) get a `slug`; the natural key is
 * `(org, kind, slug)` when `slug` is present.
 *
 * Mirrors `knowledge.ts`/`agent.ts` conventions: org cascade FK + org index,
 * `v2_project_id` set-null FK, jsonb bodies, lifecycle `status` enum instead of
 * `deleted_at`, timestamptz `created_at`/`updated_at` with `$onUpdate`, and
 * `$inferInsert`/`$inferSelect` exports. NEVER hand-edit migrations — change
 * this file then run `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import { sql } from "drizzle-orm";
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
import type { EntitySourceRef } from "./_shared";
import { organizations, users } from "./auth";
import { entityKindValues, entityStatusValues } from "./enums";
import { v2Projects } from "./schema";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const entityKind = pgEnum("entity_kind", entityKindValues);
export const entityStatus = pgEnum("entity_status", entityStatusValues);

// ---------------------------------------------------------------------------
// entities — the universal graph node
// ---------------------------------------------------------------------------

export const entities = pgTable(
	"entities",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),

		kind: entityKind().notNull(),
		// Address/wikilink slug for linkable kinds (note/contact/tag/…).
		slug: text(),
		title: text().notNull(),
		// Note-like rendered/source markdown (searchable).
		markdown: text(),
		// Structured body (block tree, parsed payload, …).
		body: jsonb().$type<Record<string, unknown>>(),
		// Pointer to a minio object for binary-backed nodes.
		storageRef: jsonb("storage_ref").$type<{
			bucket?: string;
			key?: string;
			mime?: string;
			size?: number;
		}>(),
		// Where the node came from (capture run, import, conversation, …).
		sourceRef: jsonb("source_ref").$type<EntitySourceRef>(),

		status: entityStatus().notNull().default("active"),
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
		index("entities_org_idx").on(t.organizationId),
		index("entities_kind_idx").on(t.kind),
		index("entities_project_idx").on(t.v2ProjectId),
		// Natural key of a linkable node: (org, kind, slug) when slug is set.
		uniqueIndex("entities_org_kind_slug_uniq")
			.on(t.organizationId, t.kind, t.slug)
			.where(sql`${t.slug} IS NOT NULL`),
		uniqueIndex("entities_id_org_uniq").on(t.id, t.organizationId),
	],
);

export type InsertEntity = typeof entities.$inferInsert;
export type SelectEntity = typeof entities.$inferSelect;
