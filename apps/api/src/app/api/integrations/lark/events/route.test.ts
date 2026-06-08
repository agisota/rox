import { describe, expect, it } from "bun:test";
import { createCipheriv, createHash } from "node:crypto";
import { decryptLarkEvent, verifyLarkSignature } from "../verify-decrypt";

function encryptForLark(encryptKey: string, plaintext: string): string {
	const key = createHash("sha256").update(encryptKey).digest();
	// Use a deterministic IV for test reproducibility
	const iv = Buffer.alloc(16, 0x42);
	const cipher = createCipheriv("aes-256-cbc", key, iv);
	const encrypted = Buffer.concat([
		iv,
		cipher.update(Buffer.from(plaintext, "utf8")),
		cipher.final(),
	]);
	return encrypted.toString("base64");
}

describe("decryptLarkEvent", () => {
	it("decrypts a Lark AES-256-CBC encrypted event", () => {
		const encryptKey = "test-encrypt-key-12345";
		const original = JSON.stringify({
			challenge: "verify-me",
			type: "url_verification",
		});

		const encrypted = encryptForLark(encryptKey, original);
		const decrypted = decryptLarkEvent(encryptKey, encrypted);

		expect(decrypted).toBe(original);
	});

	it("throws on invalid base64 data", () => {
		expect(() => decryptLarkEvent("some-key", "!!!not-base64!!!")).toThrow();
	});
});

describe("verifyLarkSignature", () => {
	it("returns true for a valid signature", () => {
		const encryptKey = "my-lark-encrypt-key";
		const timestamp = "1700000000";
		const nonce = "abc123";
		const body = '{"type":"event_callback"}';

		const { createHash: _ch } =
			require("node:crypto") as typeof import("node:crypto");
		const computed = _ch("sha256")
			.update(timestamp + nonce + encryptKey + body)
			.digest("hex");

		expect(
			verifyLarkSignature({
				timestamp,
				nonce,
				encryptKey,
				body,
				signature: computed,
			}),
		).toBe(true);
	});

	it("returns false for a tampered body", () => {
		const encryptKey = "my-lark-encrypt-key";
		const timestamp = "1700000000";
		const nonce = "abc123";
		const body = '{"type":"event_callback"}';
		const tampered = '{"type":"malicious"}';

		const { createHash: _ch } =
			require("node:crypto") as typeof import("node:crypto");
		const computed = _ch("sha256")
			.update(timestamp + nonce + encryptKey + body)
			.digest("hex");

		expect(
			verifyLarkSignature({
				timestamp,
				nonce,
				encryptKey,
				body: tampered,
				signature: computed,
			}),
		).toBe(false);
	});
});
