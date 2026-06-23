import { beforeEach, describe, expect, mock, test } from "bun:test";

type LarkConnectionRow = {
	id: string;
	organizationId: string;
	config: { provider: "lark"; appId?: string; verificationToken?: string };
};

// Mutable fixture the mocked db reads from; each test sets it before calling POST.
let connections: LarkConnectionRow[] = [];

// Inbound-event dedup state: tests mutate `insertReturningResult` to simulate a
// fresh insert (`[{ id }]`) vs. an `onConflictDoNothing` no-op (`[]`).
let inboundInsertValues: unknown[] = [];
let deleteWhereCalls: unknown[] = [];
let insertReturningResult: Array<Record<string, unknown>> = [{ id: "event-1" }];
const publishJSONMock = mock(async () => ({}));

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

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findMany: mock(async () => connections),
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
		delete: mock(() => ({
			where: mock(async (where: unknown) => {
				deleteWhereCalls.push(where);
			}),
		})),
	},
}));

// Drizzle operators/columns are only used to build a `where` we never execute
// against a real db, so string stand-ins are sufficient.
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

const { POST } = await import("./route");

const APP_ID = "cli_app123";
const VERIFICATION_TOKEN = "verify-token";

function setConnections(rows: LarkConnectionRow[]) {
	connections = rows;
}

function larkConnection(
	overrides: Partial<LarkConnectionRow["config"]> = {},
): LarkConnectionRow {
	return {
		id: "conn-1",
		organizationId: "org-1",
		config: {
			provider: "lark",
			appId: APP_ID,
			verificationToken: VERIFICATION_TOKEN,
			...overrides,
		},
	};
}

function post(body: unknown) {
	return POST(
		new Request("http://localhost/api/integrations/lark/events", {
			method: "POST",
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);
}

describe("lark events route", () => {
	beforeEach(() => {
		inboundInsertValues = [];
		deleteWhereCalls = [];
		insertReturningResult = [{ id: "event-1" }];
		publishJSONMock.mockClear();
		publishJSONMock.mockImplementation(async () => ({}));
	});

	test("url_verification with matching token echoes the challenge", async () => {
		setConnections([larkConnection()]);

		const response = await post({
			type: "url_verification",
			challenge: "challenge-xyz",
			token: VERIFICATION_TOKEN,
		});

		expect(response.status).toBe(200);
		const json = (await response.json()) as { challenge: string };
		expect(json.challenge).toBe("challenge-xyz");
	});

	test("url_verification with unmatched token returns 401", async () => {
		setConnections([larkConnection()]);

		const response = await post({
			type: "url_verification",
			challenge: "challenge-xyz",
			token: "wrong-token",
		});

		expect(response.status).toBe(401);
	});

	test("event for an unknown app acks with 200 (no action)", async () => {
		setConnections([larkConnection()]);

		const response = await post({
			schema: "2.0",
			header: {
				app_id: "cli_other",
				token: "whatever",
				event_type: "im.message.receive_v1",
			},
			event: {
				message: {
					message_id: "om_1",
					chat_id: "oc_1",
					content: JSON.stringify({ text: "hi" }),
				},
				sender: { sender_id: { open_id: "ou_1" }, sender_type: "user" },
			},
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("event with wrong token for a known app returns 401", async () => {
		setConnections([larkConnection()]);

		const response = await post({
			schema: "2.0",
			header: {
				app_id: APP_ID,
				token: "wrong-token",
				event_type: "im.message.receive_v1",
			},
			event: {
				message: {
					message_id: "om_1",
					chat_id: "oc_1",
					content: JSON.stringify({ text: "hi" }),
				},
				sender: { sender_id: { open_id: "ou_1" }, sender_type: "user" },
			},
		});

		expect(response.status).toBe(401);
	});

	function validMessageEvent() {
		return {
			schema: "2.0",
			header: {
				event_id: "evt-1",
				app_id: APP_ID,
				token: VERIFICATION_TOKEN,
				event_type: "im.message.receive_v1",
			},
			event: {
				message: {
					message_id: "om_1",
					chat_id: "oc_1",
					content: JSON.stringify({ text: "hello rox" }),
				},
				sender: { sender_id: { open_id: "ou_1" }, sender_type: "user" },
			},
		};
	}

	test("valid message event dedups, enqueues the job, and acks 200", async () => {
		setConnections([larkConnection()]);

		const response = await post(validMessageEvent());

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");

		// Dedup row scoped by connection + Lark event_id.
		expect(inboundInsertValues).toEqual([
			{
				connectionId: "conn-1",
				provider: "lark",
				externalEventId: "conn-1:evt-1",
			},
		]);

		// Job dispatched with everything the worker needs to run + reply back.
		expect(publishJSONMock).toHaveBeenCalledTimes(1);
		expect(publishJSONMock.mock.calls[0]?.[0]).toEqual({
			url: "http://localhost/api/integrations/lark/jobs/process-message",
			body: {
				connectionId: "conn-1",
				chatId: "oc_1",
				messageId: "om_1",
				eventId: "evt-1",
				text: "hello rox",
			},
			retries: 3,
		});
	});

	test("duplicate event (onConflictDoNothing no-op) is not re-enqueued", async () => {
		setConnections([larkConnection()]);
		insertReturningResult = [];

		const response = await post(validMessageEvent());

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("rolls back the inbound event and returns 503 when queueing fails", async () => {
		setConnections([larkConnection()]);
		publishJSONMock.mockImplementation(async () => {
			throw new Error("qstash unavailable");
		});

		const response = await post(validMessageEvent());

		expect(response.status).toBe(503);
		expect(inboundInsertValues).toHaveLength(1);
		expect(deleteWhereCalls).toHaveLength(1);
	});

	test("bot sender is acked (200) without action", async () => {
		setConnections([larkConnection()]);

		const response = await post({
			schema: "2.0",
			header: {
				app_id: APP_ID,
				token: VERIFICATION_TOKEN,
				event_type: "im.message.receive_v1",
			},
			event: {
				message: {
					message_id: "om_1",
					chat_id: "oc_1",
					content: JSON.stringify({ text: "loop guard" }),
				},
				sender: { sender_id: { open_id: "ou_bot" }, sender_type: "bot" },
			},
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("malformed JSON returns 400", async () => {
		setConnections([larkConnection()]);

		const response = await post("{not valid json");

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON payload");
	});
});
