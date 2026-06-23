import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_CURRENT_SIGNING_KEY: "current",
		QSTASH_NEXT_SIGNING_KEY: "next",
		QSTASH_TOKEN: "token",
		QSTASH_URL: "http://localhost",
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

// QStash publish: tests flip the implementation to drive the all-failed branch.
let publishImpl: () => Promise<unknown> = async () => ({ messageId: "m1" });
const publishJSONMock = mock(() => publishImpl());
const batchJSONNoop = mock(async () => []);
// Expose both publishJSON and batchJSON so the process-global Client mock also
// satisfies sibling routes (automations/evaluate uses batchJSON) when the whole
// api suite runs in one bun process.
mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = publishJSONMock;
		batchJSON = batchJSONNoop;
	},
}));

// selectDistinct chain returns the activity rows the route fans out over.
let activityRows: Array<{ organizationId: string; createdBy: string }> = [];
const selectDistinctMock = mock(() => ({
	from: () => ({
		where: async () => activityRows,
	}),
}));
// Both `db` and `dbWs` names are exported so the process-global module mock
// still link-satisfies sibling routes (e.g. automations/evaluate imports
// `dbWs`) when the whole api suite runs in one bun process.
mock.module("@rox/db/client", () => ({
	db: { selectDistinct: selectDistinctMock },
	dbWs: { selectDistinct: selectDistinctMock },
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

const { POST } = await import("./route");

function buildRequest(body: unknown) {
	const json = typeof body === "string" ? body : JSON.stringify(body);
	verified = { ok: true, body: json };
	return new Request("http://localhost/api/journal/generate", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: json,
	});
}

describe("journal/generate route", () => {
	beforeEach(() => {
		verified = { ok: true, body: "{}" };
		verifyQstashMock.mockClear();
		publishJSONMock.mockClear();
		selectDistinctMock.mockClear();
		publishImpl = async () => ({ messageId: "m1" });
		activityRows = [];
	});

	test("returns the verifier's 401 response when verification fails", async () => {
		verified = {
			ok: false,
			response: Response.json({ error: "Invalid signature" }, { status: 401 }),
		};
		const request = new Request("http://localhost/api/journal/generate", {
			method: "POST",
			body: "{}",
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(selectDistinctMock).not.toHaveBeenCalled();
	});

	test("enqueues one job per active (org, user) row", async () => {
		activityRows = [
			{ organizationId: "org-1", createdBy: "user-1" },
			{ organizationId: "org-1", createdBy: "user-2" },
		];

		const response = await POST(buildRequest({ day: "2026-06-19" }));

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			day: string;
			queued: number;
			failed: number;
		};
		expect(json.day).toBe("2026-06-19");
		expect(json.queued).toBe(2);
		expect(json.failed).toBe(0);
		expect(publishJSONMock).toHaveBeenCalledTimes(2);
	});

	test("returns queued:0 when there is no activity", async () => {
		const response = await POST(buildRequest({ day: "2026-06-19" }));

		expect(response.status).toBe(200);
		const json = (await response.json()) as { queued: number };
		expect(json.queued).toBe(0);
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("returns 500 when every enqueue fails", async () => {
		activityRows = [{ organizationId: "org-1", createdBy: "user-1" }];
		publishImpl = async () => {
			throw new Error("qstash down");
		};

		const response = await POST(buildRequest({ day: "2026-06-19" }));

		expect(response.status).toBe(500);
		const json = (await response.json()) as { error: string; failed: number };
		expect(json.error).toBe("Failed to enqueue journal generation jobs");
		expect(json.failed).toBe(1);
	});
});
