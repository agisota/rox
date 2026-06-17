import { describe, expect, mock, test } from "bun:test";
import { deleteWebhook, sendMessage, setWebhook } from "./telegram-client";

const BOT_TOKEN = "123456:test-bot-token";

type CapturedRequest = {
	url: string;
	method: string;
	body: unknown;
};

/** Builds a mock `fetch` that records the request and replies with `responseBody`. */
function mockFetch(responseBody: unknown, captured: CapturedRequest[]) {
	return mock(async (url: string | URL | Request, init?: RequestInit) => {
		captured.push({
			url: String(url),
			method: init?.method ?? "GET",
			body: init?.body ? JSON.parse(init.body as string) : undefined,
		});
		return new Response(JSON.stringify(responseBody), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

describe("telegram-client", () => {
	test("sendMessage POSTs chat_id + text to the sendMessage URL", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch(
			{ ok: true, result: { message_id: 7 } },
			captured,
		);

		const res = await sendMessage({
			botToken: BOT_TOKEN,
			chatId: 42,
			text: "hello",
			fetchImpl,
		});

		expect(res.ok).toBe(true);
		expect(captured).toHaveLength(1);
		expect(captured[0]?.method).toBe("POST");
		expect(captured[0]?.url).toBe(
			`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
		);
		expect(captured[0]?.body).toEqual({ chat_id: 42, text: "hello" });
	});

	test("setWebhook POSTs url + secret_token to the setWebhook URL", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch({ ok: true, result: true }, captured);

		const res = await setWebhook({
			botToken: BOT_TOKEN,
			url: "https://api.example.test/api/integrations/telegram/webhook",
			secretToken: "super-secret",
			fetchImpl,
		});

		expect(res.ok).toBe(true);
		expect(captured[0]?.url).toBe(
			`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
		);
		expect(captured[0]?.body).toEqual({
			url: "https://api.example.test/api/integrations/telegram/webhook",
			secret_token: "super-secret",
		});
	});

	test("deleteWebhook POSTs an empty body to the deleteWebhook URL", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch({ ok: true, result: true }, captured);

		await deleteWebhook({ botToken: BOT_TOKEN, fetchImpl });

		expect(captured[0]?.url).toBe(
			`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`,
		);
		expect(captured[0]?.body).toEqual({});
	});

	test("throws a clear error when Telegram responds ok:false", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch(
			{ ok: false, description: "chat not found", error_code: 400 },
			captured,
		);

		await expect(
			sendMessage({ botToken: BOT_TOKEN, chatId: 1, text: "x", fetchImpl }),
		).rejects.toThrow("Telegram sendMessage failed: chat not found");
	});

	test("throws a clear error when the transport rejects", async () => {
		const fetchImpl = mock(async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;

		await expect(
			setWebhook({
				botToken: BOT_TOKEN,
				url: "https://api.example.test/webhook",
				secretToken: "s",
				fetchImpl,
			}),
		).rejects.toThrow("Telegram setWebhook request failed");
	});
});
