import { describe, expect, it } from "bun:test";
import {
	type createPrivateKey,
	type createPublicKey,
	generateKeyPairSync,
	sign,
} from "node:crypto";
import { verifyDiscordSignature } from "../verify-signature";

function generateEd25519Pair() {
	return generateKeyPairSync("ed25519");
}

function rawPublicKeyHex(
	publicKey: ReturnType<typeof createPublicKey>,
): string {
	// Export as SPKI DER and strip the 12-byte header to get raw 32-byte key
	const spkiDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
	return spkiDer.subarray(12).toString("hex");
}

function signMessage(
	privateKey: ReturnType<typeof createPrivateKey>,
	message: string,
): string {
	return sign(null, Buffer.from(message), privateKey).toString("hex");
}

describe("verifyDiscordSignature", () => {
	it("returns true for a valid Ed25519 signature", () => {
		const { privateKey, publicKey } = generateEd25519Pair();
		const timestamp = "1700000000";
		const body = '{"type":1}';
		const message = timestamp + body;

		const signature = signMessage(privateKey, message);
		const pubKeyHex = rawPublicKeyHex(publicKey);

		expect(
			verifyDiscordSignature({
				publicKey: pubKeyHex,
				signature,
				timestamp,
				body,
			}),
		).toBe(true);
	});

	it("returns false when body is tampered", () => {
		const { privateKey, publicKey } = generateEd25519Pair();
		const timestamp = "1700000000";
		const body = '{"type":1}';
		const tampered = '{"type":2}';

		const signature = signMessage(privateKey, timestamp + body);
		const pubKeyHex = rawPublicKeyHex(publicKey);

		expect(
			verifyDiscordSignature({
				publicKey: pubKeyHex,
				signature,
				timestamp,
				body: tampered,
			}),
		).toBe(false);
	});

	it("returns false for wrong public key", () => {
		const { privateKey } = generateEd25519Pair();
		const { publicKey: wrongPublicKey } = generateEd25519Pair();
		const timestamp = "1700000000";
		const body = '{"type":1}';

		const signature = signMessage(privateKey, timestamp + body);
		const wrongPubKeyHex = rawPublicKeyHex(wrongPublicKey);

		expect(
			verifyDiscordSignature({
				publicKey: wrongPubKeyHex,
				signature,
				timestamp,
				body,
			}),
		).toBe(false);
	});

	it("returns false for malformed hex public key", () => {
		expect(
			verifyDiscordSignature({
				publicKey: "not-valid-hex!!",
				signature: "00".repeat(64),
				timestamp: "1700000000",
				body: "{}",
			}),
		).toBe(false);
	});
});
