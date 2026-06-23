import { describe, expect, test } from "bun:test";
import { nsecEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { ESCROW_NSEC_ENV, ESCROW_SK_HEX_ENV, loadEscrowKey } from "./escrow";

const sk = generateSecretKey();
const pub = getPublicKey(sk);
const skHex = Array.from(sk)
	.map((b) => b.toString(16).padStart(2, "0"))
	.join("");
const nsec = nsecEncode(sk);

describe("loadEscrowKey", () => {
	test("loads from a bech32 nsec and derives the matching pubkey", () => {
		const key = loadEscrowKey({ [ESCROW_NSEC_ENV]: nsec });
		expect(key.publicKey).toBe(pub);
		expect(key.secretKey.length).toBe(32);
	});

	test("loads from a 64-char hex secret key", () => {
		const key = loadEscrowKey({ [ESCROW_SK_HEX_ENV]: skHex });
		expect(key.publicKey).toBe(pub);
	});

	test("nsec wins when both are set", () => {
		const otherHex = "1".repeat(64);
		const key = loadEscrowKey({
			[ESCROW_NSEC_ENV]: nsec,
			[ESCROW_SK_HEX_ENV]: otherHex,
		});
		expect(key.publicKey).toBe(pub);
	});

	test("throws when no escrow key is configured", () => {
		expect(() => loadEscrowKey({})).toThrow(/No escrow key configured/);
	});

	test("rejects a malformed hex key", () => {
		expect(() => loadEscrowKey({ [ESCROW_SK_HEX_ENV]: "nothex" })).toThrow(
			/64-char hex/,
		);
	});

	test("rejects a non-nsec bech32 (e.g. an npub)", () => {
		// npub decodes fine but is the wrong type → guarded.
		const npubLike = nsec.replace("nsec", "npub");
		expect(() => loadEscrowKey({ [ESCROW_NSEC_ENV]: npubLike })).toThrow();
	});

	test("error messages never leak the secret bytes", () => {
		try {
			loadEscrowKey({ [ESCROW_SK_HEX_ENV]: "bad" });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			expect(msg).not.toContain("bad");
			expect(msg).not.toContain(skHex);
		}
	});
});
