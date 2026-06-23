import { describe, expect, mock, test } from "bun:test";
import { getTenantAccessToken, replyMessage, sendMessage } from "./lark-client";

type CapturedRequest = {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: unknown;
};

/** Builds a mock `fetch` that records the request and replies with `responseBody`. */
function mockFetch(
	responseBody: unknown,
	captured: CapturedRequest[],
	status = 200,
) {
	return mock(async (url: string | URL | Request, init?: RequestInit) => {
		captured.push({
			url: String(url),
			method: init?.method ?? "GET",
			headers: (init?.headers as Record<string, string>) ?? {},
			body: init?.body ? JSON.parse(init.body as string) : undefined,
		});
		return new Response(JSON.stringify(responseBody), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

describe("lark-client", () => {
	test("getTenantAccessToken POSTs app credentials and returns the token", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch(
			{ code: 0, msg: "ok", tenant_access_token: "t-abc123", expire: 7200 },
			captured,
		);

		const token = await getTenantAccessToken({
			appId: "cli_app123",
			appSecret: "secret-xyz",
			fetchImpl,
		});

		expect(token).toBe("t-abc123");
		expect(captured).toHaveLength(1);
		expect(captured[0]?.url).toBe(
			"https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
		);
		expect(captured[0]?.method).toBe("POST");
		expect(captured[0]?.body).toEqual({
			app_id: "cli_app123",
			app_secret: "secret-xyz",
		});
	});

	test("getTenantAccessToken targets the Feishu host for the cn region", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch(
			{ code: 0, tenant_access_token: "t-cn" },
			captured,
		);

		await getTenantAccessToken({
			appId: "cli_app123",
			appSecret: "secret-xyz",
			region: "cn",
			fetchImpl,
		});

		expect(captured[0]?.url).toBe(
			"https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
		);
	});

	test("getTenantAccessToken throws on a non-zero code", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch(
			{ code: 99991663, msg: "app ticket invalid" },
			captured,
		);

		await expect(
			getTenantAccessToken({
				appId: "cli_app123",
				appSecret: "bad",
				fetchImpl,
			}),
		).rejects.toThrow(/app ticket invalid/);
	});

	test("getTenantAccessToken throws when the token is absent", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch({ code: 0, msg: "ok" }, captured);

		await expect(
			getTenantAccessToken({
				appId: "cli_app123",
				appSecret: "secret",
				fetchImpl,
			}),
		).rejects.toThrow(/tenant_access_token missing/);
	});

	test("replyMessage posts a threaded text reply with the bearer token + uuid", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch(
			{ code: 0, data: { message_id: "om_reply" } },
			captured,
		);

		await replyMessage({
			tenantAccessToken: "t-abc123",
			messageId: "om_source",
			text: "hello back",
			uuid: "evt-1",
			fetchImpl,
		});

		expect(captured).toHaveLength(1);
		expect(captured[0]?.url).toBe(
			"https://open.larksuite.com/open-apis/im/v1/messages/om_source/reply",
		);
		expect(captured[0]?.headers.authorization).toBe("Bearer t-abc123");
		expect(captured[0]?.body).toEqual({
			msg_type: "text",
			content: JSON.stringify({ text: "hello back" }),
			reply_in_thread: true,
			uuid: "evt-1",
		});
	});

	test("replyMessage throws when Lark returns a non-zero code", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch(
			{ code: 230002, msg: "bot is not in the chat" },
			captured,
		);

		await expect(
			replyMessage({
				tenantAccessToken: "t-abc123",
				messageId: "om_source",
				text: "hi",
				fetchImpl,
			}),
		).rejects.toThrow(/bot is not in the chat/);
	});

	test("sendMessage posts to a chat by chat_id", async () => {
		const captured: CapturedRequest[] = [];
		const fetchImpl = mockFetch(
			{ code: 0, data: { message_id: "om_new" } },
			captured,
		);

		await sendMessage({
			tenantAccessToken: "t-abc123",
			chatId: "oc_chat",
			text: "fallback",
			fetchImpl,
		});

		expect(captured[0]?.url).toBe(
			"https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id",
		);
		expect(captured[0]?.body).toEqual({
			receive_id: "oc_chat",
			msg_type: "text",
			content: JSON.stringify({ text: "fallback" }),
		});
	});

	test("throws a clear error when the transport fails", async () => {
		const fetchImpl = mock(async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;

		await expect(
			getTenantAccessToken({
				appId: "cli_app123",
				appSecret: "secret",
				fetchImpl,
			}),
		).rejects.toThrow(/Lark tenant_access_token request failed/);
	});
});
