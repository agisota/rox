import { describe, expect, mock, test } from "bun:test";

type LarkConnectionRow = {
	id: string;
	organizationId: string;
	config: { provider: "lark"; appId?: string; verificationToken?: string };
};

// Mutable fixture the mocked db reads from; each test sets it before calling POST.
let connections: LarkConnectionRow[] = [];

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findMany: mock(async () => connections),
			},
		},
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

	test("valid message event returns 200", async () => {
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
					content: JSON.stringify({ text: "hello rox" }),
				},
				sender: { sender_id: { open_id: "ou_1" }, sender_type: "user" },
			},
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
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
	});

	test("malformed JSON returns 400", async () => {
		setConnections([larkConnection()]);

		const response = await post("{not valid json");

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON payload");
	});
});
