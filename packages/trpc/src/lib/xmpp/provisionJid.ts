/**
 * `provisionJid` — the D4 JID-binding service (Phase 1).
 *
 * Binds a rox user's `user_profiles.handle` (ROX-522) to exactly one JID,
 * `<handle>@xmpp.rox.one`, in `xmpp_accounts` (1:1 with the user). It honors the
 * owner's handle-recycling decision (DECISIONS.md DQ4):
 *
 *   - First provision of a handle  → insert an `xmpp_accounts` row (status
 *     `active`), JID localpart = the folded handle.
 *   - Rename (`alice → alicia`)    → the OLD localpart is freed: write an
 *     `xmpp_jid_aliases` row with a 90-day `reserved_until` grace window (the old
 *     JID keeps routing to the new owner during it), then point the account at
 *     the new localpart. The old localpart is reserved PERMANENTLY (never
 *     reassigned) — the alias row is the permanent reservation; `reserved_until`
 *     only bounds active *routing*, not the reservation itself.
 *   - Re-provision with the same handle → no-op.
 *
 *   handle "alice" ─▶ xmpp_accounts  alice@xmpp.rox.one (status=active)
 *   rename → "alicia" ─▶ xmpp_jid_aliases  alice (reserved_until = now + 90d)
 *                      ─▶ xmpp_accounts.jid_localpart = "alicia"
 *
 * Owner decisions (plans/rox-comms-suite/DECISIONS.md):
 *   DQ3 — identity is GLOBAL per user; the JID belongs to the person. The
 *         `organization_id` stamped on the row is the Electric shape filter
 *         (the user's personal/active org), never a silo boundary.
 *   DQ4 — previously-active localpart reserved permanently; on rename old JID
 *         aliases to the new owner for 90 days then retires.
 *
 * The db surface is INJECTED (`ProvisionJidDb`) so this orchestration unit-tests
 * against an in-memory fake with no live database; the tRPC router passes a thin
 * Drizzle-backed adapter (see `./drizzleDb`).
 */

import {
	deriveJid,
	normalizeJidLocalpart,
	ROX_XMPP_DOMAIN,
} from "@rox/comms-core";

/** The 90-day grace window (DQ4) for a renamed handle's old JID, in ms. */
export const JID_ALIAS_GRACE_MS = 90 * 24 * 60 * 60 * 1000;

/** A bound JID account row (the subset the service reads/writes). */
export interface XmppAccountRow {
	id: string;
	userId: string;
	organizationId: string;
	jidLocalpart: string;
	domain: string;
	status: "active" | "suspended" | "reserved" | "deleted";
}

/**
 * The narrow db surface `provisionJid` needs. Structurally satisfied by both the
 * real Drizzle adapter and the test fake.
 */
export interface ProvisionJidDb {
	/** The caller's existing JID account, or null on first provision. */
	findAccountByUser(userId: string): Promise<XmppAccountRow | null>;

	/**
	 * Who currently owns `localpart@domain` (live account OR a still-reserved
	 * alias), or null if free. Used to reject claiming a localpart reserved to
	 * another user (DQ4 permanent reservation).
	 */
	findOwnerOfLocalpart(args: {
		domain: string;
		localpart: string;
	}): Promise<{ userId: string } | null>;

	/** Insert a fresh account row, returning it. */
	insertAccount(row: {
		userId: string;
		organizationId: string;
		jidLocalpart: string;
		domain: string;
	}): Promise<XmppAccountRow>;

	/** Point an existing account at a new localpart (rename). */
	updateAccountLocalpart(args: {
		accountId: string;
		jidLocalpart: string;
	}): Promise<void>;

	/** Reserve a freed localpart as an alias (idempotent on the unique localpart). */
	insertAlias(row: {
		accountId: string;
		jidLocalpart: string;
		reservedUntil: Date | null;
	}): Promise<void>;
}

export interface ProvisionJidInput {
	/** `auth.users.id` — the stable owner key (survives handle renames). */
	userId: string;
	/** `user_profiles.handle` (ROX-522) — the key the JID localpart derives from. */
	handle: string;
	/** Org to stamp on the row (the user's personal/active org). DQ3: not a silo. */
	organizationId: string;
	/** XMPP service domain override (defaults to `xmpp.rox.one`). */
	domain?: string;
}

export type ProvisionJidOutcome = "created" | "renamed" | "unchanged";

export interface ProvisionJidResult {
	/** The bound bare JID, `<localpart>@<domain>`. */
	jid: string;
	jidLocalpart: string;
	domain: string;
	outcome: ProvisionJidOutcome;
	/** The previous localpart freed by a rename (aliased + reserved), if any. */
	previousLocalpart?: string;
}

/**
 * Provision (or re-affirm / rename) a user's JID binding. Safe to call on every
 * sign-in: a same-handle call is a no-op.
 *
 * @throws if the target localpart is reserved to a DIFFERENT user (DQ4).
 */
export async function provisionJid(
	db: ProvisionJidDb,
	input: ProvisionJidInput,
	now: () => Date = () => new Date(),
): Promise<ProvisionJidResult> {
	const domain = (input.domain ?? ROX_XMPP_DOMAIN).trim().toLowerCase();
	// Derive + validate (throws on empty / illegal / reserved-infra localpart).
	const localpart = normalizeJidLocalpart(input.handle);
	const jid = deriveJid(input.handle, domain);

	const existing = await db.findAccountByUser(input.userId);

	// Unchanged: the same user already owns this exact localpart on this domain.
	if (
		existing &&
		existing.jidLocalpart === localpart &&
		existing.domain === domain
	) {
		return { jid, jidLocalpart: localpart, domain, outcome: "unchanged" };
	}

	// DQ4: the target localpart must not be reserved/owned by ANOTHER user.
	const owner = await db.findOwnerOfLocalpart({ domain, localpart });
	if (owner && owner.userId !== input.userId) {
		throw new Error(
			`JID localpart "${localpart}@${domain}" is reserved to another user`,
		);
	}

	// Rename: free the old localpart as a permanently-reserved alias with a
	// 90-day active-routing grace, then repoint the account. Capture the old
	// localpart up front so the result is independent of any post-write mutation.
	if (existing) {
		const previousLocalpart = existing.jidLocalpart;
		const reservedUntil = new Date(now().getTime() + JID_ALIAS_GRACE_MS);
		await db.insertAlias({
			accountId: existing.id,
			jidLocalpart: previousLocalpart,
			reservedUntil,
		});
		await db.updateAccountLocalpart({
			accountId: existing.id,
			jidLocalpart: localpart,
		});
		return {
			jid,
			jidLocalpart: localpart,
			domain,
			outcome: "renamed",
			previousLocalpart,
		};
	}

	// First provision.
	await db.insertAccount({
		userId: input.userId,
		organizationId: input.organizationId,
		jidLocalpart: localpart,
		domain,
	});
	return { jid, jidLocalpart: localpart, domain, outcome: "created" };
}
