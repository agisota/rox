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

const batchJSONMock = mock(async () => [{ messageId: "m1" }]);
const publishJSONNoop = mock(async () => ({ messageId: "noop" }));
// Expose both batchJSON and publishJSON so the process-global Client mock also
// satisfies sibling routes (journal/generate uses publishJSON) when the whole
// api suite runs in one bun process.
mock.module("@upstash/qstash", () => ({
	Client: class {
		batchJSON = batchJSONMock;
		publishJSON = publishJSONNoop;
	},
}));

// Due automations the select chain returns. Tests flip this to drive the
// empty-batch vs. enqueue branches.
let dueRows: Array<{
	id: string;
	nextRunAt: Date;
	rrule: string;
	dtstart: Date;
	timezone: string;
}> = [];
const limitMock = mock(async () => dueRows);
const updateSetWhere = mock(async () => undefined);
const updateSet = mock(() => ({ where: updateSetWhere }));
const dbWsMock = {
	select: () => ({
		from: () => ({
			where: () => ({
				orderBy: () => ({ limit: limitMock }),
			}),
		}),
	}),
	update: () => ({ set: updateSet }),
};
// Both `db` and `dbWs` names are exported so the process-global module mock
// still link-satisfies sibling routes (which import `db`) when the whole api
// suite runs in one bun process.
mock.module("@rox/db/client", () => ({
	db: dbWsMock,
	dbWs: dbWsMock,
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

// rrule advance: tests control whether a next occurrence exists (advance) or not
// (disable). Default returns a fixed future date.
let nextOccurrence: Date | null = new Date("2026-06-21T00:00:00.000Z");
const nextOccurrenceMock = mock(() => nextOccurrence);
mock.module("@rox/shared/rrule", () => ({
	nextOccurrenceAfter: nextOccurrenceMock,
}));

const { POST } = await import("./route");

function buildRequest(body: unknown = {}) {
	const json = typeof body === "string" ? body : JSON.stringify(body);
	verified = { ok: true, body: json };
	return new Request("http://localhost/api/automations/evaluate", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: json,
	});
}

function dueRow(id: string) {
	return {
		id,
		nextRunAt: new Date("2026-06-20T00:00:00.000Z"),
		rrule: "FREQ=DAILY",
		dtstart: new Date("2026-06-01T00:00:00.000Z"),
		timezone: "UTC",
	};
}

describe("automations/evaluate route", () => {
	beforeEach(() => {
		verified = { ok: true, body: "{}" };
		verifyQstashMock.mockClear();
		batchJSONMock.mockClear();
		limitMock.mockClear();
		updateSet.mockClear();
		nextOccurrenceMock.mockClear();
		dueRows = [];
		nextOccurrence = new Date("2026-06-21T00:00:00.000Z");
	});

	test("returns the verifier's 401 response when verification fails", async () => {
		verified = {
			ok: false,
			response: Response.json({ error: "Invalid signature" }, { status: 401 }),
		};
		const request = new Request("http://localhost/api/automations/evaluate", {
			method: "POST",
			body: "{}",
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(limitMock).not.toHaveBeenCalled();
	});

	test("returns enqueued:0 when no automations are due", async () => {
		const response = await POST(buildRequest());

		expect(response.status).toBe(200);
		const json = (await response.json()) as { enqueued: number };
		expect(json.enqueued).toBe(0);
		expect(batchJSONMock).not.toHaveBeenCalled();
	});

	test("batch-enqueues due automations and advances their next run", async () => {
		dueRows = [dueRow("auto-1"), dueRow("auto-2")];

		const response = await POST(buildRequest());

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			enqueued: number;
			advanceFailed: number;
		};
		expect(json.enqueued).toBe(2);
		expect(json.advanceFailed).toBe(0);
		expect(batchJSONMock).toHaveBeenCalledTimes(1);
		// One advance update per due automation.
		expect(updateSet).toHaveBeenCalledTimes(2);
	});

	test("disables an automation when there is no next occurrence", async () => {
		dueRows = [dueRow("auto-1")];
		nextOccurrence = null;

		const response = await POST(buildRequest());

		expect(response.status).toBe(200);
		const json = (await response.json()) as { enqueued: number };
		expect(json.enqueued).toBe(1);
		expect(updateSet).toHaveBeenCalledWith({ enabled: false });
	});
});
