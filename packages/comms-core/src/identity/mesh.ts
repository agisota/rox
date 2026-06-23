/**
 * Pure mesh-identity normalization + validation (D5 "mesh identity contract").
 *
 * Unlike the email/JID address (derivable from the rox handle), the mesh
 * identity is a per-DEVICE keypair the client generates and keeps secret — only
 * the PUBLIC pubkey ever reaches the server. This module therefore does NOT
 * derive a key from the handle; it normalizes + validates the public key a
 * client presents so the provisioning service can bind it to a rox user and the
 * bridge can resolve an inbound event's sender pubkey back to that user.
 *
 * A Nostr public key is a 32-byte (64 hex char) value, conventionally shown
 * bech32-encoded as an `npub1...` string. Both encodings are accepted; we fold
 * to a single normalized form (lowercased, hex stripped of any prefix) so two
 * encodings of the SAME key compare equal and the global-unique index can't be
 * bypassed by re-encoding.
 *
 * Pure + dependency-light so the mesh adapter, the provisioning service, and the
 * bridge ingress all share one normalization and unit-test without a database.
 * (Full bech32↔hex transcoding is intentionally out of scope here — the client
 * supplies the encoding it owns; we normalize the SHAPE, not transcode.)
 */

/** A 64-char lowercase-hex Nostr/secp256k1/ed25519 public key. */
const HEX_PUBKEY = /^[0-9a-f]{64}$/;

/** A bech32 `npub1...` Nostr public key (data part is bech32 charset). */
const NPUB = /^npub1[023456789acdefghjklmnpqrstuvwxyz]{6,}$/;

/** A base64 / base64url string (Noise X25519, Ed25519 keys). */
const BASE64ISH = /^[A-Za-z0-9+/_-]{16,}={0,2}$/;

/**
 * Normalize a Nostr public key to a stable comparison form.
 *
 * - hex (64 chars, any case)  → lowercased hex.
 * - bech32 (`npub1...`, any case) → lowercased (the bech32 charset is already
 *   case-insensitive; we keep the encoding but fold case so duplicates collapse).
 *
 * Throws on an empty or malformed key so a bad pubkey can never be bound or used
 * as a routing identity.
 */
export function normalizeNostrPubkey(pubkey: string): string {
	const trimmed = pubkey.trim();
	if (trimmed.length === 0) {
		throw new Error("Cannot normalize an empty Nostr pubkey");
	}
	const lowered = trimmed.toLowerCase();
	if (HEX_PUBKEY.test(lowered)) return lowered;
	if (NPUB.test(lowered)) return lowered;
	throw new Error(
		`"${pubkey}" is not a valid Nostr pubkey (expected 64-char hex or npub1...)`,
	);
}

/** True when a string is a structurally valid Nostr pubkey (hex or npub). */
export function isNostrPubkey(pubkey: string): boolean {
	const lowered = pubkey.trim().toLowerCase();
	return HEX_PUBKEY.test(lowered) || NPUB.test(lowered);
}

/**
 * Validate (but do not transcode) an optional base64 key — Noise X25519 static
 * key or an Ed25519 signing key. Returns the trimmed key, or null for an absent
 * one (Nostr-only devices need no Noise key). Throws on a present-but-malformed
 * key so junk can never be stored.
 */
export function normalizeBase64Key(
	key: string | null | undefined,
): string | null {
	if (key === null || key === undefined) return null;
	const trimmed = key.trim();
	if (trimmed.length === 0) return null;
	if (!BASE64ISH.test(trimmed)) {
		throw new Error("Key is not a valid base64-encoded value");
	}
	return trimmed;
}
