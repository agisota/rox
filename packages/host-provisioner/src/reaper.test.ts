import { describe, expect, it } from "bun:test";
import { type ReapableHost, selectExpiredHosts } from "./reaper";

const now = new Date("2026-06-16T12:00:00.000Z");

function host(over: Partial<ReapableHost> & { id: string }): ReapableHost {
	return { provider: "e2b", expiresAt: null, ...over };
}

describe("selectExpiredHosts", () => {
	it("keeps persistent hosts (null expiresAt) live", () => {
		const { expired, live } = selectExpiredHosts(
			[host({ id: "a", expiresAt: null })],
			now,
		);
		expect(expired).toHaveLength(0);
		expect(live.map((h) => h.id)).toEqual(["a"]);
	});

	it("reaps a sandbox whose expiresAt is at or before now", () => {
		const { expired, live } = selectExpiredHosts(
			[
				host({ id: "past", expiresAt: "2026-06-16T11:00:00.000Z" }),
				host({ id: "exact", expiresAt: now.toISOString() }),
			],
			now,
		);
		expect(expired.map((h) => h.id).sort()).toEqual(["exact", "past"]);
		expect(live).toHaveLength(0);
	});

	it("keeps a sandbox that has not yet expired live", () => {
		const { expired, live } = selectExpiredHosts(
			[host({ id: "future", expiresAt: "2026-06-16T13:00:00.000Z" })],
			now,
		);
		expect(expired).toHaveLength(0);
		expect(live.map((h) => h.id)).toEqual(["future"]);
	});

	it("accepts a Date expiresAt as well as an ISO string", () => {
		const { expired } = selectExpiredHosts(
			[host({ id: "d", expiresAt: new Date("2026-06-16T11:59:59.000Z") })],
			now,
		);
		expect(expired.map((h) => h.id)).toEqual(["d"]);
	});

	it("keeps a host with an unparseable expiresAt live (never destructive on bad data)", () => {
		const { expired, live } = selectExpiredHosts(
			[host({ id: "bad", expiresAt: "not-a-date" })],
			now,
		);
		expect(expired).toHaveLength(0);
		expect(live.map((h) => h.id)).toEqual(["bad"]);
	});
});
