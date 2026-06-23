import { describe, expect, it } from "bun:test";
import { FEED_TOKEN_BYTES, generateFeedToken } from "./feed-token";

describe("generateFeedToken", () => {
	it("returns a url-safe base64url string of sufficient length", () => {
		const token = generateFeedToken();
		// 24 bytes base64url-encodes to 32 chars (no padding).
		expect(token.length).toBeGreaterThanOrEqual(24);
		expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(token).not.toContain("=");
	});

	it("draws >=128 bits of randomness", () => {
		expect(FEED_TOKEN_BYTES).toBeGreaterThanOrEqual(16);
	});

	it("produces a different token on each call", () => {
		const a = generateFeedToken();
		const b = generateFeedToken();
		expect(a).not.toBe(b);
	});
});
