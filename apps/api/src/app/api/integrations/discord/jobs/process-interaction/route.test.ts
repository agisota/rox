import { beforeEach, describe, expect, mock, test } from "bun:test";

// verifyQstash is stubbed to a pass-through that returns the raw body, so the
// route's parse + dispatch logic is what's under test (signature verification is
// covered by the shared qstash-verify tests).
let verifyResult:
	| { ok: true; body: string }
	| { ok: false; response: Response };

const verifyQstashMock = mock(async () => verifyResult);

mock.module("@/lib/qstash-verify", () => ({
	verifyQstash: verifyQstashMock,
}));

mock.module("@/env", () => ({
	env: { NEXT_PUBLIC_API_URL: "https://api.test" },
}));

const processDiscordInteractionMock = mock(async () => ({
	success: true as const,
	replied: true,
}));

mock.module("../../process-interaction", () => ({
	processDiscordInteraction: processDiscordInteractionMock,
}));

const { POST } = await import("./route");

function request(): Request {
	return new Request(
		"https://api.test/api/integrations/discord/jobs/process-interaction",
		{ method: "POST" },
	);
}

const validBody = {
	connectionId: "conn-1",
	interaction: {
		id: "interaction-1",
		token: "tok-1",
		applicationId: "app-1",
		text: "what is rox?",
	},
};

describe("discord process-interaction job route", () => {
	beforeEach(() => {
		verifyResult = { ok: true, body: JSON.stringify(validBody) };
		verifyQstashMock.mockClear();
		processDiscordInteractionMock.mockClear();
		processDiscordInteractionMock.mockImplementation(async () => ({
			success: true as const,
			replied: true,
		}));
	});

	test("returns the 401 response when QStash verification fails", async () => {
		verifyResult = {
			ok: false,
			response: Response.json({ error: "Invalid signature" }, { status: 401 }),
		};

		const response = await POST(request());

		expect(response.status).toBe(401);
		expect(processDiscordInteractionMock).not.toHaveBeenCalled();
	});

	test("returns 400 for non-JSON body", async () => {
		verifyResult = { ok: true, body: "{not json" };

		const response = await POST(request());

		expect(response.status).toBe(400);
		expect(processDiscordInteractionMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the payload shape is invalid", async () => {
		verifyResult = {
			ok: true,
			body: JSON.stringify({ connectionId: "conn-1" }),
		};

		const response = await POST(request());

		expect(response.status).toBe(400);
		expect(processDiscordInteractionMock).not.toHaveBeenCalled();
	});

	test("dispatches a valid payload to the processor", async () => {
		const response = await POST(request());

		expect(response.status).toBe(200);
		expect(processDiscordInteractionMock).toHaveBeenCalledTimes(1);
		const arg = processDiscordInteractionMock.mock
			.calls[0]?.[0] as typeof validBody;
		expect(arg.connectionId).toBe("conn-1");
		expect(arg.interaction.token).toBe("tok-1");
		expect(arg.interaction.applicationId).toBe("app-1");
		expect(arg.interaction.text).toBe("what is rox?");
	});
});
