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

// Connection lookup is the first DB hop. Tests flip this to drive the
// connection-missing / disconnected / happy branches.
let connectionRow:
	| { accessToken: string; disconnectedAt: Date | null }
	| undefined = {
	accessToken: "encoded-token",
	disconnectedAt: null,
};

const insertValues = mock(() => ({
	onConflictDoUpdate: mock(async () => undefined),
}));
const insertMock = mock(() => ({ values: insertValues }));

mock.module("@rox/db", () => ({
	db: {
		query: {
			integrationConnections: {
				findFirst: async () => connectionRow,
			},
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

// Notion client: search returns the page list; happy path keeps it empty so we
// hit the "imported: 0" branch without exercising block traversal.
const searchMock = mock(async () => ({
	results: [],
	has_more: false,
	next_cursor: null,
}));
const listBlockChildrenMock = mock(async () => ({
	results: [],
	has_more: false,
	next_cursor: null,
}));
mock.module("../../notion-client", () => ({
	search: searchMock,
	listBlockChildren: listBlockChildrenMock,
}));

const mapNotionPagesMock = mock(() => []);
mock.module("../../sync", () => ({
	mapNotionPages: mapNotionPagesMock,
	renderNotionBlocksToMarkdown: () => "",
}));

const { POST } = await import("./route");

const VALID_PAYLOAD = { organizationId: "org-1" };

function buildRequest(body: unknown) {
	const json = typeof body === "string" ? body : JSON.stringify(body);
	verified = { ok: true, body: json };
	return new Request("http://localhost/api/integrations/notion/jobs/sync", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: json,
	});
}

describe("notion/jobs/sync route", () => {
	beforeEach(() => {
		verified = { ok: true, body: JSON.stringify(VALID_PAYLOAD) };
		verifyQstashMock.mockClear();
		searchMock.mockClear();
		decodeSecretMock.mockClear();
		insertMock.mockClear();
		mapNotionPagesMock.mockClear();
		connectionRow = { accessToken: "encoded-token", disconnectedAt: null };
	});

	test("returns the verifier's 401 response when verification fails", async () => {
		verified = {
			ok: false,
			response: Response.json({ error: "Invalid signature" }, { status: 401 }),
		};
		const request = new Request(
			"http://localhost/api/integrations/notion/jobs/sync",
			{ method: "POST", body: "{}" },
		);

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(searchMock).not.toHaveBeenCalled();
	});

	test("returns 400 when the JSON body is malformed", async () => {
		const response = await POST(buildRequest("{not json"));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON");
	});

	test("returns 400 when the payload fails zod validation", async () => {
		const response = await POST(buildRequest({ organizationId: "" }));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid payload");
		expect(searchMock).not.toHaveBeenCalled();
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
		expect(searchMock).not.toHaveBeenCalled();
	});

	test("skips (success) when the connection is disconnected", async () => {
		connectionRow = {
			accessToken: "encoded-token",
			disconnectedAt: new Date(),
		};

		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		const json = (await response.json()) as { skipped: boolean };
		expect(json.skipped).toBe(true);
	});

	test("decodes the token and paginates Notion search on the happy path", async () => {
		const response = await POST(buildRequest(VALID_PAYLOAD));

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			success: boolean;
			imported: number;
		};
		expect(json.success).toBe(true);
		expect(json.imported).toBe(0);
		expect(decodeSecretMock).toHaveBeenCalledTimes(1);
		expect(searchMock).toHaveBeenCalledTimes(1);
	});
});
