import { beforeAll, describe, expect, it } from "bun:test";
import {
	decodeSecret,
	ENCRYPTED_SECRET_PREFIX,
	encodeSecret,
	isEncodedSecret,
} from "./secret-store";

beforeAll(() => {
	// 32-byte base64 key for AES-256-GCM (matches lib/crypto getKey()).
	process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("integration secret-store codec", () => {
	it("round-trips a token through encode/decode", () => {
		const token = "xoxb-1234567890-abcdef";
		const encoded = encodeSecret(token);
		expect(encoded.startsWith(ENCRYPTED_SECRET_PREFIX)).toBe(true);
		expect(encoded).not.toContain(token);
		expect(decodeSecret(encoded)).toBe(token);
	});

	it("passes through legacy plaintext on decode", () => {
		expect(decodeSecret("legacy-plaintext-token")).toBe(
			"legacy-plaintext-token",
		);
		expect(isEncodedSecret("legacy-plaintext-token")).toBe(false);
	});

	it("is idempotent — re-encoding an encoded value is a no-op", () => {
		const once = encodeSecret("tok");
		expect(encodeSecret(once)).toBe(once);
		expect(decodeSecret(once)).toBe("tok");
	});

	it("produces distinct ciphertext per call (random IV) but same plaintext", () => {
		const a = encodeSecret("same");
		const b = encodeSecret("same");
		expect(a).not.toBe(b);
		expect(decodeSecret(a)).toBe("same");
		expect(decodeSecret(b)).toBe("same");
	});
});
