/**
 * `provisionIdentity` — the D1 identity-binding service (Phase 1, T1.2).
 *
 * Given a rox user + their `user_profiles.handle` (ROX-522), this derives and
 * persists every transport address the user owns, a public-only mesh keypair
 * pointer, and lazily seeds the shared 10 GiB storage quota — the same way
 * `rox_balances` are seeded on first use.
 *
 *   handle "mark" ─▶ comms_addresses  email  mark@rox.one (kind=email, primary)
 *                  ─▶ comms_addresses  xmpp   mark@rox.one (kind=xmpp,  primary)
 *                  ─▶ comms_keypairs   ed25519 PUBLIC key + secret_ref pointer
 *                  ─▶ storage_quota    10 GiB (lazy, idempotent)
 *
 * Owner decisions (plans/rox-comms-suite/DECISIONS.md):
 *   DQ2 — 10 GiB free PER USER, a single shared quota; seeded lazily here so a
 *         freshly-provisioned identity already has its accounting row.
 *   DQ3 — identity is GLOBAL per user; the `@rox.one` addresses belong to the
 *         person, not an org. `organization_id` is still stamped (Electric shape
 *         convention) using the caller-supplied org (the user's personal/active
 *         org), never siloing the address semantically.
 *   DQ4 — a previously-active handle is reserved permanently and never recycled;
 *         the private mesh key is NEVER stored server-side — only the public key
 *         and an opaque `secret_ref` pointer into the keystore live in Neon.
 *
 * IDEMPOTENT: re-running with the same `(userId, handle)` is a no-op. Address
 * rows use `onConflictDoNothing` on the `(org, kind, value)` unique index; the
 * keypair and quota use their per-user unique indexes the same way. No writes
 * happen for rows that already exist, so this is safe to call on every sign-in.
 *
 * Transactional: all writes run inside a single `dbWs.transaction` so a partial
 * failure cannot leave a dangling JID/email (D1 §5 "identity sprawl" risk).
 */

import { type DerivedAddresses, deriveAddresses } from "@rox/comms-core";
import { dbWs } from "@rox/db/client";
import {
	commsAddresses,
	commsKeypairs,
	DRIVE_FREE_QUOTA_BYTES,
	storageQuota,
} from "@rox/db/schema";

/** A transaction handle compatible with `dbWs.transaction((tx) => …)`. */
type Tx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

export interface ProvisionIdentityInput {
	/** `auth.users.id` — the stable owner key (survives handle renames). */
	userId: string;
	/** `user_profiles.handle` (ROX-522) — the single key all addresses derive from. */
	handle: string;
	/** Org to stamp on the rows (the user's personal/active org). DQ3: identity is
	 *  global; the org is the Electric shape filter, not a silo boundary. */
	organizationId: string;
	/**
	 * Opaque pointer into the secret store (Infisical / host keystore) where the
	 * mesh/E2E PRIVATE key lives. The private key is NEVER passed here or stored
	 * in Neon. Optional: a keypair the user generates client-side may register its
	 * public key + ref later via the mesh adapter.
	 */
	meshPublicKey?: string;
	meshSecretRef?: string;
}

export interface ProvisionIdentityResult {
	addresses: DerivedAddresses;
	/** True when this call created at least one new row (vs a pure no-op re-run). */
	created: boolean;
}

/**
 * Provision (or re-affirm) a user's comms identity. Safe to call repeatedly.
 *
 * @param input owner + handle + org + optional mesh key material.
 * @param tx optional existing transaction to compose into (tests / batch flows);
 *           when omitted a fresh `dbWs.transaction` is opened.
 */
export async function provisionIdentity(
	input: ProvisionIdentityInput,
	tx?: Tx,
): Promise<ProvisionIdentityResult> {
	const addresses = deriveAddresses(input.handle);

	const run = async (db: Tx): Promise<boolean> => {
		let created = false;

		// 1. Email + XMPP addresses (primary, derived from the current handle).
		//    DQ4: the unique index (org, kind, value) guards live duplicates; a
		//    re-run is a no-op. Both transports share the same `username@rox.one`
		//    value (JID localpart === handle).
		const addressRows = [
			{
				organizationId: input.organizationId,
				userId: input.userId,
				kind: "email" as const,
				value: addresses.email,
				isPrimary: true,
				isAlias: false,
				verified: false,
			},
			{
				organizationId: input.organizationId,
				userId: input.userId,
				kind: "xmpp" as const,
				value: addresses.xmpp,
				isPrimary: true,
				isAlias: false,
				verified: false,
			},
		];
		const insertedAddresses = await db
			.insert(commsAddresses)
			.values(addressRows)
			.onConflictDoNothing({
				target: [
					commsAddresses.organizationId,
					commsAddresses.kind,
					commsAddresses.value,
				],
			})
			.returning({ id: commsAddresses.id });
		if (insertedAddresses.length > 0) created = true;

		// 2. Mesh/E2E keypair — PUBLIC key only + secret_ref pointer. The private
		//    key NEVER touches the server (D1 §5 "E2E key custody"). Only written
		//    when the caller supplies a public key (client-side generated); the
		//    per-user unique (user, algo) index keeps it idempotent.
		if (input.meshPublicKey) {
			const insertedKeypair = await db
				.insert(commsKeypairs)
				.values({
					organizationId: input.organizationId,
					userId: input.userId,
					algo: "ed25519",
					publicKey: input.meshPublicKey,
					secretRef: input.meshSecretRef ?? null,
				})
				.onConflictDoNothing({
					target: [commsKeypairs.userId, commsKeypairs.algo],
				})
				.returning({ id: commsKeypairs.id });
			if (insertedKeypair.length > 0) created = true;
		}

		// 3. Lazily seed the shared 10 GiB storage quota (DQ2) — mirrors the
		//    `rox_balances` seed-on-first-use pattern. Idempotent on the per-user
		//    unique index; never resets an existing `bytes_used`.
		const insertedQuota = await db
			.insert(storageQuota)
			.values({
				userId: input.userId,
				quotaBytes: DRIVE_FREE_QUOTA_BYTES,
				bytesUsed: 0,
			})
			.onConflictDoNothing({ target: storageQuota.userId })
			.returning({ id: storageQuota.id });
		if (insertedQuota.length > 0) created = true;

		return created;
	};

	const created = tx ? await run(tx) : await dbWs.transaction(run);
	return { addresses, created };
}
