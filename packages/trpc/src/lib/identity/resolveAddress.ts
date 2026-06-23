/**
 * `resolveAddress` — GLOBAL, alias-expiry-aware address → owner resolution (S2).
 *
 * Replaces the org-scoped, expiry-blind `createCommsPorts.addresses.findByValue`
 * on every auth-critical path. `kind` is REQUIRED (callers must not cross-resolve
 * email vs xmpp). A live primary always resolves; an alias resolves to its owner
 * only while unexpired; an expired alias returns null (the caller bounces).
 */

import { db as defaultDb } from "@rox/db/client";
import { type CommsAddressKind, commsAddresses } from "@rox/db/schema";
import { and, desc, eq } from "drizzle-orm";

export interface ResolveAddressArgs {
	kind: CommsAddressKind;
	value: string;
	/** Reference time for alias-expiry (defaults to now). */
	at?: Date;
}

export interface ResolvedAddress {
	userId: string;
	handleId: string | null;
	isAlias: boolean;
	expired: boolean;
}

export async function resolveAddress(
	{ kind, value, at }: ResolveAddressArgs,
	db: { select: typeof defaultDb.select } = defaultDb,
): Promise<ResolvedAddress | null> {
	const normalized = value.trim().toLowerCase();
	const now = at ?? new Date();

	// Prefer the live primary (is_alias=false) over any alias for the value.
	const rows = await db
		.select({
			userId: commsAddresses.userId,
			handleId: commsAddresses.handleId,
			isAlias: commsAddresses.isAlias,
			aliasExpiresAt: commsAddresses.aliasExpiresAt,
		})
		.from(commsAddresses)
		.where(
			and(eq(commsAddresses.kind, kind), eq(commsAddresses.value, normalized)),
		)
		// Primary rows first so a live primary wins over a coexisting alias.
		.orderBy(desc(commsAddresses.isPrimary))
		.limit(2);

	for (const row of rows) {
		if (!row.isAlias) {
			return {
				userId: row.userId,
				handleId: row.handleId,
				isAlias: false,
				expired: false,
			};
		}
		const expired = !row.aliasExpiresAt || row.aliasExpiresAt <= now;
		if (!expired) {
			return {
				userId: row.userId,
				handleId: row.handleId,
				isAlias: true,
				expired: false,
			};
		}
	}
	return null;
}
