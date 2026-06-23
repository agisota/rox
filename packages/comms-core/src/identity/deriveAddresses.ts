/**
 * Pure handle → address derivation (D1 §"Address derivation").
 *
 * A single rox handle deterministically yields the `username@rox.one` email and
 * XMPP JID (JID localpart === handle). The mesh pubkey is NOT derivable from the
 * handle — it comes from a per-user ed25519 keypair the mesh adapter
 * provisions — so it is returned as `null` here.
 */

import type { DerivedAddresses } from "../types";

/** The canonical mail/JID domain for derived rox addresses. */
export const ROX_ADDRESS_DOMAIN = "rox.one";

/**
 * Normalize a rox handle into the localpart used for email/JID derivation.
 *
 * Handles are lowercased and trimmed; the address space is case-insensitive so
 * `Mark` and `mark` resolve to the same inbox. Throws on an empty handle.
 */
export function normalizeHandle(handle: string): string {
	const normalized = handle.trim().toLowerCase();
	if (normalized.length === 0) {
		throw new Error("Cannot derive addresses from an empty handle");
	}
	return normalized;
}

/**
 * Derive the transport addresses bound to a rox handle.
 *
 * @param handle the rox `user_profiles.handle` (ROX-522), the single key.
 * @param domain override the address domain (defaults to `rox.one`).
 */
export function deriveAddresses(
	handle: string,
	domain: string = ROX_ADDRESS_DOMAIN,
): DerivedAddresses {
	const localpart = normalizeHandle(handle);
	const address = `${localpart}@${domain}`;
	return {
		handle: localpart,
		email: address,
		// XMPP JID localpart === handle; bare JID is identical to the email address.
		xmpp: address,
		// Provisioned by the mesh adapter from an ed25519 keypair, not the handle.
		mesh: null,
	};
}
