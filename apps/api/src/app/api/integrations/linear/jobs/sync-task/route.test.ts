import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_CURRENT_SIGNING_KEY: "current",
		QSTASH_NEXT_SIGNING_KEY: "next",
		NEXT_PUBLIC_API_URL: "http://localhost",
		NODE_ENV: "test",
	},
}));

let verified: { ok: true; body: string } | { ok: false; response: Response } = {
	ok: true,
	body: "",
};
const verifyQstashMock = mock(async () => verified);
mock.module("@/lib/qstash-verify", () => ({
	verifyQstash: verifyQstashMock,
}));

// tasks lookup is the first DB hop after parsing. Tests flip this to drive the
// not-found-skip vs. resolved-task branches.
let taskRow:
	| {
			id: string;
			organizationId: string;
			externalProvider: string | null;
			externalId: string | null;
	  }
	| undefined;
let connectionRow: { config: { newTasksTeamId?: string } | null } | undefined;
const tasksUpdateSet = mock(() => ({ where: async () => undefined }));
const dbMock = {
	query: {
		tasks: { findFirst: async () => taskRow },
		integrationConnections: { findFirst: async () => connectionRow },
	},
	update: () => ({ set: tasksUpdateSet }),
};
// Both `db` and `dbWs` names are exported so the process-global module mock
// still link-satisfies sibling routes (e.g. automations/evaluate imports
// `dbWs`) when the whole api suite runs in one bun process.
mock.module("@rox/db/client", () => ({
	db: dbMock,
	dbWs: dbMock,
}));

// Superset of every schema symbol the sibling journal/automations/linear route
// tests reference, so this process-global mock is order-independent when the
// whole api suite runs in one bun process.
mock.module("@rox/db/schema", () => ({
	automations: { id: "id", enabled: "enabled", nextRunAt: "nextRunAt" },
	chatSessions: {
		organizationId: "organizationId",
		createdBy: "createdBy",
		lastActiveAt: "lastActiveAt",
	},
	integrationConnections: {
		organizationId: "organizationId",
		provider: "provider",
	},
	members: { userId: "userId", organizationId: "organizationId" },
	taskStatuses: { id: "id" },
	tasks: { id: "id" },
	users: { id: "id", email: "email" },
}));

// Linear service: default returns null client so syncTaskToLinear short-circuits
// to "No Linear connection found" without exercising the SDK.
let linearClient: unknown = null;
const getLinearClientMock = mock(async () => linearClient);
mock.module("@rox/trpc/integrations/linear", () => ({
	getLinearClient: getLinearClientMock,
	mapPriorityToLinear: () => undefined,
}));

const { POST } = await import("./route");

const VALID_PAYLOAD = { taskId: "task-1" };

function buildRequest(body: unknown) {
	const json = typeof body === "string" ? body : JSON.stringify(body);
	verified = { ok: true, body: json };
	return new Request(
		"http://localhost/api/integrations/linear/jobs/sync-task",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: json,
		},
	);
}

describe("integrations/linear/jobs/sync-task route", () => {
	beforeEach(() => {
		verified = { ok: true, body: JSON.stringify(VALID_PAYLOAD) };
		verifyQstashMock.mockClear();
		getLinearClientMock.mockClear();
		taskRow = undefined;
		connectionRow = undefined;
		linearClient = null;
	});

	test("returns the verifier's 401 response when verification fails", async () => {
		verified = {
			ok: false,
			response: Response.json(
				{ error: "Signature verification failed" },
				{ status: 401 },
			),
		};
		const request = new Request(
			"http://localhost/api/integrations/linear/jobs/sync-task",
			{ method: "POST", body: "{}" },
		);

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(getLinearClientMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the payload fails zod validation", async () => {
		const response = await POST(buildRequest({ taskId: "" }));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid payload");
		expect(getLinearClientMock).not.toHaveBeenCalled();
	});

	test("returns task-not-found skip when no task matches", async () => {
		taskRow = undefined;

		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			error: string;
			skipped: boolean;
		};
		expect(json.error).toBe("Task not found");
		expect(json.skipped).toBe(true);
		expect(getLinearClientMock).not.toHaveBeenCalled();
	});

	test("returns 500 when no Linear connection is found for the task", async () => {
		taskRow = {
			id: "task-1",
			organizationId: "org-1",
			externalProvider: null,
			externalId: null,
		};
		connectionRow = undefined;
		linearClient = null;

		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(500);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("No Linear connection found");
		expect(getLinearClientMock).toHaveBeenCalledTimes(1);
	});
});
