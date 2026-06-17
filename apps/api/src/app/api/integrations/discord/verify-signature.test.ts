import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyDiscordSignature } from "./verify-signature";

// Build a real Ed25519 keypair and produce a genuine signature over
// `timestamp + body`, mirroring how Discord signs interactions. We export the
// public key as a 32-byte raw hex string (the format Discord exposes).
function makeKeypair() {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	// SPKI DER for Ed25519 is the 12-byte prefix + 32-byte raw key; slice the
	// raw key back out so tests use the same hex shape Discord provides.
	const spkiDer = publicKey.export({ format: "der", type: "spki" });
	const publicKeyHex = spkiDer.subarray(12).toString("hex");
	return { privateKey, publicKeyHex };
}

function signMessage(
	privateKey: ReturnType<typeof makeKeypair>["privateKey"],
	timestamp: string,
	body: string,
): string {
	// Ed25519 signing uses the one-shot form (algorithm null).
	return sign(null, Buffer.from(timestamp + body), privateKey).toString("hex");
}

describe("verifyDiscordSignature", () => {
	const timestamp = "1700000000";
	const body = JSON.stringify({ type: 1 });

	test("returns true for a valid signature", () => {
		const { privateKey, publicKeyHex } = makeKeypair();
		const signatureHex = signMessage(privateKey, timestamp, body);

		expect(
			verifyDiscordSignature({
				publicKeyHex,
				signatureHex,
				timestamp,
				rawBody: body,
			}),
		).toBe(true);
	});

	test("returns false when the signature is tampered", () => {
		const { privateKey, publicKeyHex } = makeKeypair();
		const signatureHex = signMessage(privateKey, timestamp, body);
		// Flip the first hex nibble to corrupt the signature while keeping length.
		const tampered = `${signatureHex[0] === "0" ? "1" : "0"}${signatureHex.slice(1)}`;

		expect(
			verifyDiscordSignature({
				publicKeyHex,
				signatureHex: tampered,
				timestamp,
				rawBody: body,
			}),
		).toBe(false);
	});

	test("returns false when the body is tampered", () => {
		const { privateKey, publicKeyHex } = makeKeypair();
		const signatureHex = signMessage(privateKey, timestamp, body);

		expect(
			verifyDiscordSignature({
				publicKeyHex,
				signatureHex,
				timestamp,
				rawBody: `${body} `,
			}),
		).toBe(false);
	});

	test("returns false when the timestamp is tampered", () => {
		const { privateKey, publicKeyHex } = makeKeypair();
		const signatureHex = signMessage(privateKey, timestamp, body);

		expect(
			verifyDiscordSignature({
				publicKeyHex,
				signatureHex,
				timestamp: "1700000001",
				rawBody: body,
			}),
		).toBe(false);
	});

	test("returns false for malformed public key hex", () => {
		const { privateKey } = makeKeypair();
		const signatureHex = signMessage(privateKey, timestamp, body);

		expect(
			verifyDiscordSignature({
				publicKeyHex: "not-hex",
				signatureHex,
				timestamp,
				rawBody: body,
			}),
		).toBe(false);
	});

	test("returns false for malformed signature hex", () => {
		const { publicKeyHex } = makeKeypair();

		expect(
			verifyDiscordSignature({
				publicKeyHex,
				signatureHex: "zzzz",
				timestamp,
				rawBody: body,
			}),
		).toBe(false);
	});

	test("returns false for empty inputs", () => {
		expect(
			verifyDiscordSignature({
				publicKeyHex: "",
				signatureHex: "",
				timestamp: "",
				rawBody: "",
			}),
		).toBe(false);
	});
});
