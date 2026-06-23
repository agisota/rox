/**
 * Ambient agent — ambient-intelligence epic, phase 4b ("Act").
 *
 * `user_ambient_settings` is the per-(organization, user) server-side control
 * row for the proactive ambient assistant. The desktop has a LOCAL opt-in flag
 * (phase 4a `ambientCaptureEnabled`, stored in `@rox/local-db`), but the
 * server-side `*\/5` nudge job runs even when the desktop is closed and cannot
 * read that local flag — so this table is the org+user-scoped signal the job
 * gates on.
 *
 * One row per (organization, user). `ambientEnabled` is OFF by default
 * (opt-in): the job no-ops for any user without an enabled row, so ambient is
 * cheap to disable (flip one boolean) and safe by default. `voiceAgentContext`
 * is an OPTIONAL server-side mirror of the desktop persona, used purely as the
 * nudge's system persona; empty/NULL is the norm.
 *
 * Personal + org scoped exactly like `journal_entries` / `memory_items` (org
 * cascade FK + user FK), so it rides the same Electric per-user shape. NEVER
 * hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

export const userAmbientSettings = pgTable(
	"user_ambient_settings",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Master opt-in for the proactive ambient assistant. OFF by default; the
		// `*/5` nudge job skips any user whose row is missing or disabled. Flipping
		// this to false is the kill-switch.
		ambientEnabled: boolean("ambient_enabled").notNull().default(false),

		// Optional server-side persona for nudges (RU). Mirrors the desktop-local
		// `voiceAgentContext` so the server job has a persona without reading the
		// local-db; empty/NULL means "use the default Rox persona".
		voiceAgentContext: text("voice_agent_context"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// One settings row per (organization, user).
		uniqueIndex("user_ambient_settings_org_user_unique").on(
			t.organizationId,
			t.createdBy,
		),
		// Drives the nudge reconcile: scan enabled users for one org/run.
		index("user_ambient_settings_enabled_idx").on(
			t.ambientEnabled,
			t.organizationId,
		),
	],
);

export type InsertUserAmbientSettings = typeof userAmbientSettings.$inferInsert;
export type SelectUserAmbientSettings = typeof userAmbientSettings.$inferSelect;
