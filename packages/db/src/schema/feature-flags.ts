/**
 * Rox per-user feature-flag overrides — admin-expansion epic (WS-O §2.4, design
 * from WS-F §2.4).
 *
 * Today every flag is PostHog-evaluated; toggling per-user means editing
 * PostHog. This table is the DB-side override store so an admin can force a flag
 * ON/OFF for one user:
 *   user_feature_flags(user_id, key, value)
 *     value = true  → force ON
 *     value = false → force OFF
 *     no row        → inherit (fall through to PostHog) — see resolveUserFlag
 *
 * `key` matches a `FEATURE_FLAGS` value (`packages/shared/src/constants.ts`).
 * The resolution order (DB override first, PostHog fallback) is implemented in
 * `resolveUserFlag` (`packages/db/src/feature-flags.ts`, the DB half) + WS-F's
 * read layer (the PostHog half).
 *
 * Scope decision (WS-O hardening Q4): this data is **user-scoped, not
 * org-scoped**, and is read through the API (admin tooling), NOT synced via
 * ElectricSQL — so it deliberately has NO denormalized `organization_id`
 * column. It is a `pgTable` (app schema) with a cross-schema FK to `auth.users`,
 * keeping flag-admin data out of the auth domain.
 *
 * NEVER hand-edit migrations — change this file then run
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
import { users } from "./auth";

export const userFeatureFlags = pgTable(
	"user_feature_flags",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Matches a FEATURE_FLAGS value (packages/shared/src/constants.ts).
		key: text().notNull(),
		// Forced value. Absence of a row = inherit (PostHog fallback).
		value: boolean().notNull(),

		updatedBy: uuid("updated_by").references(() => users.id, {
			onDelete: "set null",
		}),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("user_feature_flags_user_idx").on(t.userId),
		uniqueIndex("user_feature_flags_user_key_unique").on(t.userId, t.key),
	],
);

export type InsertUserFeatureFlag = typeof userFeatureFlags.$inferInsert;
export type SelectUserFeatureFlag = typeof userFeatureFlags.$inferSelect;
