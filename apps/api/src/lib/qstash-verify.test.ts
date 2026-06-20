import { describe, expect, mock, test } from "bun:test";

// The module reads `env` at import time (to construct a QStash `Receiver`).
// Mock only `@/env` so importing the unit under test doesn't require a fully
// validated environment. We deliberately do NOT mock `@upstash/qstash`: the
// real `Receiver` constructor accepts these dummy keys without throwing, and
// re-mocking that module here would leak a different `Receiver` shape into
// sibling route tests (bun's `mock.module` registry is process-global), which
// owns its own stateful QStash mock.
mock.module("@/env", () => ({
	env: {
		QSTASH_CURRENT_SIGNING_KEY: "sig_current",
		QSTASH_NEXT_SIGNING_KEY: "sig_next",
		NEXT_PUBLIC_API_URL: "http://localhost",
	},
}));

const { isQstashDevBypassAllowed } = await import("./qstash-verify");

describe("isQstashDevBypassAllowed", () => {
	test("fails closed when the flag is absent", () => {
		expect(isQstashDevBypassAllowed({})).toBe(false);
	});

	test("fails closed when the flag is any value other than 'true'", () => {
		expect(isQstashDevBypassAllowed({ ALLOW_UNSIGNED_QSTASH: "1" })).toBe(
			false,
		);
		expect(isQstashDevBypassAllowed({ ALLOW_UNSIGNED_QSTASH: "yes" })).toBe(
			false,
		);
		expect(isQstashDevBypassAllowed({ ALLOW_UNSIGNED_QSTASH: "false" })).toBe(
			false,
		);
	});

	test("never bypasses when a signing key is present, even with the flag", () => {
		expect(
			isQstashDevBypassAllowed({
				ALLOW_UNSIGNED_QSTASH: "true",
				QSTASH_CURRENT_SIGNING_KEY: "sig_current",
			}),
		).toBe(false);
		expect(
			isQstashDevBypassAllowed({
				ALLOW_UNSIGNED_QSTASH: "true",
				QSTASH_NEXT_SIGNING_KEY: "sig_next",
			}),
		).toBe(false);
	});

	test("allows bypass only with the explicit flag AND no signing keys", () => {
		expect(isQstashDevBypassAllowed({ ALLOW_UNSIGNED_QSTASH: "true" })).toBe(
			true,
		);
	});
});
