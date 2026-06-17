/**
 * Graph core (#01) — `idempotency_keys`, the POST-with-side-effect registry.
 *
 * Closes OV-1: the idempotency key of side-effecting POST mutations
 * (graph.create/promote/link/resolveIdentity/recordActivity and domain
 * create/import) is stored in the core — not in `edges.metadata`, not in Redis —
 * so it survives restarts and is visible in the SAME transaction as the effect.
 * The atomic claim protocol (`INSERT … ON CONFLICT (org,scope,key) DO NOTHING
 * RETURNING`) makes duplicate effects physically impossible (see spec §2.1).
 *
 * Unique on `(org, scope, key)`; the result (typically the created entityId plus
 * an optional response snapshot) is cached to return the same answer on retry.
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."`.
 */

import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

// ---------------------------------------------------------------------------
// idempotency_keys — claim registry for side-effecting POST mutations
// ---------------------------------------------------------------------------

export const idempotencyKeys = pgTable(
	"idempotency_keys",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// Logical area, e.g. "graph.create", "graph.link", "note.create".
		scope: text().notNull(),
		// Client-supplied idempotency key (uuid).
		key: uuid().notNull(),
		// The created result (usually an entityId) + optional response snapshot.
		resultEntityId: uuid("result_entity_id"),
		result: jsonb().$type<Record<string, unknown>>(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("idempotency_keys_org_idx").on(t.organizationId),
		uniqueIndex("idempotency_keys_org_scope_key_uniq").on(
			t.organizationId,
			t.scope,
			t.key,
		),
	],
);

export type InsertIdempotencyKey = typeof idempotencyKeys.$inferInsert;
export type SelectIdempotencyKey = typeof idempotencyKeys.$inferSelect;
