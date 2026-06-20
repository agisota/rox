import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock the verify/receive webhook client (prefer mocking this helper over the
// raw @octokit/webhooks SDK) so the route's signature gate and dispatch are
// fully controllable without touching real crypto or network.
const verifyMock = mock(async (_body: string, _signature: string) => true);
const receiveMock = mock(async (_event: unknown) => {});

mock.module("./webhooks", () => ({
	webhooks: {
		verify: verifyMock,
		receive: receiveMock,
	},
}));

// Capture what the route writes to webhookEvents and let tests configure the
// row returned by .returning() to drive idempotency branches.
let insertValues: Array<Record<string, unknown>> = [];
let updateSets: Array<Record<string, unknown>> = [];
let insertReturningResult: Array<Record<string, unknown>> = [
	{ id: "evt-1", status: "pending", retryCount: 0 },
];

mock.module("@rox/db/client", () => ({
	db: {
		insert: mock(() => ({
			values: mock((values: Record<string, unknown>) => {
				insertValues.push(values);
				return {
					onConflictDoUpdate: mock(() => ({
						returning: mock(async () => insertReturningResult),
					})),
				};
			}),
		})),
		update: mock(() => ({
			set: mock((set: Record<string, unknown>) => {
				updateSets.push(set);
				return {
					where: mock(async () => {}),
				};
			}),
		})),
	},
}));

// The route only references `webhookEvents` columns inside drizzle eq()/sql``
// expressions; plain stubs satisfy the import. We also export the tables the
// sibling linear webhook test needs because bun's mock.module registry is
// process-global — exporting the full union keeps named imports resolvable
// whichever file's mock wins when the package test suite runs both together.
mock.module("@rox/db/schema", () => ({
	webhookEvents: {
		id: "id",
		provider: "provider",
		eventId: "eventId",
		status: "status",
		retryCount: "retryCount",
		error: "error",
	},
	integrationConnections: {
		externalOrgId: "externalOrgId",
		provider: "provider",
		disconnectedAt: "disconnectedAt",
		id: "id",
	},
	tasks: {
		organizationId: "organizationId",
		externalProvider: "externalProvider",
		externalId: "externalId",
	},
	taskStatuses: {
		organizationId: "organizationId",
		externalProvider: "externalProvider",
		externalId: "externalId",
		id: "id",
	},
	members: { userId: "userId", organizationId: "organizationId" },
	users: { id: "id", email: "email" },
}));

const { POST } = await import("./route");

function buildRequest(
	headers: Record<string, string | null>,
	body: string,
): Request {
	const h = new Headers();
	for (const [k, v] of Object.entries(headers)) {
		if (v !== null) h.set(k, v);
	}
	return new Request("http://localhost/api/github/webhook", {
		method: "POST",
		headers: h,
		body,
	});
}

const VALID_BODY = JSON.stringify({
	action: "deleted",
	installation: { id: 1 },
});

function validHeaders(): Record<string, string> {
	return {
		"x-hub-signature-256": "sha256=deadbeef",
		"x-github-event": "installation",
		"x-github-delivery": "delivery-1",
	};
}

describe("github webhook route", () => {
	beforeEach(() => {
		insertValues = [];
		updateSets = [];
		insertReturningResult = [{ id: "evt-1", status: "pending", retryCount: 0 }];
		verifyMock.mockClear();
		verifyMock.mockImplementation(async () => true);
		receiveMock.mockClear();
		receiveMock.mockImplementation(async () => {});
	});

	test("returns 400 when x-github-event header is missing", async () => {
		const { "x-github-event": _omit, ...headers } = validHeaders();
		const response = await POST(buildRequest(headers, VALID_BODY));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Missing event type" });
		expect(verifyMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the body is not valid JSON", async () => {
		const response = await POST(buildRequest(validHeaders(), "not-json{"));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid JSON payload" });
		expect(verifyMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the payload is not a JSON object", async () => {
		const response = await POST(buildRequest(validHeaders(), '"a string"'));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid payload" });
		expect(verifyMock).not.toHaveBeenCalled();
	});

	test("returns 401 when signature verification fails", async () => {
		verifyMock.mockImplementation(async () => {
			throw new Error("bad signature");
		});
		const response = await POST(buildRequest(validHeaders(), VALID_BODY));
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Invalid signature" });
		expect(receiveMock).not.toHaveBeenCalled();
	});

	test("verifies, stores, dispatches the event and returns success", async () => {
		const response = await POST(buildRequest(validHeaders(), VALID_BODY));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });

		// Signature verified against the raw body + header.
		expect(verifyMock).toHaveBeenCalledTimes(1);
		expect(verifyMock.mock.calls[0]?.[0]).toBe(VALID_BODY);
		expect(verifyMock.mock.calls[0]?.[1]).toBe("sha256=deadbeef");

		// Event stored with the verified payload and delivery id.
		expect(insertValues).toHaveLength(1);
		expect(insertValues[0]).toMatchObject({
			provider: "github",
			eventId: "delivery-1",
			eventType: "installation",
			status: "pending",
		});

		// Handler dispatched and the row marked processed.
		expect(receiveMock).toHaveBeenCalledTimes(1);
		expect(receiveMock.mock.calls[0]?.[0]).toMatchObject({
			id: "delivery-1",
			name: "installation",
		});
		expect(updateSets.at(-1)).toMatchObject({ status: "processed" });
	});

	test("is idempotent: returns success without re-dispatching when already processed", async () => {
		insertReturningResult = [
			{ id: "evt-1", status: "processed", retryCount: 0 },
		];
		const response = await POST(buildRequest(validHeaders(), VALID_BODY));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			message: "Already processed",
		});
		expect(receiveMock).not.toHaveBeenCalled();
	});

	test("returns 500 and marks the event failed when dispatch throws", async () => {
		receiveMock.mockImplementation(async () => {
			throw new Error("handler boom");
		});
		const response = await POST(buildRequest(validHeaders(), VALID_BODY));
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: "Webhook processing failed",
		});
		expect(updateSets.at(-1)).toMatchObject({
			status: "failed",
			error: "handler boom",
		});
	});
});
