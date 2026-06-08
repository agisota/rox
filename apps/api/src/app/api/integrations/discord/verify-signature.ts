import { createPublicKey, verify } from "node:crypto";

/**
 * Verifies the Ed25519 signature Discord attaches to every interaction.
 * Discord sends X-Signature-Ed25519 (hex) + X-Signature-Timestamp (string).
 * The message to verify is: timestamp + body.
 *
 * Uses Node.js built-in crypto; no extra deps required.
 */
export function verifyDiscordSignature({
	publicKey,
	signature,
	timestamp,
	body,
}: {
	publicKey: string;
	signature: string;
	timestamp: string;
	body: string;
}): boolean {
	try {
		// Convert raw 32-byte Ed25519 public key (hex) → SPKI DER so Node.js
		// crypto.verify() accepts it. Prefix is the standard Ed25519 SPKI ASN.1 header:
		// SEQUENCE { SEQUENCE { OID 1.3.101.112 } BIT STRING { 0x00 <32-byte key> } }
		const keyBytes = Buffer.from(publicKey, "hex");
		const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
		const spkiDer = Buffer.concat([spkiPrefix, keyBytes]);

		const keyObj = createPublicKey({
			key: spkiDer,
			format: "der",
			type: "spki",
		});

		return verify(
			null, // Ed25519 is a pure signature scheme — no separate hash step
			Buffer.from(timestamp + body),
			keyObj,
			Buffer.from(signature, "hex"),
		);
	} catch {
		return false;
	}
}
