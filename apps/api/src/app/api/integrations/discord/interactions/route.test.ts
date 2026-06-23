import { beforeEach, describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";

// Real Ed25519 keypair so the signature verification path is genuinely
// exercised end-to-end (not stubbed). Exported public key is the 32-byte raw
// hex Discord provides.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY_HEX = (
	publicKey.export({ format: "der", type: "spki" }) as Buffer
)
	.subarray(12)
	.toString("hex");

function signBody(timestamp: string, body: string): string {
	return sign(null, Buffer.from(timestamp + body), privateKey).toString("hex");
}

// Mutable env/db holders the module mocks read at call time, so individual
// tests can flip the public key off or swap the connection rows.
let publicKeyHex: string | undefined = PUBLIC_KEY_HEX;
let connectionRows: Array<{
	id: string;
	organizationId: string;
	config: {
		provider: "discord";
		guildId?: string;
		applicationId?: string;
	} | null;
}> = [];

// Controls whether the dedup insert reports a fresh row (enqueue) or a conflict
// (duplicate redelivery). `null` simulates onConflictDoNothing returning nothing.
let insertedEventRow: { id: string } | null = { id: "event-1" };

// The route captures the `env` binding once at import, then reads
// `env.DISCORD_PUBLIC_KEY` per request. Make the property a getter on one stable
// object so toggling `publicKeyHex` between tests is observed at call time.
const envMock = {
	get DISCORD_PUBLIC_KEY() {
		return publicKeyHex;
	},
	QSTASH_TOKEN: "qstash-test-token",
	NEXT_PUBLIC_API_URL: "https://api.test",
};
mock.module("@/env", () => ({ env: envMock }));

// Chainable insert builder mirroring the drizzle calls the route makes:
// .insert(table).values(...).onConflictDoNothing(...).returning(...)
const insertReturningMock = mock(async () =>
	insertedEventRow ? [insertedEventRow] : [],
);
const deleteWhereMock = mock(async () => undefined);
const insertMock = mock(() => ({
	values: () => ({
		onConflictDoNothing: () => ({
			returning: insertReturningMock,
		}),
	}),
}));
const deleteMock = mock(() => ({
	where: deleteWhereMock,
}));

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findMany: async () => connectionRows,
			},
		},
		insert: insertMock,
		delete: deleteMock,
	},
}));

mock.module("@rox/db/schema", () => ({
	integrationConnections: {
		provider: "provider",
		disconnectedAt: "disconnectedAt",
	},
	integrationInboundEvents: {
		id: "id",
		provider: "provider",
		externalEventId: "externalEventId",
	},
}));

// Capture QStash publishes so tests can assert the enqueued job + payload.
const publishJSONMock = mock(async () => ({ messageId: "msg-1" }));
class MockQstashClient {
	publishJSON = publishJSONMock;
}
mock.module("@upstash/qstash", () => ({
	Client: MockQstashClient,
}));

const { POST } = await import("./route");

// A current timestamp so the route's replay/freshness guard (rejects requests
// whose `x-signature-timestamp` is >5 min from now) accepts these requests; the
// signature itself is still verified end-to-end against the real keypair.
const TIMESTAMP = String(Math.floor(Date.now() / 1000));

function makeRequest(body: string, headers: Record<string, string>): Request {
	return new Request("http://localhost/api/integrations/discord/interactions", {
		method: "POST",
		headers,
		body,
	});
}

function signedHeaders(
	timestamp: string,
	body: string,
): Record<string, string> {
	return {
		"content-type": "application/json",
		"x-signature-ed25519": signBody(timestamp, body),
		"x-signature-timestamp": timestamp,
	};
}

describe("discord interactions route", () => {
	beforeEach(() => {
		publicKeyHex = PUBLIC_KEY_HEX;
		connectionRows = [];
		insertedEventRow = { id: "event-1" };
		insertReturningMock.mockClear();
		deleteWhereMock.mockClear();
		insertMock.mockClear();
		deleteMock.mockClear();
		publishJSONMock.mockClear();
		publishJSONMock.mockImplementation(async () => ({ messageId: "msg-1" }));
	});

	test("returns 401 when signature headers are missing", async () => {
		const body = JSON.stringify({ type: 1 });
		const response = await POST(
			makeRequest(body, { "content-type": "application/json" }),
		);

		expect(response.status).toBe(401);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Missing signature headers");
	});

	test("returns 503 when DISCORD_PUBLIC_KEY is not configured", async () => {
		publicKeyHex = undefined;
		const body = JSON.stringify({ type: 1 });
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		expect(response.status).toBe(503);
	});

	test("returns 401 when the signature is invalid", async () => {
		const body = JSON.stringify({ type: 1 });
		const response = await POST(
			makeRequest(body, {
				...signedHeaders(TIMESTAMP, body),
				// Sign a different body so verification fails against the real key.
				"x-signature-ed25519": signBody(TIMESTAMP, "tampered"),
			}),
		);

		expect(response.status).toBe(401);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid signature");
	});

	test("returns 401 for a stale timestamp (replay guard)", async () => {
		const staleTimestamp = String(Math.floor(Date.now() / 1000) - 60 * 10);
		const body = JSON.stringify({ type: 1 });
		const response = await POST(
			makeRequest(body, signedHeaders(staleTimestamp, body)),
		);

		expect(response.status).toBe(401);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Stale request");
	});

	test("returns 400 for malformed JSON", async () => {
		const body = "{not json";
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON payload");
	});

	test("responds to PING with PONG", async () => {
		const body = JSON.stringify({ type: 1 });
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as { type: number };
		expect(json.type).toBe(1);
	});

	test("acks with 200 for an unknown guild", async () => {
		connectionRows = [
			{
				id: "conn-1",
				organizationId: "org-1",
				config: { provider: "discord", guildId: "other-guild" },
			},
		];
		const body = JSON.stringify({
			type: 2,
			guild_id: "unknown-guild",
			data: { name: "ask" },
		});
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	function commandBody(
		overrides: Record<string, unknown> = {},
	): Record<string, unknown> {
		return {
			id: "interaction-1",
			type: 2,
			token: "tok-1",
			application_id: "app-1",
			guild_id: "guild-123",
			channel_id: "channel-456",
			member: { user: { id: "user-789" } },
			data: { name: "ask", options: [{ name: "prompt", value: "hi" }] },
			...overrides,
		};
	}

	test("defers and enqueues a dispatch job for a matched application command", async () => {
		connectionRows = [
			{
				id: "conn-1",
				organizationId: "org-1",
				config: { provider: "discord", guildId: "guild-123" },
			},
		];
		const body = JSON.stringify(commandBody());
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as { type: number };
		// InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
		expect(json.type).toBe(5);

		// Dedup row inserted, then the job enqueued with the follow-up fields.
		expect(insertReturningMock).toHaveBeenCalledTimes(1);
		expect(publishJSONMock).toHaveBeenCalledTimes(1);
		const publishArg = publishJSONMock.mock.calls[0]?.[0] as {
			url: string;
			body: {
				connectionId: string;
				interaction: {
					id: string;
					token: string;
					applicationId: string;
					text: string;
				};
			};
		};
		expect(publishArg.url).toContain(
			"/api/integrations/discord/jobs/process-interaction",
		);
		expect(publishArg.body.connectionId).toBe("conn-1");
		expect(publishArg.body.interaction).toEqual({
			id: "interaction-1",
			token: "tok-1",
			applicationId: "app-1",
			text: "hi",
		});
	});

	test("is idempotent: a duplicate redelivery defers without re-enqueuing", async () => {
		connectionRows = [
			{
				id: "conn-1",
				organizationId: "org-1",
				config: { provider: "discord", guildId: "guild-123" },
			},
		];
		// onConflictDoNothing returned no row -> already-seen interaction.
		insertedEventRow = null;

		const body = JSON.stringify(commandBody());
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		expect(response.status).toBe(200);
		expect(((await response.json()) as { type: number }).type).toBe(5);
		expect(insertReturningMock).toHaveBeenCalledTimes(1);
		// Critical: the agent job is NOT enqueued a second time.
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("rolls back the dedup row when enqueue fails, still deferring", async () => {
		connectionRows = [
			{
				id: "conn-1",
				organizationId: "org-1",
				config: { provider: "discord", guildId: "guild-123" },
			},
		];
		publishJSONMock.mockImplementation(async () => {
			throw new Error("qstash down");
		});

		const body = JSON.stringify(commandBody());
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		// User still sees a deferred ack (3s contract honored) ...
		expect(response.status).toBe(200);
		expect(((await response.json()) as { type: number }).type).toBe(5);
		// ... and the dedup row is rolled back so Discord's retry can re-enqueue.
		expect(deleteWhereMock).toHaveBeenCalledTimes(1);
	});

	test("falls back to config.applicationId when the payload omits application_id", async () => {
		connectionRows = [
			{
				id: "conn-1",
				organizationId: "org-1",
				config: {
					provider: "discord",
					guildId: "guild-123",
					applicationId: "config-app",
				},
			},
		];
		const body = JSON.stringify(commandBody({ application_id: undefined }));
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		expect(response.status).toBe(200);
		expect(publishJSONMock).toHaveBeenCalledTimes(1);
		const publishArg = publishJSONMock.mock.calls[0]?.[0] as {
			body: { interaction: { applicationId: string } };
		};
		expect(publishArg.body.interaction.applicationId).toBe("config-app");
	});

	test("defers without enqueuing when the command has no prompt text", async () => {
		connectionRows = [
			{
				id: "conn-1",
				organizationId: "org-1",
				config: { provider: "discord", guildId: "guild-123" },
			},
		];
		// No options -> parsed text is null.
		const body = JSON.stringify(commandBody({ data: { name: "ask" } }));
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		expect(response.status).toBe(200);
		expect(((await response.json()) as { type: number }).type).toBe(5);
		expect(insertReturningMock).not.toHaveBeenCalled();
		expect(publishJSONMock).not.toHaveBeenCalled();
	});
});
