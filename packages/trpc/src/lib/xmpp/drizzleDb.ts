/**
 * Drizzle-backed {@link ProvisionJidDb} — the server-side persistence wiring for
 * the D4 `provisionJid` service.
 *
 * `provisionJid` is pure orchestration: it expresses every database touch as a
 * narrow injected port and never imports a db client. This module is where those
 * ports become real Drizzle statements against the additive `xmpp_*` schema. A
 * rename mutates two tables (alias + account), so the tRPC router runs the whole
 * call inside a single `dbWs.transaction` and passes the tx here, guaranteeing a
 * partial failure can't leave a dangling alias or repointed account.
 */

import { dbWs } from "@rox/db/client";
import { xmppAccounts, xmppJidAliases } from "@rox/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import type { ProvisionJidDb, XmppAccountRow } from "./provisionJid";

/** A transaction handle compatible with `dbWs.transaction((tx) => ...)`. */
export type XmppTx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/** The minimal Drizzle surface this adapter needs (real tx OR the base client). */
type XmppDbLike = Pick<XmppTx, "select" | "insert" | "update">;

/**
 * Build a {@link ProvisionJidDb} bound to a Drizzle tx/client. Reads return a
 * single row or null; writes return the affected row.
 */
export function createProvisionJidDb(db: XmppDbLike = dbWs): ProvisionJidDb {
	return {
		async findAccountByUser(userId) {
			const [row] = await db
				.select()
				.from(xmppAccounts)
				.where(eq(xmppAccounts.userId, userId))
				.limit(1);
			return row ? toAccountRow(row) : null;
		},

		async findOwnerOfLocalpart({ domain, localpart }) {
			// A live account on this (domain, localpart)...
			const [account] = await db
				.select({ userId: xmppAccounts.userId })
				.from(xmppAccounts)
				.where(
					and(
						eq(xmppAccounts.domain, domain),
						eq(xmppAccounts.jidLocalpart, localpart),
					),
				)
				.limit(1);
			if (account) return { userId: account.userId };

			// ...or a reserved alias (DQ4: still-reserved OR permanent). Resolve the
			// alias's account to find the reserving owner.
			const [alias] = await db
				.select({ userId: xmppAccounts.userId })
				.from(xmppJidAliases)
				.innerJoin(xmppAccounts, eq(xmppJidAliases.accountId, xmppAccounts.id))
				.where(
					and(
						eq(xmppJidAliases.jidLocalpart, localpart),
						eq(xmppAccounts.domain, domain),
						// Permanent reservation: reserved_until NULL OR any value still
						// blocks reuse (the localpart is never reassigned).
						or(
							isNull(xmppJidAliases.reservedUntil),
							eq(xmppJidAliases.jidLocalpart, localpart),
						),
					),
				)
				.limit(1);
			return alias ? { userId: alias.userId } : null;
		},

		async insertAccount(row) {
			const [inserted] = await db
				.insert(xmppAccounts)
				.values({
					userId: row.userId,
					organizationId: row.organizationId,
					jidLocalpart: row.jidLocalpart,
					domain: row.domain,
				})
				.returning();
			if (!inserted) {
				throw new Error("Failed to insert xmpp_accounts row");
			}
			return toAccountRow(inserted);
		},

		async updateAccountLocalpart({ accountId, jidLocalpart }) {
			await db
				.update(xmppAccounts)
				.set({ jidLocalpart })
				.where(eq(xmppAccounts.id, accountId));
		},

		async insertAlias(row) {
			await db
				.insert(xmppJidAliases)
				.values({
					accountId: row.accountId,
					jidLocalpart: row.jidLocalpart,
					reservedUntil: row.reservedUntil,
				})
				.onConflictDoNothing({ target: xmppJidAliases.jidLocalpart });
		},
	};
}

function toAccountRow(row: typeof xmppAccounts.$inferSelect): XmppAccountRow {
	return {
		id: row.id,
		userId: row.userId,
		organizationId: row.organizationId,
		jidLocalpart: row.jidLocalpart,
		domain: row.domain,
		status: row.status,
	};
}
