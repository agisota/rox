import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_CURRENT_SIGNING_KEY: "current",
		QSTASH_NEXT_SIGNING_KEY: "next",
		NEXT_PUBLIC_API_URL: "http://localhost",
		NODE_ENV: "test",
	},
}));

// Mock the verify helper directly so this file's verify state is isolated from
// sibling route tests sharing the same bun process.
let verified: { ok: true; body: string } | { ok: false; response: Response } = {
	ok: true,
	body: "",
};
const verifyQstashMock = mock(async () => verified);
const isQstashDevBypassAllowedMock = mock(() => false);
mock.module("@/lib/qstash-verify", () => ({
	verifyQstash: verifyQstashMock,
	isQstashDevBypassAllowed: isQstashDevBypassAllowedMock,
}));

// Ambient reconcile: tests flip the return value to drive the result branches
// without touching R1 or the DB.
let runResult: Record<string, unknown> = {
	considered: 0,
	rateLimited: 0,
	noSignal: 0,
	suppressed: 0,
	nudged: 0,
};
const runAmbientNudgesMock = mock(async () => runResult);
mock.module("@/lib/ambient/ambient-generation", () => ({
	runAmbientNudges: runAmbientNudgesMock,
}));

const { POST } = await import("./route");

function buildRequest(body: unknown = {}) {
	const json = typeof body === "string" ? body : JSON.stringify(body);
	verified = { ok: true, body: json };
	return new Request("http://localhost/api/ambient/nudge", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: json,
	});
}

describe("ambient/nudge route", () => {
	beforeEach(() => {
		verified = { ok: true, body: "{}" };
		verifyQstashMock.mockClear();
		runAmbientNudgesMock.mockClear();
		runResult = {
			considered: 0,
			rateLimited: 0,
			noSignal: 0,
			suppressed: 0,
			nudged: 0,
		};
	});

	test("returns the verifier's 401 response when verification fails", async () => {
		verified = {
			ok: false,
			response: Response.json({ error: "Invalid signature" }, { status: 401 }),
		};
		const request = new Request("http://localhost/api/ambient/nudge", {
			method: "POST",
			body: "{}",
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(runAmbientNudgesMock).not.toHaveBeenCalled();
	});

	test("runs the reconcile and returns its result on a valid request", async () => {
		runResult = {
			considered: 3,
			rateLimited: 1,
			noSignal: 1,
			suppressed: 0,
			nudged: 1,
		};

		const response = await POST(buildRequest());

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			considered: number;
			nudged: number;
		};
		expect(json.considered).toBe(3);
		expect(json.nudged).toBe(1);
		expect(runAmbientNudgesMock).toHaveBeenCalledTimes(1);
	});

	test("passes through the unconfigured no-op result", async () => {
		runResult = {
			considered: 0,
			rateLimited: 0,
			noSignal: 0,
			suppressed: 0,
			nudged: 0,
			skippedUnconfigured: true,
		};

		const response = await POST(buildRequest());

		expect(response.status).toBe(200);
		const json = (await response.json()) as { skippedUnconfigured?: boolean };
		expect(json.skippedUnconfigured).toBe(true);
	});
});
