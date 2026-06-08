/**
 * Rox Automation Fabric — billing & economy schema (billing-economy epic).
 *
 * The Rox economy replaces Stripe seat billing with a prepaid token economy:
 *   model_catalog   → models.dev-sourced catalog (public price + capabilities)
 *   rox_balances    → one current balance per user (seeded 500 Rox on create)
 *   rox_ledger      → append-only history of every balance delta
 *   rox_topups      → dv.net USDT -> Rox top-up invoices
 *   usage_requests  → one row per metered request (tokens, USD + Rox cost, trace)
 *
 * jsonb columns are typed against the `@rox/shared/rox-models` domain types,
 * matching how `./circuit.ts` types its jsonb against `@rox/workflow-core`.
 *
 * NOTE: never hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import type {
	ModelLimits,
	ModelParams,
	ModelSpecs,
	ModelTools,
} from "@rox/shared/rox-models";
import type { ModelProviderFamily } from "@rox/shared/rox-pricing";
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { roxLedgerKindValues, roxTopupStatusValues } from "./enums";
import { chatSessions } from "./schema";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const roxLedgerKind = pgEnum("rox_ledger_kind", roxLedgerKindValues);
export const roxTopupStatus = pgEnum("rox_topup_status", roxTopupStatusValues);

// ---------------------------------------------------------------------------
// model_catalog — models.dev-sourced catalog (rox r1 mirrors groq-compound)
// ---------------------------------------------------------------------------

export const modelCatalog = pgTable(
	"model_catalog",
	{
		id: uuid().primaryKey().defaultRandom(),
		provider: text().notNull(),
		modelId: text("model_id").notNull(),

		publicUsdPerMIn: numeric("public_usd_per_m_in", {
			precision: 20,
			scale: 6,
		})
			.notNull()
			.default("0"),
		publicUsdPerMOut: numeric("public_usd_per_m_out", {
			precision: 20,
			scale: 6,
		})
			.notNull()
			.default("0"),

		pricingFamily: text("pricing_family")
			.$type<ModelProviderFamily>()
			.notNull(),
		isFree: boolean("is_free").notNull().default(false),

		params: jsonb().$type<ModelParams>(),
		specs: jsonb().$type<ModelSpecs>(),
		tools: jsonb().$type<ModelTools>(),
		limits: jsonb().$type<ModelLimits>(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("model_catalog_model_id_uniq").on(t.modelId),
		index("model_catalog_provider_idx").on(t.provider),
		index("model_catalog_pricing_family_idx").on(t.pricingFamily),
	],
);

export type InsertModelCatalog = typeof modelCatalog.$inferInsert;
export type SelectModelCatalog = typeof modelCatalog.$inferSelect;

// ---------------------------------------------------------------------------
// rox_topups — dv.net USDT -> Rox top-up invoices
// ---------------------------------------------------------------------------

export const roxTopups = pgTable(
	"rox_topups",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		usdtAmount: numeric("usdt_amount", { precision: 20, scale: 6 }).notNull(),
		roxAmount: numeric("rox_amount", { precision: 20, scale: 6 }).notNull(),

		dvnetInvoiceId: text("dvnet_invoice_id").notNull(),
		status: roxTopupStatus().notNull().default("pending"),

		confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("rox_topups_dvnet_invoice_id_uniq").on(t.dvnetInvoiceId),
		index("rox_topups_user_idx").on(t.userId),
		index("rox_topups_status_idx").on(t.status),
	],
);

export type InsertRoxTopup = typeof roxTopups.$inferInsert;
export type SelectRoxTopup = typeof roxTopups.$inferSelect;

// ---------------------------------------------------------------------------
// usage_requests — one row per metered request (tokens, cost, trace)
// ---------------------------------------------------------------------------

export const usageRequests = pgTable(
	"usage_requests",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "set null",
		}),
		chatSessionId: uuid("chat_session_id").references(() => chatSessions.id, {
			onDelete: "set null",
		}),

		modelId: text("model_id").notNull(),
		tokensIn: integer("tokens_in").notNull().default(0),
		tokensOut: integer("tokens_out").notNull().default(0),

		usdCost: numeric("usd_cost", { precision: 20, scale: 6 })
			.notNull()
			.default("0"),
		roxCost: numeric("rox_cost", { precision: 20, scale: 6 })
			.notNull()
			.default("0"),

		trace: jsonb().$type<Record<string, unknown>>(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("usage_requests_user_created_idx").on(t.userId, t.createdAt),
		index("usage_requests_model_idx").on(t.modelId),
	],
);

export type InsertUsageRequest = typeof usageRequests.$inferInsert;
export type SelectUsageRequest = typeof usageRequests.$inferSelect;

// ---------------------------------------------------------------------------
// rox_balances — one current balance per user (seeded 500 Rox on create)
// ---------------------------------------------------------------------------

export const roxBalances = pgTable(
	"rox_balances",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Seeded with STARTING_BALANCE_ROX (500) on first read/create.
		balanceRox: numeric("balance_rox", { precision: 20, scale: 6 })
			.notNull()
			.default("500"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [uniqueIndex("rox_balances_user_id_uniq").on(t.userId)],
);

export type InsertRoxBalance = typeof roxBalances.$inferInsert;
export type SelectRoxBalance = typeof roxBalances.$inferSelect;

// ---------------------------------------------------------------------------
// rox_ledger — append-only history of every balance delta
// ---------------------------------------------------------------------------

export const roxLedger = pgTable(
	"rox_ledger",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		deltaRox: numeric("delta_rox", { precision: 20, scale: 6 }).notNull(),
		kind: roxLedgerKind().notNull(),

		usageRequestId: uuid("usage_request_id").references(
			() => usageRequests.id,
			{ onDelete: "set null" },
		),
		topupId: uuid("topup_id").references(() => roxTopups.id, {
			onDelete: "set null",
		}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("rox_ledger_user_created_idx").on(t.userId, t.createdAt),
		index("rox_ledger_kind_idx").on(t.kind),
	],
);

export type InsertRoxLedger = typeof roxLedger.$inferInsert;
export type SelectRoxLedger = typeof roxLedger.$inferSelect;
