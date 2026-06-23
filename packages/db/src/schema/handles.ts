/**
 * Identity handle reservation registry (D1 / DQ4).
 *
 * The permanent, GLOBAL authority for handle ownership. One row per handle ever
 * activated, keyed by `normalized_handle` (lowercased). `current_owner_user_id`
 * is the live owner; it is NEVER reassigned to a different user (S1: a freed or
 * renamed handle stays unclaimable). On user deletion it set-nulls, but the row
 * — and therefore the reservation — survives, so the handle remains unclaimable.
 *
 * This table outlives every address row, so reservation holds even after the
 * `comms_addresses` / `mail_addresses` rows are retired by the alias sweep.
 *
 * Additive only — NEVER hand-edit migrations; change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { handleStatusValues } from "./enums";

export const handleStatus = pgEnum("handle_status", handleStatusValues);

export const identityHandles = pgTable(
	"identity_handles",
	{
		id: uuid().primaryKey().defaultRandom(),
		// Lowercased handle (the canonical reservation key).
		normalizedHandle: text("normalized_handle").notNull(),
		// Live owner. Set-null on user delete; the row (reservation) still stands.
		currentOwnerUserId: uuid("current_owner_user_id").references(
			() => users.id,
			{ onDelete: "set null" },
		),
		// The user who first activated this handle (audit; never used for routing).
		firstOwnerUserId: uuid("first_owner_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		status: handleStatus().notNull().default("active"),
		reservedAt: timestamp("reserved_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("identity_handles_normalized_uniq").on(t.normalizedHandle),
	],
);

export type InsertIdentityHandle = typeof identityHandles.$inferInsert;
export type SelectIdentityHandle = typeof identityHandles.$inferSelect;
