import { beforeEach, describe, expect, mock, test } from "bun:test";

const publishJSONMock = mock(async () => ({}));
let inboundInsertValues: unknown[] = [];
let insertReturningResult: Array<Record<string, unknown>> = [{ id: "event-1" }];

mock.module("@/env", () => ({
	env: {
		QSTASH_TOKEN: "test-qstash-token",
		NEXT_PUBLIC_API_URL: "http://localhost",
	},
}));

mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = publishJSONMock;
	},
	Receiver: class {
		verify = mock(async () => true);
	},
}));

// Configurable result for db.query.integrationConnections.findMany. Tests mutate
// this to simulate "no match" vs. a stored connection whose config.webhookSecret
// equals the request header.
let connectionsResult: Array<Record<string, unknown>> = [];

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findMany: mock(async () => connectionsResult),
			},
		},
		insert: mock(() => ({
			values: mock((values: unknown) => {
				inboundInsertValues.push(values);
				return {
					onConflictDoNothing: mock(() => ({
						returning: mock(async () => insertReturningResult),
					})),
				};
			}),
		})),
	},
}));

// The route only references the `integrationConnections` table object inside
// drizzle `eq(...)` expressions; a plain stub satisfies the import.
mock.module("@rox/db/schema", () => ({
	integrationConnections: {
		provider: "provider",
		disconnectedAt: "disconnectedAt",
		id: "id",
	},
	integrationInboundEvents: {
		id: "id",
		connectionId: "connectionId",
		provider: "provider",
		externalEventId: "externalEventId",
	},
}));

const WEBHOOK_SECRET = "stored-secret-token";
const MATCHING_CONNECTION = {
	id: "conn-1",
	organizationId: "org-1",
	config: { provider: "telegram", webhookSecret: WEBHOOK_SECRET },
};

const { POST } = await import("./route");

function buildRequest(secret: string | null, body: unknown) {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
	return new Request("http://localhost/api/integrations/telegram/webhook", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

const HUMAN_UPDATE = {
	update_id: 1,
	message: {
		message_id: 10,
		text: "hello",
		chat: { id: 555, type: "private" },
		from: { id: 999, is_bot: false },
	},
};

const BOT_UPDATE = {
	update_id: 2,
	message: {
		message_id: 11,
		text: "loop?",
		chat: { id: 555, type: "private" },
		from: { id: 1000, is_bot: true },
	},
};

describe("telegram webhook route", () => {
	beforeEach(() => {
		connectionsResult = [MATCHING_CONNECTION];
		inboundInsertValues = [];
		insertReturningResult = [{ id: "event-1" }];
		publishJSONMock.mockClear();
	});

	test("returns 401 when the secret header is missing", async () => {
		const response = await POST(buildRequest(null, HUMAN_UPDATE));
		expect(response.status).toBe(401);
	});

	test("returns 401 when the secret header does not match any connection", async () => {
		const response = await POST(buildRequest("wrong-secret", HUMAN_UPDATE));
		expect(response.status).toBe(401);
	});

	test("returns 401 when there are no connections at all", async () => {
		connectionsResult = [];
		const response = await POST(buildRequest(WEBHOOK_SECRET, HUMAN_UPDATE));
		expect(response.status).toBe(401);
	});

	test("returns 200 and ignores a bot-authored message", async () => {
		const response = await POST(buildRequest(WEBHOOK_SECRET, BOT_UPDATE));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("returns 200 and queues a valid human message", async () => {
		const response = await POST(buildRequest(WEBHOOK_SECRET, HUMAN_UPDATE));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(inboundInsertValues).toEqual([
			{
				connectionId: "conn-1",
				provider: "telegram",
				externalEventId: "1",
			},
		]);
		expect(publishJSONMock).toHaveBeenCalledTimes(1);
		expect(publishJSONMock.mock.calls[0]?.[0]).toEqual({
			url: "http://localhost/api/integrations/telegram/jobs/process-message",
			body: {
				connectionId: "conn-1",
				update: {
					updateId: 1,
					chatId: 555,
					text: "hello",
					fromUserId: 999,
					fromIsBot: false,
				},
			},
			retries: 3,
		});
	});

	test("returns 200 without queuing duplicate updates", async () => {
		insertReturningResult = [];
		const response = await POST(buildRequest(WEBHOOK_SECRET, HUMAN_UPDATE));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("returns 200 (acks) when an authenticated request has a non-message update", async () => {
		const response = await POST(
			buildRequest(WEBHOOK_SECRET, {
				update_id: 3,
				callback_query: { id: "cb" },
			}),
		);
		expect(response.status).toBe(200);
		expect(publishJSONMock).not.toHaveBeenCalled();
	});
});
