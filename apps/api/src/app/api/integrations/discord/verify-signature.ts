import { createPublicKey, verify } from "node:crypto";

// SPKI DER prefix for an Ed25519 public key. Prepending this to the raw 32-byte
// public key yields a valid DER document node:crypto can import as an SPKI key,
// so we can verify Discord signatures without an external library.
const ED25519_SPKI_DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Verifies a Discord interaction signature.
 *
 * Discord signs each interactions request with Ed25519 over `timestamp + rawBody`
 * using the application's public key (hex, 32 bytes). The signature header is hex.
 *
 * Pure and total: never throws. Any malformed input (bad hex, wrong key length,
 * unparseable key) returns `false`.
 */
export function verifyDiscordSignature({
	publicKeyHex,
	signatureHex,
	timestamp,
	rawBody,
}: {
	publicKeyHex: string;
	signatureHex: string;
	timestamp: string;
	rawBody: string;
}): boolean {
	try {
		const publicKeyBytes = Buffer.from(publicKeyHex, "hex");
		// An Ed25519 public key is exactly 32 bytes. Buffer.from silently drops
		// invalid hex, so guard the length to reject malformed keys early.
		if (publicKeyBytes.length !== 32) {
			return false;
		}

		const signatureBytes = Buffer.from(signatureHex, "hex");
		// An Ed25519 signature is exactly 64 bytes.
		if (signatureBytes.length !== 64) {
			return false;
		}

		const key = createPublicKey({
			key: Buffer.concat([ED25519_SPKI_DER_PREFIX, publicKeyBytes]),
			format: "der",
			type: "spki",
		});

		// Ed25519 uses the one-shot verify form (algorithm must be null).
		return verify(null, Buffer.from(timestamp + rawBody), key, signatureBytes);
	} catch {
		return false;
	}
}
