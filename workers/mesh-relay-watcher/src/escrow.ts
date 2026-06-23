/**
 * Escrow key material loader for the mesh relay-watcher.
 *
 * The SERVER-HELD escrow private key is what lets the watcher decrypt inbound
 * NIP-17 gift-wraps server-side (mesh is a transport-fallback bridge, not an
 * E2E-private product). The key is loaded from the environment ONLY — Infisical
 * injects it as `MESH_ESCROW_NSEC` (a bech32 `nsec1…`) or `MESH_ESCROW_SK_HEX`
 * (32-byte hex). It is NEVER hardcoded, logged, printed, or persisted to the DB.
 *
 * SECURITY: the returned `secretKey` bytes must stay in-process. Do not stringify
 * or log them; the public key (`getPublicKey`) is the only escrow value safe to
 * surface (it is what the `mesh_escrow_keys` row already stores).
 */

import { decode } from "nostr-tools/nip19";
import { getPublicKey } from "nostr-tools/pure";

/** Env var holding the escrow key as a bech32 `nsec1…`. */
export const ESCROW_NSEC_ENV = "MESH_ESCROW_NSEC";
/** Env var holding the escrow key as 32-byte (64 hex char) secret key. */
export const ESCROW_SK_HEX_ENV = "MESH_ESCROW_SK_HEX";

export interface EscrowKey {
	/** The escrow secret key bytes — KEEP IN MEMORY; never log/serialize. */
	secretKey: Uint8Array;
	/** The derived escrow PUBLIC key (hex) — the subscription `#p` filter target. */
	publicKey: string;
}

const HEX_64 = /^[0-9a-f]{64}$/i;

/** Decode a 64-char hex string into bytes. */
function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

/**
 * Load + validate the escrow key from a provided env bag (defaults to
 * `process.env`). Accepts either `MESH_ESCROW_NSEC` (bech32) or
 * `MESH_ESCROW_SK_HEX` (hex). Throws a NON-LEAKING error (no key bytes in the
 * message) when neither is present or the value is malformed, so a misconfigured
 * watcher fails fast at boot rather than silently running keyless.
 */
export function loadEscrowKey(
	env: Record<string, string | undefined> = process.env,
): EscrowKey {
	const nsec = env[ESCROW_NSEC_ENV]?.trim();
	const hex = env[ESCROW_SK_HEX_ENV]?.trim();

	let secretKey: Uint8Array;
	if (nsec && nsec.length > 0) {
		// Pass a plain `string` so `decode` returns the full DecodedResult union
		// (not the narrowed nsec-only overload), keeping the `type` guard sound.
		const code: string = nsec;
		let decoded: ReturnType<typeof decode>;
		try {
			decoded = decode(code);
		} catch {
			throw new Error(
				`${ESCROW_NSEC_ENV} is not a valid bech32 nsec (decode failed)`,
			);
		}
		if (decoded.type !== "nsec") {
			throw new Error(
				`${ESCROW_NSEC_ENV} decoded to "${decoded.type}", expected an nsec`,
			);
		}
		secretKey = decoded.data;
	} else if (hex && hex.length > 0) {
		if (!HEX_64.test(hex)) {
			throw new Error(`${ESCROW_SK_HEX_ENV} must be a 64-char hex secret key`);
		}
		secretKey = hexToBytes(hex);
	} else {
		throw new Error(
			`No escrow key configured: set ${ESCROW_NSEC_ENV} (bech32) or ${ESCROW_SK_HEX_ENV} (hex)`,
		);
	}

	if (secretKey.length !== 32) {
		throw new Error("Escrow secret key must be 32 bytes");
	}

	return { secretKey, publicKey: getPublicKey(secretKey) };
}
