import { afterEach, describe, expect, mock, test } from "bun:test";

// oauth-state reads `env.BETTER_AUTH_SECRET` at call time to derive the HMAC
// signing key, and `logger` at module load. Mock only these two seams so the
// unit under test can be imported without a fully validated environment.
// We deliberately avoid touching `node:crypto` so the real HMAC/timing-safe
// comparison is exercised. (bun's mock.module registry is process-global; the
// app-wide afterEach(mock.restore()) in test-setup.ts keeps these contained.)
const TEST_SECRET = "test-better-auth-secret-0123456789";

mock.module("@/env", () => ({
	env: {
		BETTER_AUTH_SECRET: TEST_SECRET,
	},
}));

mock.module("@/lib/logger", () => ({
	logger: {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		warn: mock(() => undefined),
		error: mock(() => undefined),
	},
}));

const { createSignedState, verifySignedState } = await import("./oauth-state");

const ORG = "org-123";
const USER = "user-456";

afterEach(() => {
	mock.restore();
});

describe("createSignedState / verifySignedState round-trip", () => {
	test("verifies a freshly signed state and returns the original payload", () => {
		const state = createSignedState({ organizationId: ORG, userId: USER });
		expect(verifySignedState(state)).toEqual({
			organizationId: ORG,
			userId: USER,
		});
	});

	test("produces a two-part `payload.signature` token", () => {
		const state = createSignedState({ organizationId: ORG, userId: USER });
		const parts = state.split(".");
		expect(parts).toHaveLength(2);
		expect(parts[0]?.length).toBeGreaterThan(0);
		expect(parts[1]?.length).toBeGreaterThan(0);
	});
});

describe("verifySignedState rejects tampered payloads", () => {
	test("returns null when the payload body is mutated but signature kept", () => {
		const state = createSignedState({ organizationId: ORG, userId: USER });
		const [, signature] = state.split(".");

		const forgedPayload = Buffer.from(
			JSON.stringify({
				organizationId: "attacker-org",
				userId: USER,
				timestamp: Date.now(),
			}),
		).toString("base64url");

		expect(verifySignedState(`${forgedPayload}.${signature}`)).toBeNull();
	});

	test("returns null when the signature is mutated but payload kept", () => {
		const state = createSignedState({ organizationId: ORG, userId: USER });
		const [payload, signature] = state.split(".");

		// Flip the first character of the signature to a different valid char.
		const firstChar = signature?.charAt(0);
		const replacement = firstChar === "A" ? "B" : "A";
		const tamperedSig = `${replacement}${signature?.slice(1)}`;

		expect(verifySignedState(`${payload}.${tamperedSig}`)).toBeNull();
	});
});

describe("verifySignedState enforces the signing secret", () => {
	test("returns null for a state signed with a different secret", async () => {
		// Sign a state with the real secret.
		const validState = createSignedState({
			organizationId: ORG,
			userId: USER,
		});

		// Re-import the module under a *different* secret and verify the
		// previously-signed state no longer matches.
		mock.module("@/env", () => ({
			env: { BETTER_AUTH_SECRET: "a-totally-different-secret-value" },
		}));
		const reimported = await import(`./oauth-state?secret=wrong`);
		expect(reimported.verifySignedState(validState)).toBeNull();

		// Restore the canonical secret for subsequent tests in this file.
		mock.module("@/env", () => ({
			env: { BETTER_AUTH_SECRET: TEST_SECRET },
		}));
	});
});

describe("verifySignedState enforces the TTL / replay window", () => {
	test("returns null for a state whose timestamp is older than the TTL", () => {
		const state = createSignedState({ organizationId: ORG, userId: USER });

		// Advance time past the 10-minute TTL by stubbing Date.now.
		const realNow = Date.now;
		const elevenMinutes = 11 * 60 * 1000;
		const frozen = realNow();
		Date.now = () => frozen + elevenMinutes;
		try {
			expect(verifySignedState(state)).toBeNull();
		} finally {
			Date.now = realNow;
		}
	});

	test("returns null for a state whose timestamp is in the future", () => {
		const realNow = Date.now;
		const future = realNow() + 60 * 1000;
		// Sign while time is in the future, then verify at "now".
		Date.now = () => future;
		let state: string;
		try {
			state = createSignedState({ organizationId: ORG, userId: USER });
		} finally {
			Date.now = realNow;
		}
		expect(verifySignedState(state)).toBeNull();
	});

	test("accepts a state still within the TTL window", () => {
		const state = createSignedState({ organizationId: ORG, userId: USER });

		const realNow = Date.now;
		const nineMinutes = 9 * 60 * 1000;
		const frozen = realNow();
		Date.now = () => frozen + nineMinutes;
		try {
			expect(verifySignedState(state)).toEqual({
				organizationId: ORG,
				userId: USER,
			});
		} finally {
			Date.now = realNow;
		}
	});
});

describe("verifySignedState rejects malformed input", () => {
	test("returns null for an empty string", () => {
		expect(verifySignedState("")).toBeNull();
	});

	test("returns null when the dot separator is missing", () => {
		expect(verifySignedState("no-separator-token")).toBeNull();
	});

	test("returns null when the signature segment is missing", () => {
		const state = createSignedState({ organizationId: ORG, userId: USER });
		const [payload] = state.split(".");
		expect(verifySignedState(`${payload}.`)).toBeNull();
	});

	test("returns null when the payload segment is missing", () => {
		const state = createSignedState({ organizationId: ORG, userId: USER });
		const [, signature] = state.split(".");
		expect(verifySignedState(`.${signature}`)).toBeNull();
	});

	test("returns null when the payload is not valid JSON", () => {
		// Build a token whose signature is valid for non-JSON payload bytes, so
		// it passes the signature check and fails at the JSON.parse step.
		const garbage = Buffer.from("not-json-at-all").toString("base64url");
		const { createHmac } =
			require("node:crypto") as typeof import("node:crypto");
		const sig = createHmac("sha256", TEST_SECRET)
			.update(garbage)
			.digest("base64url");
		expect(verifySignedState(`${garbage}.${sig}`)).toBeNull();
	});

	test("returns null when the payload is valid JSON but fails schema", () => {
		// Signed but missing required fields (empty organizationId/userId).
		const badPayload = Buffer.from(
			JSON.stringify({ organizationId: "", userId: "", timestamp: Date.now() }),
		).toString("base64url");
		const { createHmac } =
			require("node:crypto") as typeof import("node:crypto");
		const sig = createHmac("sha256", TEST_SECRET)
			.update(badPayload)
			.digest("base64url");
		expect(verifySignedState(`${badPayload}.${sig}`)).toBeNull();
	});
});
