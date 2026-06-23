/**
 * `retireExpiredAliases` — daily idempotent sweep (DQ4). Disables comms aliases
 * past `alias_expires_at` and flips mail grace rows past `grace_until` to
 * `disabled`. NEVER touches `identity_handles` (the reservation is permanent).
 *
 * The comms marker is `is_primary = false`: `resolveAddress` already treats an
 * expired alias as unresolvable, so this sweep is hygiene — it demotes the stale
 * alias so nothing surfaces it as a live primary again.
 */

import { and, eq, lt } from "drizzle-orm";
import { db as defaultDb } from "../client";
import { commsAddresses, mailAddresses } from "../schema";

export async function retireExpiredAliases(
	db: typeof defaultDb = defaultDb,
	args?: { at?: Date },
): Promise<{ retired: number }> {
	const now = args?.at ?? new Date();

	const comms = await db
		.update(commsAddresses)
		.set({ isPrimary: false })
		.where(
			and(
				eq(commsAddresses.isAlias, true),
				lt(commsAddresses.aliasExpiresAt, now),
			),
		)
		.returning({ id: commsAddresses.id });

	const mail = await db
		.update(mailAddresses)
		.set({ status: "disabled" })
		.where(
			and(eq(mailAddresses.status, "grace"), lt(mailAddresses.graceUntil, now)),
		)
		.returning({ id: mailAddresses.id });

	return { retired: comms.length + mail.length };
}
