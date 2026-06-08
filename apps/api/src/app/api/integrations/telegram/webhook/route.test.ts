import { describe, expect, it } from "bun:test";
import { verifyTelegramSignature } from "../verify-signature";

describe("verifyTelegramSignature", () => {
	it("returns true for identical tokens", () => {
		expect(
			verifyTelegramSignature({
				secretToken: "my-webhook-secret-token",
				headerValue: "my-webhook-secret-token",
			}),
		).toBe(true);
	});

	it("returns false for mismatched tokens", () => {
		expect(
			verifyTelegramSignature({
				secretToken: "correct-secret",
				headerValue: "wrong-secret",
			}),
		).toBe(false);
	});

	it("returns false for different lengths (no timing leak)", () => {
		expect(
			verifyTelegramSignature({
				secretToken: "short",
				headerValue: "short-but-longer-value",
			}),
		).toBe(false);
	});

	it("returns false for empty headerValue against non-empty token", () => {
		expect(
			verifyTelegramSignature({
				secretToken: "secret",
				headerValue: "",
			}),
		).toBe(false);
	});

	it("returns true when both tokens are empty strings", () => {
		expect(
			verifyTelegramSignature({
				secretToken: "",
				headerValue: "",
			}),
		).toBe(true);
	});
});
