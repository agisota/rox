import { beforeEach, describe, expect, mock, test } from "bun:test";

const SIGNATURE_HEADER = "linear-signature";

// parseData is the route's verification + decode step. We mock the whole
// @linear/sdk/webhooks subpath (preferred over reaching into the raw SDK) so
// the signature gate and decoded payload are fully controllable. A throw models
// a bad signature; a returned object models a verified payload.
let parseDataImpl: (body: Buffer, signature: string) => unknown = () => ({});
const parseDataMock = mock((body: Buffer, signature: string) =>
	parseDataImpl(body, signature),
);

mock.module("@linear/sdk/webhooks", () => ({
	LINEAR_WEBHOOK_SIGNATURE_HEADER: SIGNATURE_HEADER,
	LinearWebhookClient: class {
		parseData = parseDataMock;
	},
}));

mock.module("@/env", () => ({
	env: { LINEAR_WEBHOOK_SECRET: "test-linear-secret" },
}));

mock.module("@rox/trpc/integrations/linear", () => ({
	mapPriorityFromLinear: mock((p: number) => p),
}));

// Configurable db state to drive the route's branches.
let connectionsResult: Array<Record<string, unknown>> = [];
let taskStatusResult: Record<string, unknown> | undefined;
let webhookInsertReturning: Array<Record<string, unknown>> = [
	{ id: "evt-1", status: "pending", retryCount: 0 },
];
let taskInsertCalls = 0;
let webhookUpdateSets: Array<Record<string, unknown>> = [];

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findMany: mock(async () => connectionsResult),
			},
			taskStatuses: {
				findFirst: mock(async () => taskStatusResult),
			},
		},
		insert: mock((table: { __name?: string }) => ({
			values: mock(() => {
				if (table.__name === "tasks") taskInsertCalls += 1;
				return {
					onConflictDoUpdate: mock(() => ({
						returning: mock(async () =>
							table.__name === "webhookEvents" ? webhookInsertReturning : [],
						),
					})),
				};
			}),
		})),
		update: mock(() => ({
			set: mock((set: Record<string, unknown>) => {
				webhookUpdateSets.push(set);
				return { where: mock(async () => {}) };
			}),
		})),
	},
}));

// The route only references table objects inside drizzle expressions. We tag
// each with __name so the db mock can distinguish webhookEvents vs tasks.
mock.module("@rox/db/schema", () => ({
	integrationConnections: {
		externalOrgId: "externalOrgId",
		provider: "provider",
		disconnectedAt: "disconnectedAt",
		id: "id",
	},
	webhookEvents: {
		__name: "webhookEvents",
		id: "id",
		provider: "provider",
		eventId: "eventId",
		status: "status",
		retryCount: "retryCount",
		error: "error",
	},
	tasks: {
		__name: "tasks",
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

function buildRequest(signature: string | null, body: string): Request {
	const headers = new Headers();
	if (signature !== null) headers.set(SIGNATURE_HEADER, signature);
	return new Request("http://localhost/api/integrations/linear/webhook", {
		method: "POST",
		headers,
		body,
	});
}

function validIssuePayload() {
	return {
		type: "Issue",
		action: "create",
		organizationId: "org-ext-1",
		webhookTimestamp: 1700000000,
		data: {
			id: "issue-1",
			identifier: "ROX-1",
			title: "Fix the thing",
			url: "https://linear.app/rox/issue/ROX-1",
			createdAt: "2024-01-01T00:00:00.000Z",
			priority: 2,
			state: { id: "state-1" },
			labels: [],
		},
	};
}

const MATCHING_CONNECTION = {
	id: "conn-1",
	organizationId: "org-1",
	connectedByUserId: "user-1",
};

describe("linear webhook route", () => {
	beforeEach(() => {
		connectionsResult = [];
		taskStatusResult = undefined;
		webhookInsertReturning = [
			{ id: "evt-1", status: "pending", retryCount: 0 },
		];
		taskInsertCalls = 0;
		webhookUpdateSets = [];
		parseDataMock.mockClear();
		parseDataImpl = () => validIssuePayload();
	});

	test("returns 401 when the signature header is missing", async () => {
		const response = await POST(
			buildRequest(null, JSON.stringify(validIssuePayload())),
		);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Missing signature" });
		expect(parseDataMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the verified payload has no event type", async () => {
		parseDataImpl = () => ({
			type: undefined,
			organizationId: "org-ext-1",
		});
		const response = await POST(buildRequest("sig", "{}"));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Missing event type" });
		expect(parseDataMock).toHaveBeenCalledTimes(1);
	});

	test("returns 200 no_subscribers when no active connections match", async () => {
		connectionsResult = [];
		const response = await POST(buildRequest("sig", "{}"));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			status: "no_subscribers",
		});
	});

	test("skips an Issue payload that fails zod validation but still acks", async () => {
		connectionsResult = [MATCHING_CONNECTION];
		// Missing required fields (identifier, title, url, ...) -> schema fails ->
		// outcome "skipped", overall request still succeeds (200).
		parseDataImpl = () => ({
			type: "Issue",
			action: "create",
			organizationId: "org-ext-1",
			webhookTimestamp: 1700000000,
			data: { id: "issue-1" },
		});
		const response = await POST(buildRequest("sig", "{}"));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			status: "processed",
		});
		// Reached processing, but never wrote a task row.
		expect(taskInsertCalls).toBe(0);
		expect(webhookUpdateSets.at(-1)).toMatchObject({ status: "skipped" });
	});

	test("processes a valid Issue payload and upserts the task", async () => {
		connectionsResult = [MATCHING_CONNECTION];
		taskStatusResult = { id: "status-1" };

		const response = await POST(
			buildRequest("sig", JSON.stringify(validIssuePayload())),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			status: "processed",
		});

		// Happy path reached the handler: matched a task status and wrote a task.
		expect(taskInsertCalls).toBe(1);
		expect(webhookUpdateSets.at(-1)).toMatchObject({ status: "processed" });
	});
});
