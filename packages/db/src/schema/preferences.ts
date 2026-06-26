/**
 * Cross-device preferences sync — Electric-synced tables (F46, Hermes-borrow
 * #643).
 *
 * Two portable preference documents that follow a user/org across devices via
 * ElectricSQL, mirroring the per-user synced pattern of `journal_entries` /
 * `memory_items` (org cascade FK + user FK, both denormalizing
 * `organization_id` so the electric-proxy shape filter is a plain
 * `organization_id = $1 AND created_by = $2` predicate):
 *
 *   user_preferences  → one row per (organization, user): pins (F19),
 *                       tag/label prefs (F10/F11/F17), saved views (F17),
 *                       disclosure/collapse state (F18/F40), locale (F58),
 *                       right-panel peek (F03).
 *   org_settings      → one row per organization: org default locale (F58),
 *                       org default tag prefs, org-shared saved views (F17).
 *
 * Conflict handling is **last-write-wins per field**: each writable field is
 * stored inside the `values` jsonb alongside a sibling `*UpdatedAt` epoch-millis
 * timestamp (the `@rox/shared/prefs` document shape), so two devices editing
 * different fields offline both survive reconcile. The jsonb column is the
 * single serializable core shared by db/trpc/clients — promoting a hot field to
 * its own column is a later, separate migration.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import type { OrgSettingsDoc, UserPreferencesDoc } from "@rox/shared/prefs";
import {
	index,
	jsonb,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

// ---------------------------------------------------------------------------
// user_preferences — per-(organization, user) portable prefs document
// ---------------------------------------------------------------------------

export const userPreferences = pgTable(
	"user_preferences",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// Owner of the prefs. Personal + org scoped exactly like journal_entries /
		// memory_items, so it rides the same Electric per-user shape.
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// The full prefs snapshot: values + per-field LWW timestamps. Typed to the
		// shared core document so db/trpc/clients agree on the shape.
		values: jsonb().$type<UserPreferencesDoc>().notNull().default({
			pins: [],
			tagPrefs: [],
			savedViews: [],
			disclosure: {},
			locale: "",
			rightPanelPeek: false,
			pinsUpdatedAt: 0,
			tagPrefsUpdatedAt: 0,
			savedViewsUpdatedAt: 0,
			disclosureUpdatedAt: 0,
			localeUpdatedAt: 0,
			rightPanelPeekUpdatedAt: 0,
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
		// One prefs row per (organization, user) — the upsert conflict target.
		uniqueIndex("user_preferences_org_user_unique").on(
			t.organizationId,
			t.createdBy,
		),
		index("user_preferences_org_idx").on(t.organizationId),
	],
);

export type InsertUserPreferences = typeof userPreferences.$inferInsert;
export type SelectUserPreferences = typeof userPreferences.$inferSelect;

// ---------------------------------------------------------------------------
// org_settings — per-organization shared settings document
// ---------------------------------------------------------------------------

export const orgSettings = pgTable(
	"org_settings",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// Full org-settings snapshot: values + per-field LWW timestamps.
		values: jsonb().$type<OrgSettingsDoc>().notNull().default({
			defaultLocale: "",
			defaultTagPrefs: [],
			sharedViews: [],
			defaultLocaleUpdatedAt: 0,
			defaultTagPrefsUpdatedAt: 0,
			sharedViewsUpdatedAt: 0,
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
		// One settings row per organization — the upsert conflict target.
		uniqueIndex("org_settings_org_unique").on(t.organizationId),
	],
);

export type InsertOrgSettings = typeof orgSettings.$inferInsert;
export type SelectOrgSettings = typeof orgSettings.$inferSelect;
