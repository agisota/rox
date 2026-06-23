import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Token-GATE TDD for the public ICS subscribe route. We mock ONLY `@rox/db/client`
 * (the `db` object) and drive the REAL `buildPublicCalendarFeed` + real
 * `@rox/db/schema` table objects — no shared-barrel mock. The stub routes the two
 * route selects by table name: `cal_calendars` (token lookup) returns the queued
 * calendar row, `cal_events` returns the queued events.
 */

mock.module("@/env", () => ({
	env: { NEXT_PUBLIC_API_URL: "http://localhost", NODE_ENV: "test" },
}));

type AnyRow = Record<string, unknown>;

const state: { calendarRow: AnyRow | null; events: AnyRow[] } = {
	calendarRow: null,
	events: [],
};

function tableName(table: unknown): string {
	if (!table || typeof table !== "object") return "";
	const sym = Object.getOwnPropertySymbols(table).find(
		(s) => s.description === "drizzle:Name",
	);
	return sym ? String((table as Record<symbol, unknown>)[sym]) : "";
}

// `db.select().from(table).where().limit()` — resolve rows by the queried table.
const fakeDb = {
	select: () => ({
		from(table: unknown) {
			const name = tableName(table);
			const rows: AnyRow[] =
				name === "cal_calendars"
					? state.calendarRow
						? [state.calendarRow]
						: []
					: name === "cal_events"
						? state.events
						: [];
			const make = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
				const p = Promise.resolve(rows) as Promise<AnyRow[]> &
					Record<string, () => unknown>;
				p.where = make;
				p.limit = make;
				return p;
			};
			return make();
		},
	}),
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));

const { GET } = await import("./route");

const TOKEN = "abcdefghijklmnopqrstuvwx"; // 24 chars, url-safe
const CAL = {
	id: "11111111-1111-4111-8111-111111111111",
	organizationId: "org-1",
	name: "Work",
	timezone: "UTC",
	feedToken: TOKEN,
	feedBusyOnly: false,
};
const EVENT = {
	id: "22222222-2222-4222-8222-222222222222",
	organizationId: "org-1",
	calendarId: CAL.id,
	title: "Secret standup",
	description: "Hush hush",
	location: "Room 42",
	dtstart: new Date("2026-06-20T09:00:00.000Z"),
	dtend: new Date("2026-06-20T10:00:00.000Z"),
	allDay: false,
	timezone: "UTC",
	rrule: null,
	exdates: [],
	status: "confirmed",
};

function request(token = TOKEN) {
	return new Request(`http://localhost/calendar/feed/${token}`);
}

function ctx(token = TOKEN) {
	return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
	state.calendarRow = null;
	state.events = [];
});

describe("GET /calendar/feed/[token]", () => {
	test("known active token → 200 text/calendar with a VCALENDAR (no auth header)", async () => {
		state.calendarRow = CAL;
		state.events = [EVENT];
		const res = await GET(request(), ctx());
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("text/calendar");
		const body = await res.text();
		expect(body).toContain("BEGIN:VCALENDAR");
		expect(body).toContain("SUMMARY:Secret standup");
	});

	test("unknown token → 404", async () => {
		state.calendarRow = null; // lookup miss
		const res = await GET(request(), ctx());
		expect(res.status).toBe(404);
	});

	test("revoked feed (feedToken null on row) → 404", async () => {
		state.calendarRow = { ...CAL, feedToken: null };
		const res = await GET(request(), ctx());
		expect(res.status).toBe(404);
	});

	test("malformed token shape → 404 without a DB lookup", async () => {
		const res = await GET(request("!!"), ctx("!!"));
		expect(res.status).toBe(404);
	});

	test("busyOnly variant omits event detail", async () => {
		state.calendarRow = { ...CAL, feedBusyOnly: true };
		state.events = [EVENT];
		const res = await GET(request(), ctx());
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("SUMMARY:Busy");
		expect(body).not.toContain("Secret standup");
		expect(body).not.toContain("Hush hush");
		expect(body).not.toContain("Room 42");
	});
});
