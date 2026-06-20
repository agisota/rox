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
	config: { provider: "discord"; guildId?: string } | null;
}> = [];

// The route captures the `env` binding once at import, then reads
// `env.DISCORD_PUBLIC_KEY` per request. Make the property a getter on one stable
// object so toggling `publicKeyHex` between tests is observed at call time.
const envMock = {
	get DISCORD_PUBLIC_KEY() {
		return publicKeyHex;
	},
};
mock.module("@/env", () => ({ env: envMock }));

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findMany: async () => connectionRows,
			},
		},
	},
}));

mock.module("@rox/db/schema", () => ({
	integrationConnections: {
		provider: "provider",
		disconnectedAt: "disconnectedAt",
	},
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

	test("returns a deferred ack for a matched application command", async () => {
		connectionRows = [
			{
				id: "conn-1",
				organizationId: "org-1",
				config: { provider: "discord", guildId: "guild-123" },
			},
		];
		const body = JSON.stringify({
			type: 2,
			guild_id: "guild-123",
			channel_id: "channel-456",
			member: { user: { id: "user-789" } },
			data: { name: "ask", options: [{ name: "prompt", value: "hi" }] },
		});
		const response = await POST(
			makeRequest(body, signedHeaders(TIMESTAMP, body)),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as { type: number };
		// InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
		expect(json.type).toBe(5);
	});
});
