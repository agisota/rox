/**
 * Graph core (#01) — `edges`, typed relations between nodes.
 *
 * Every relation in the graph is one `edges` row: `links_to`, `derived_from`
 * (the "promote" carrier), `tagged_with`, `mentions`, `authored_by`, … (see
 * `edgeRelationValues`). An edge may be UNRESOLVED — a raw `[[wikilink]]` whose
 * target slug does not yet exist — in which case `targetEntityId` is null,
 * `targetSlug` holds the raw slug and `resolved` is false.
 *
 * The graph-service is the only writer of edges. Dedup key is
 * `(source, target, relation)` for resolved links and
 * `(org, source, relation, targetSlug)` for unresolved wikilinks. Mirrors
 * `knowledge.ts`.
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { entities } from "./entity";
import { edgeRelationValues } from "./enums";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const edgeRelation = pgEnum("edge_relation", edgeRelationValues);

// ---------------------------------------------------------------------------
// edges — typed relations (carries promote + unresolved wikilinks)
// ---------------------------------------------------------------------------

export const edges = pgTable(
	"edges",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		sourceEntityId: uuid("source_entity_id").notNull(),
		// Null = unresolved (the [[wikilink]] target does not yet exist).
		targetEntityId: uuid("target_entity_id").references(() => entities.id, {
			onDelete: "set null",
		}),
		// Raw [[wikilink]] slug while unresolved.
		targetSlug: text("target_slug"),
		resolved: boolean().notNull().default(false),
		relation: edgeRelation().notNull(),
		metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("edges_org_idx").on(t.organizationId),
		index("edges_source_idx").on(t.sourceEntityId),
		index("edges_target_idx").on(t.targetEntityId),
		index("edges_relation_idx").on(t.relation),
		foreignKey({
			columns: [t.sourceEntityId, t.organizationId],
			foreignColumns: [entities.id, entities.organizationId],
			name: "edges_source_entity_org_fk",
		}).onDelete("cascade"),
		uniqueIndex("edges_source_target_relation_uniq")
			.on(t.sourceEntityId, t.targetEntityId, t.relation)
			.where(sql`${t.targetEntityId} IS NOT NULL`),
		uniqueIndex("edges_source_relation_slug_uniq")
			.on(t.organizationId, t.sourceEntityId, t.relation, t.targetSlug)
			.where(sql`${t.targetEntityId} IS NULL AND ${t.targetSlug} IS NOT NULL`),
	],
);

export type InsertEdge = typeof edges.$inferInsert;
export type SelectEdge = typeof edges.$inferSelect;
