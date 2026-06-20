import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_CURRENT_SIGNING_KEY: "current",
		QSTASH_NEXT_SIGNING_KEY: "next",
		NEXT_PUBLIC_API_URL: "http://localhost",
	},
}));

// Mock the verification helper directly (rather than the underlying QStash
// Receiver) so this file's verify state is isolated from other route tests
// running in the same bun process — `mock.module("@upstash/qstash")` shares a
// single global registry across files and would otherwise bleed.
let verified: { ok: true; body: string } | { ok: false; response: Response } = {
	ok: true,
	body: "",
};
const verifyQstashMock = mock(async () => verified);
mock.module("@/lib/qstash-verify", () => ({
	verifyQstash: verifyQstashMock,
}));

const processSlackMentionMock = mock(async () => ({}));
mock.module("../../events/process-mention", () => ({
	processSlackMention: processSlackMentionMock,
}));

const { POST } = await import("./route");

const VALID_PAYLOAD = {
	event: {
		type: "app_mention",
		user: "U1",
		text: "hey there",
		ts: "1700000000.000100",
		channel: "C1",
		event_ts: "1700000000.000100",
	},
	teamId: "T1",
	eventId: "E1",
};

function buildRequest(body: unknown) {
	const json = typeof body === "string" ? body : JSON.stringify(body);
	verified = { ok: true, body: json };
	return new Request(
		"http://localhost/api/integrations/slack/jobs/process-mention",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: json,
		},
	);
}

describe("slack/jobs/process-mention route", () => {
	beforeEach(() => {
		verified = { ok: true, body: JSON.stringify(VALID_PAYLOAD) };
		verifyQstashMock.mockClear();
		processSlackMentionMock.mockClear();
	});

	test("returns the verifier's 401 response when verification fails", async () => {
		verified = {
			ok: false,
			response: Response.json({ error: "Invalid signature" }, { status: 401 }),
		};
		const request = new Request(
			"http://localhost/api/integrations/slack/jobs/process-mention",
			{ method: "POST", body: "{}" },
		);

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(processSlackMentionMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the payload fails zod validation", async () => {
		const response = await POST(
			buildRequest({ event: { type: "app_mention" }, teamId: "T1" }),
		);

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid payload");
		expect(processSlackMentionMock).not.toHaveBeenCalled();
	});

	test("processes a verified, well-formed mention payload", async () => {
		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		const json = (await response.json()) as { success: boolean };
		expect(json.success).toBe(true);
		expect(processSlackMentionMock).toHaveBeenCalledTimes(1);
	});
});
