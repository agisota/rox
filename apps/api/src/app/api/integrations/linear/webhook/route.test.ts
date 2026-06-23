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
	env: {
		LINEAR_WEBHOOK_SECRET: "test-linear-secret",
		QSTASH_TOKEN: "test-qstash-token",
		NEXT_PUBLIC_API_URL: "http://localhost",
	},
}));

// SUPER-237: the route lazily resolves a Linear client and runs the existing
// syncWorkflowStates on unknown states. Tests flip `linearClient` to model a
// live vs. missing connection and assert syncWorkflowStates fires.
let linearClient: unknown = null;
const getLinearClientMock = mock(async () => linearClient);
const syncWorkflowStatesMock = mock(async () => {});
mock.module("@rox/trpc/integrations/linear", () => ({
	mapPriorityFromLinear: mock((p: number) => p),
	getLinearClient: getLinearClientMock,
}));

// Mock the on-demand workflow-state sync (reused from the initial-sync job) so
// the unit test stays DB-free; behavior is asserted via call count + the queued
// taskStatuses result that follows a sync.
mock.module("../jobs/initial-sync/syncWorkflowStates", () => ({
	syncWorkflowStates: syncWorkflowStatesMock,
}));

// Fallback enqueue path. We assert publishJSON fires on the hard-fail branch and
// that an enqueue failure does not mask the original unresolved-state failure.
let qstashPublishImpl: () => Promise<unknown> = async () => ({});
const qstashPublishMock = mock(() => qstashPublishImpl());
mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = qstashPublishMock;
	},
}));

// Configurable db state to drive the route's branches.
let connectionsResult: Array<Record<string, unknown>> = [];
// taskStatuses.findFirst is called up to twice per Issue (before and after the
// SUPER-237 on-demand sync). A queue lets a test return "not found" first and a
// resolved row after sync; a non-array value is returned for every call.
let taskStatusResults: Array<Record<string, unknown> | undefined> = [];
// Drives integrationConnections.findFirst, used by the fallback enqueue path.
let connectionRow: Record<string, unknown> | undefined;
let webhookInsertReturning: Array<Record<string, unknown>> = [
	{ id: "evt-1", status: "pending", retryCount: 0 },
];
let taskInsertCalls = 0;
let taskStatusFindCalls = 0;
let webhookUpdateSets: Array<Record<string, unknown>> = [];

const taskStatusFindFirst = mock(async () => {
	const result = taskStatusResults[taskStatusFindCalls] ?? undefined;
	taskStatusFindCalls += 1;
	return result;
});

mock.module("@rox/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findMany: mock(async () => connectionsResult),
				findFirst: mock(async () => connectionRow),
			},
			taskStatuses: {
				findFirst: taskStatusFindFirst,
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
		organizationId: "organizationId",
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
		taskStatusResults = [];
		connectionRow = undefined;
		webhookInsertReturning = [
			{ id: "evt-1", status: "pending", retryCount: 0 },
		];
		taskInsertCalls = 0;
		taskStatusFindCalls = 0;
		webhookUpdateSets = [];
		linearClient = null;
		qstashPublishImpl = async () => ({});
		parseDataMock.mockClear();
		taskStatusFindFirst.mockClear();
		getLinearClientMock.mockClear();
		syncWorkflowStatesMock.mockClear();
		qstashPublishMock.mockClear();
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
		taskStatusResults = [{ id: "status-1" }];

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
		// Known state -> no on-demand sync, single lookup.
		expect(syncWorkflowStatesMock).not.toHaveBeenCalled();
		expect(taskStatusFindFirst).toHaveBeenCalledTimes(1);
	});

	// SUPER-237: an unsynced Linear workflow state must NOT be silently dropped.
	test("unsynced state: runs syncWorkflowStates then retries and applies the update", async () => {
		connectionsResult = [MATCHING_CONNECTION];
		linearClient = { marker: "linear-client" };
		// First lookup misses (state not yet imported); after the on-demand sync
		// the retry resolves it, so the task update is applied — not dropped.
		taskStatusResults = [undefined, { id: "status-after-sync" }];

		const response = await POST(
			buildRequest("sig", JSON.stringify(validIssuePayload())),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			status: "processed",
		});
		// Sync ran exactly once with the resolved client, lookup retried, and the
		// task was upserted (the previously-lost update is applied in-band).
		expect(getLinearClientMock).toHaveBeenCalledTimes(1);
		expect(syncWorkflowStatesMock).toHaveBeenCalledTimes(1);
		expect(syncWorkflowStatesMock.mock.calls[0]?.[0]).toMatchObject({
			client: linearClient,
			organizationId: "org-1",
		});
		expect(taskStatusFindFirst).toHaveBeenCalledTimes(2);
		expect(taskInsertCalls).toBe(1);
		expect(webhookUpdateSets.at(-1)).toMatchObject({ status: "processed" });
		// Resolved in-band: no durable fallback enqueue needed.
		expect(qstashPublishMock).not.toHaveBeenCalled();
	});

	// SUPER-237 hard-fail: sync cannot resolve the state -> observable failure +
	// durable enqueue, never a silent skip.
	test("unsynced state: when sync still cannot resolve, fails loud and enqueues a fallback sync", async () => {
		connectionsResult = [MATCHING_CONNECTION];
		connectionRow = { connectedByUserId: "user-1" };
		linearClient = { marker: "linear-client" };
		// Both lookups miss even after sync -> hard fail path.
		taskStatusResults = [undefined, undefined];

		const response = await POST(
			buildRequest("sig", JSON.stringify(validIssuePayload())),
		);

		// Loud failure: 500 + failed status, NOT a 200 "skipped".
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ success: false, status: "failed" });
		expect(syncWorkflowStatesMock).toHaveBeenCalledTimes(1);
		expect(taskStatusFindFirst).toHaveBeenCalledTimes(2);
		// No task written; webhookEvents row marked failed (observable + retryable).
		expect(taskInsertCalls).toBe(0);
		expect(webhookUpdateSets.at(-1)).toMatchObject({ status: "failed" });
		// Durable fallback: an initial-sync job is enqueued for the org.
		expect(qstashPublishMock).toHaveBeenCalledTimes(1);
		expect(qstashPublishMock.mock.calls[0]?.[0]).toMatchObject({
			body: { organizationId: "org-1", creatorUserId: "user-1" },
		});
	});

	// SUPER-237: with no live Linear connection we cannot sync at all; still must
	// fail loud rather than drop the update.
	test("unsynced state: no Linear client -> skips sync, still fails loud and enqueues", async () => {
		connectionsResult = [MATCHING_CONNECTION];
		connectionRow = { connectedByUserId: "user-1" };
		linearClient = null;
		taskStatusResults = [undefined];

		const response = await POST(
			buildRequest("sig", JSON.stringify(validIssuePayload())),
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ success: false, status: "failed" });
		// No client -> sync skipped, but the failure is still loud + enqueued.
		expect(syncWorkflowStatesMock).not.toHaveBeenCalled();
		expect(taskStatusFindFirst).toHaveBeenCalledTimes(1);
		expect(taskInsertCalls).toBe(0);
		expect(webhookUpdateSets.at(-1)).toMatchObject({ status: "failed" });
		expect(qstashPublishMock).toHaveBeenCalledTimes(1);
	});

	// A flaky enqueue must not crash the handler nor mask the real failure.
	test("unsynced state: a failing fallback enqueue does not mask the unresolved-state failure", async () => {
		connectionsResult = [MATCHING_CONNECTION];
		connectionRow = { connectedByUserId: "user-1" };
		linearClient = { marker: "linear-client" };
		taskStatusResults = [undefined, undefined];
		qstashPublishImpl = async () => {
			throw new Error("qstash down");
		};

		const response = await POST(
			buildRequest("sig", JSON.stringify(validIssuePayload())),
		);

		// Enqueue threw internally but was swallowed; the original unresolved-state
		// failure is still surfaced as a loud, retryable failure.
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ success: false, status: "failed" });
		expect(webhookUpdateSets.at(-1)).toMatchObject({ status: "failed" });
		expect(qstashPublishMock).toHaveBeenCalledTimes(1);
	});
});
