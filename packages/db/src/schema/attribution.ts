/**
 * Rox Automation Fabric — marketing attribution schema (openpanel epic).
 *
 * Captures first-touch acquisition signals so the analytics stack (PostHog +
 * OpenPanel) can attribute downstream revenue back to the campaign/source that
 * acquired the user:
 *   user_attribution     → one first-touch row per user (utm_*, landing, referrer)
 *   payment_attributions  → links a revenue event back to first-touch utm
 *
 * First-touch values are written once on account creation (see
 * `packages/auth/src/server.ts` databaseHooks) and never overwritten; the
 * `last_touch_*` columns track the most recent session for multi-touch context.
 *
 * NOTE: never hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	index,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// user_attribution — one first-touch acquisition row per user
// ---------------------------------------------------------------------------

export const userAttribution = pgTable(
	"user_attribution",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// First-touch UTM parameters (written once, never overwritten).
		utmSource: text("utm_source"),
		utmMedium: text("utm_medium"),
		utmCampaign: text("utm_campaign"),
		utmTerm: text("utm_term"),
		utmContent: text("utm_content"),

		landingPage: text("landing_page"),
		referrer: text("referrer"),

		// Most recent session signals (multi-touch context).
		lastUtmSource: text("last_utm_source"),
		lastUtmMedium: text("last_utm_medium"),
		lastUtmCampaign: text("last_utm_campaign"),

		firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		lastTouchAt: timestamp("last_touch_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("user_attribution_user_id_uniq").on(t.userId),
		index("user_attribution_utm_source_idx").on(t.utmSource),
		index("user_attribution_utm_campaign_idx").on(t.utmCampaign),
	],
);

export type InsertUserAttribution = typeof userAttribution.$inferInsert;
export type SelectUserAttribution = typeof userAttribution.$inferSelect;

// ---------------------------------------------------------------------------
// payment_attributions — links a revenue event to the user's first-touch utm
// ---------------------------------------------------------------------------

export const paymentAttributions = pgTable(
	"payment_attributions",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		attributionId: uuid("attribution_id").references(() => userAttribution.id, {
			onDelete: "set null",
		}),

		// External payment reference (dv.net invoice / Rox top-up id).
		provider: text().notNull().default("dvnet"),
		externalId: text("external_id").notNull(),

		amountUsd: numeric("amount_usd", { precision: 20, scale: 6 })
			.notNull()
			.default("0"),
		currency: text().notNull().default("usd"),

		// First-touch snapshot at the time of the revenue event (denormalized so
		// the attribution survives even if the source row is later pruned).
		utmSource: text("utm_source"),
		utmMedium: text("utm_medium"),
		utmCampaign: text("utm_campaign"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("payment_attributions_provider_external_uniq").on(
			t.provider,
			t.externalId,
		),
		index("payment_attributions_user_idx").on(t.userId),
		index("payment_attributions_utm_campaign_idx").on(t.utmCampaign),
	],
);

export type InsertPaymentAttribution = typeof paymentAttributions.$inferInsert;
export type SelectPaymentAttribution = typeof paymentAttributions.$inferSelect;
