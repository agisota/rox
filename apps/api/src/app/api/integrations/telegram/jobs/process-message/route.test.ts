import { beforeEach, describe, expect, mock, test } from "bun:test";

let verifyResult = true;
const verifyMock = mock(async () => verifyResult);

mock.module("@/env", () => ({
	env: {
		QSTASH_CURRENT_SIGNING_KEY: "current",
		QSTASH_NEXT_SIGNING_KEY: "next",
		NEXT_PUBLIC_API_URL: "http://localhost",
	},
}));

mock.module("@upstash/qstash", () => ({
	Client: class {},
	Receiver: class {
		verify = verifyMock;
	},
}));

const processTelegramMessageMock = mock(async () => ({
	success: true,
	replied: true,
	messagesSent: 1,
}));
mock.module("../../process-message", () => ({
	processTelegramMessage: processTelegramMessageMock,
}));

const { POST } = await import("./route");

const VALID_PAYLOAD = {
	connectionId: "conn-1",
	update: {
		updateId: 123,
		chatId: 555,
		text: "hello",
		fromUserId: 999,
		fromIsBot: false,
	},
};

function buildRequest(body: unknown, signature: string | null = "sig") {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (signature) headers["upstash-signature"] = signature;
	return new Request(
		"http://localhost/api/integrations/telegram/jobs/process-message",
		{
			method: "POST",
			headers,
			body: JSON.stringify(body),
		},
	);
}

describe("telegram process-message job route", () => {
	beforeEach(() => {
		verifyResult = true;
		verifyMock.mockClear();
		processTelegramMessageMock.mockClear();
	});

	test("requires an Upstash signature", async () => {
		const response = await POST(buildRequest(VALID_PAYLOAD, null));
		expect(response.status).toBe(401);
	});

	test("rejects an invalid Upstash signature", async () => {
		verifyResult = false;
		const response = await POST(buildRequest(VALID_PAYLOAD));
		expect(response.status).toBe(401);
	});

	test("processes a valid signed payload", async () => {
		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			replied: true,
			messagesSent: 1,
		});
		expect(verifyMock).toHaveBeenCalledWith({
			body: JSON.stringify(VALID_PAYLOAD),
			signature: "sig",
			url: "http://localhost/api/integrations/telegram/jobs/process-message",
		});
		expect(processTelegramMessageMock).toHaveBeenCalledWith(VALID_PAYLOAD);
	});

	test("returns 400 for an invalid payload", async () => {
		const response = await POST(buildRequest({ connectionId: "" }));
		expect(response.status).toBe(400);
		expect(processTelegramMessageMock).not.toHaveBeenCalled();
	});
});
