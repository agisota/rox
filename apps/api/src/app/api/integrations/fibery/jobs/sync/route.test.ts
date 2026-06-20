import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_CURRENT_SIGNING_KEY: "current",
		QSTASH_NEXT_SIGNING_KEY: "next",
		NEXT_PUBLIC_API_URL: "http://localhost",
		NODE_ENV: "test",
	},
}));

// Mock the verification helper directly so this file's verify state is isolated
// from sibling route tests sharing the same bun process.
let verified: { ok: true; body: string } | { ok: false; response: Response } = {
	ok: true,
	body: "",
};
const verifyQstashMock = mock(async () => verified);
mock.module("@/lib/qstash-verify", () => ({
	verifyQstash: verifyQstashMock,
}));

// Connection lookup + default status are the two DB hops before the upsert.
let connectionRow:
	| { accessToken: string; disconnectedAt: Date | null; config: unknown }
	| undefined = {
	accessToken: "encoded-token",
	disconnectedAt: null,
	config: { account: "acme" },
};
let statusRow: { id: string } | undefined = { id: "status-1" };

const onConflictDoUpdate = mock(async () => undefined);
const insertValues = mock(() => ({ onConflictDoUpdate }));
const insertMock = mock(() => ({ values: insertValues }));

mock.module("@rox/db", () => ({
	db: {
		query: {
			integrationConnections: { findFirst: async () => connectionRow },
			taskStatuses: { findFirst: async () => statusRow },
		},
		insert: insertMock,
	},
	buildConflictUpdateColumns: () => ({}),
}));

// Union of every schema name any sibling route test mocks, so this shared
// global registration is order-independent across files in the same process.
mock.module("@rox/db/schema", () => ({
	integrationConnections: {
		organizationId: "organizationId",
		provider: "provider",
		workspaceId: "workspaceId",
	},
	knowledgeDocuments: { organizationId: "organizationId", slug: "slug" },
	taskStatuses: { organizationId: "organizationId", position: "position" },
	tasks: {
		organizationId: "organizationId",
		externalProvider: "externalProvider",
		externalId: "externalId",
	},
}));

const decodeSecretMock = mock((value: string) => `decoded:${value}`);
mock.module("@rox/trpc/integration-secret", () => ({
	decodeSecret: decodeSecretMock,
}));

const runCommandsMock = mock(async () => [
	{ success: true, result: [{ id: "e1" }] },
]);
mock.module("../../fibery-client", () => ({
	runCommands: runCommandsMock,
}));

// mapFiberyEntities drives whether the upsert branch runs; default returns one
// mapped task so the happy path persists.
let mappedTasks: Array<{
	organizationId: string;
	externalId: string;
	title: string;
}> = [{ organizationId: "org-1", externalId: "e1", title: "Task one" }];
const mapFiberyEntitiesMock = mock(() => mappedTasks);
mock.module("../../sync", () => ({
	mapFiberyEntities: mapFiberyEntitiesMock,
}));

const { POST } = await import("./route");

const VALID_PAYLOAD = {
	organizationId: "org-1",
	creatorUserId: "user-1",
	commands: [{ command: "q", args: {} }],
};

function buildRequest(body: unknown) {
	const json = typeof body === "string" ? body : JSON.stringify(body);
	verified = { ok: true, body: json };
	return new Request("http://localhost/api/integrations/fibery/jobs/sync", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: json,
	});
}

describe("fibery/jobs/sync route", () => {
	beforeEach(() => {
		verified = { ok: true, body: JSON.stringify(VALID_PAYLOAD) };
		verifyQstashMock.mockClear();
		decodeSecretMock.mockClear();
		runCommandsMock.mockClear();
		insertMock.mockClear();
		mapFiberyEntitiesMock.mockClear();
		connectionRow = {
			accessToken: "encoded-token",
			disconnectedAt: null,
			config: { account: "acme" },
		};
		statusRow = { id: "status-1" };
		mappedTasks = [
			{ organizationId: "org-1", externalId: "e1", title: "Task one" },
		];
	});

	test("returns the verifier's 401 response when verification fails", async () => {
		verified = {
			ok: false,
			response: Response.json({ error: "Invalid signature" }, { status: 401 }),
		};
		const request = new Request(
			"http://localhost/api/integrations/fibery/jobs/sync",
			{ method: "POST", body: "{}" },
		);

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(runCommandsMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the JSON body is malformed", async () => {
		const response = await POST(buildRequest("{not json"));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON payload");
	});

	test("returns 400 when the payload fails zod validation", async () => {
		const response = await POST(buildRequest({ organizationId: "" }));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid payload");
		expect(runCommandsMock).not.toHaveBeenCalled();
	});

	test("skips (success) when there is no active connection", async () => {
		connectionRow = undefined;

		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			success: boolean;
			skipped: boolean;
		};
		expect(json.success).toBe(true);
		expect(json.skipped).toBe(true);
		expect(runCommandsMock).not.toHaveBeenCalled();
	});

	test("maps but does not upsert when the creator is missing", async () => {
		const response = await POST(
			buildRequest({
				organizationId: "org-1",
				commands: [{ command: "q", args: {} }],
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			mapped: number;
			upserted: boolean;
		};
		expect(json.mapped).toBe(1);
		expect(json.upserted).toBe(false);
		expect(insertMock).not.toHaveBeenCalled();
	});

	test("runs commands and upserts tasks on the happy path", async () => {
		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			success: boolean;
			mapped: number;
			upserted: boolean;
		};
		expect(json.success).toBe(true);
		expect(json.mapped).toBe(1);
		expect(json.upserted).toBe(true);
		expect(decodeSecretMock).toHaveBeenCalledTimes(1);
		expect(runCommandsMock).toHaveBeenCalledTimes(1);
		expect(insertMock).toHaveBeenCalledTimes(1);
	});
});
