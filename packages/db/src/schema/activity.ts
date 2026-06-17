/**
 * Graph core (#01) — `activity_events`, the append-only timeline backbone (D7).
 *
 * A per-user, append-only event stream: screen blocks, app usage, sessions,
 * calendar, comms, feed reads, journal, file ops (see `activityEventKindValues`).
 * Written via the graph-service `recordActivity`; the payload contract is what
 * Capture (#08), sessions (#11) and STT/overlay (#12) populate. Physically this
 * lives in the local-primary store (Turso/libSQL, provided by #02); only an
 * aggregate/opt-in mirror flows up to Postgres — the table is declared here in
 * the shared schema, placement is a runtime concern.
 *
 * No `status`/soft-delete and no `updated_at`: events are immutable. Mirrors the
 * core conventions otherwise. NEVER hand-edit migrations — change this file then
 * run `bunx drizzle-kit generate --name="..."`.
 */

import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { entities } from "./entity";
import { activityEventKindValues } from "./enums";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const activityEventKind = pgEnum(
	"activity_event_kind",
	activityEventKindValues,
);

// ---------------------------------------------------------------------------
// activity_events — append-only timeline spine
// ---------------------------------------------------------------------------

export const activityEvents = pgTable(
	"activity_events",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Event timestamp (UTC).
		ts: timestamp({ withTimezone: true }).notNull(),
		durationMs: integer("duration_ms"),
		kind: activityEventKind().notNull(),
		// Optional graph node this event is about (set-null on delete).
		sourceEntityId: uuid("source_entity_id").references(() => entities.id, {
			onDelete: "set null",
		}),
		payload: jsonb()
			.$type<{
				app?: string;
				window?: string;
				url?: string;
				summary?: string;
				frameRefs?: string[];
			}>()
			.notNull()
			.default({}),
	},
	(t) => [
		index("activity_events_user_ts_idx").on(t.userId, t.ts),
		index("activity_events_kind_idx").on(t.kind),
		index("activity_events_source_idx").on(t.sourceEntityId),
	],
);

export type InsertActivityEvent = typeof activityEvents.$inferInsert;
export type SelectActivityEvent = typeof activityEvents.$inferSelect;
