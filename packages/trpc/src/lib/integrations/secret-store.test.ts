import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
	decodeSecret,
	ENCRYPTED_SECRET_PREFIX,
	encodeSecret,
	isEncodedSecret,
	isIntegrationSecretEncryptionEnabled,
	storeSecret,
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

describe("storeSecret (flag-gated encryption-at-rest)", () => {
	afterEach(() => {
		process.env.INTEGRATION_SECRET_ENCRYPTION = undefined;
	});

	it("stores plaintext when the flag is off (default)", () => {
		process.env.INTEGRATION_SECRET_ENCRYPTION = undefined;
		expect(isIntegrationSecretEncryptionEnabled()).toBe(false);
		const stored = storeSecret("xoxb-token");
		expect(stored).toBe("xoxb-token");
		expect(isEncodedSecret(stored)).toBe(false);
		// Reads round-trip regardless (decode passes plaintext through).
		expect(decodeSecret(stored)).toBe("xoxb-token");
	});

	it("encrypts on write when the flag is on", () => {
		for (const on of ["1", "true", "on"]) {
			process.env.INTEGRATION_SECRET_ENCRYPTION = on;
			expect(isIntegrationSecretEncryptionEnabled()).toBe(true);
			const stored = storeSecret("xoxb-token");
			expect(isEncodedSecret(stored)).toBe(true);
			expect(stored).not.toContain("xoxb-token");
			expect(decodeSecret(stored)).toBe("xoxb-token");
		}
	});

	it("treats other flag values as off", () => {
		process.env.INTEGRATION_SECRET_ENCRYPTION = "no";
		expect(isIntegrationSecretEncryptionEnabled()).toBe(false);
		expect(isEncodedSecret(storeSecret("tok"))).toBe(false);
	});
});
