import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { logger } from "./logger";

// Capture what actually reaches console.* so we can assert the scrubbed output
// the logger forwards, without writing to the real test output.
let infoCalls: unknown[][] = [];
let errorCalls: unknown[][] = [];
const originalInfo = console.info;
const originalError = console.error;

beforeEach(() => {
	infoCalls = [];
	errorCalls = [];
	console.info = mock((...args: unknown[]) => {
		infoCalls.push(args);
	});
	console.error = mock((...args: unknown[]) => {
		errorCalls.push(args);
	});
});

afterEach(() => {
	console.info = originalInfo;
	console.error = originalError;
});

describe("main logger secret redaction", () => {
	test("passes through plain string messages untouched", () => {
		logger.info("[tag] hello world");
		expect(infoCalls[0]).toEqual(["[tag] hello world"]);
	});

	test("redacts secret-looking keys in a flat object", () => {
		logger.info("[tag] inbound", {
			organizationId: "org-1",
			webhookSecret: "super-secret",
			apiKey: "ak_live_123",
			Authorization: "Bearer abc",
		});
		expect(infoCalls[0]).toEqual([
			"[tag] inbound",
			{
				organizationId: "org-1",
				webhookSecret: "[REDACTED]",
				apiKey: "[REDACTED]",
				Authorization: "[REDACTED]",
			},
		]);
	});

	test("redacts nested secret keys", () => {
		logger.error("[tag] config", {
			connection: {
				id: "c-1",
				config: { provider: "telegram", botToken: "12345:abc" },
			},
		});
		expect(errorCalls[0]).toEqual([
			"[tag] config",
			{
				connection: {
					id: "c-1",
					config: { provider: "telegram", botToken: "[REDACTED]" },
				},
			},
		]);
	});

	test("redacts secrets inside arrays", () => {
		logger.info("[tag] list", [{ accessToken: "t1" }, { accessToken: "t2" }]);
		expect(infoCalls[0]).toEqual([
			"[tag] list",
			[{ accessToken: "[REDACTED]" }, { accessToken: "[REDACTED]" }],
		]);
	});

	test("does not mutate the caller's object", () => {
		const original = { signingKey: "sk_123", keep: "ok" };
		logger.info("[tag]", original);
		expect(original.signingKey).toBe("sk_123");
	});

	test("handles cyclic objects without throwing", () => {
		const cyclic: Record<string, unknown> = { name: "x" };
		cyclic.self = cyclic;
		expect(() => logger.info("[tag] cyclic", cyclic)).not.toThrow();
	});

	test("forwards Error objects so message/stack survive", () => {
		const err = new Error("boom");
		logger.error("[tag] failed:", err);
		expect(errorCalls[0]?.[1]).toBe(err);
	});
});
