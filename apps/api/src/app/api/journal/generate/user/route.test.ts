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
mock.module("@/lib/qstash-verify", () => ({
	verifyQstash: verifyQstashMock,
}));

// Generation service: tests flip these return values to drive the happy /
// skipped / seed-fallback branches without touching R1 or the DB.
let generateResult: { status: string; reason?: string } = {
	status: "generated",
	entryId: "entry-1",
	sessionCount: 2,
	memoryCount: 3,
};
let seedResult: { status: string; reason?: string } = {
	status: "seeded",
	entryId: "seed-1",
	repoCount: 1,
	prCount: 0,
	memoryCount: 1,
};
const generateForDayMock = mock(async () => generateResult);
const generateSeedMock = mock(async () => seedResult);
mock.module("@/lib/journal/journal-generation", () => ({
	generateJournalForUserDay: generateForDayMock,
	generateJournalSeedForUser: generateSeedMock,
}));

const { POST } = await import("./route");

const VALID_PAYLOAD = {
	organizationId: "00000000-0000-4000-8000-000000000001",
	userId: "00000000-0000-4000-8000-000000000002",
	day: "2026-06-19",
};

function buildRequest(body: unknown) {
	const json = typeof body === "string" ? body : JSON.stringify(body);
	verified = { ok: true, body: json };
	return new Request("http://localhost/api/journal/generate/user", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: json,
	});
}

describe("journal/generate/user route", () => {
	beforeEach(() => {
		verified = { ok: true, body: JSON.stringify(VALID_PAYLOAD) };
		verifyQstashMock.mockClear();
		generateForDayMock.mockClear();
		generateSeedMock.mockClear();
		generateResult = {
			status: "generated",
			entryId: "entry-1",
			sessionCount: 2,
			memoryCount: 3,
		};
		seedResult = {
			status: "seeded",
			entryId: "seed-1",
			repoCount: 1,
			prCount: 0,
			memoryCount: 1,
		};
	});

	test("returns the verifier's 401 response when verification fails", async () => {
		verified = {
			ok: false,
			response: Response.json({ error: "Invalid signature" }, { status: 401 }),
		};
		const request = new Request("http://localhost/api/journal/generate/user", {
			method: "POST",
			body: "{}",
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(generateForDayMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the JSON body is malformed", async () => {
		const response = await POST(buildRequest("{not json"));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON");
		expect(generateForDayMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the payload fails zod validation", async () => {
		const response = await POST(buildRequest({ organizationId: "not-a-uuid" }));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid input");
		expect(generateForDayMock).not.toHaveBeenCalled();
	});

	test("returns the generation result on the happy path", async () => {
		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		const json = (await response.json()) as { status: string; entryId: string };
		expect(json.status).toBe("generated");
		expect(json.entryId).toBe("entry-1");
		expect(generateForDayMock).toHaveBeenCalledTimes(1);
		expect(generateSeedMock).not.toHaveBeenCalled();
	});

	test("falls back to the seed entry when there are no sessions", async () => {
		generateResult = { status: "skipped", reason: "no-sessions" };

		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		const json = (await response.json()) as { status: string };
		expect(json.status).toBe("seeded");
		expect(generateSeedMock).toHaveBeenCalledTimes(1);
	});

	test("does not seed when skipped for a non-session reason", async () => {
		generateResult = { status: "skipped", reason: "r1-unconfigured" };

		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		const json = (await response.json()) as { status: string };
		expect(json.status).toBe("skipped");
		expect(generateSeedMock).not.toHaveBeenCalled();
	});
});
