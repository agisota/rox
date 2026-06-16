import { describe, expect, it } from "bun:test";
import {
	type ReapableHost,
	reapExpiredHosts,
	selectExpiredHosts,
} from "./reaper";

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

describe("reapExpiredHosts", () => {
	const hosts = [
		host({ id: "expired-1", expiresAt: "2026-06-16T11:00:00.000Z" }),
		host({ id: "expired-2", expiresAt: "2026-06-16T11:30:00.000Z" }),
		host({ id: "future", expiresAt: "2026-06-16T13:00:00.000Z" }),
		host({ id: "persistent", expiresAt: null }),
	];

	it("is disabled by default: reports candidates but destroys nothing", async () => {
		const destroyed: string[] = [];
		const outcome = await reapExpiredHosts({
			hosts,
			now,
			destroy: async (h) => {
				destroyed.push(h.id);
			},
		});
		expect(outcome.enabled).toBe(false);
		expect(outcome.expired.sort()).toEqual(["expired-1", "expired-2"]);
		expect(outcome.reaped).toEqual([]);
		expect(outcome.failed).toEqual([]);
		expect(outcome.kept).toBe(2);
		// The OFF flag means destroy is never invoked.
		expect(destroyed).toEqual([]);
	});

	it("destroys exactly the expired hosts when enabled", async () => {
		const destroyed: string[] = [];
		const outcome = await reapExpiredHosts({
			hosts,
			now,
			enabled: true,
			destroy: async (h) => {
				destroyed.push(h.id);
			},
		});
		expect(outcome.enabled).toBe(true);
		expect(outcome.reaped.sort()).toEqual(["expired-1", "expired-2"]);
		expect(outcome.failed).toEqual([]);
		expect(outcome.kept).toBe(2);
		expect(destroyed.sort()).toEqual(["expired-1", "expired-2"]);
	});

	it("continues past a destroy failure and records it", async () => {
		const outcome = await reapExpiredHosts({
			hosts,
			now,
			enabled: true,
			destroy: async (h) => {
				if (h.id === "expired-1") throw new Error("provider 500");
			},
		});
		expect(outcome.reaped).toEqual(["expired-2"]);
		expect(outcome.failed).toEqual([
			{ id: "expired-1", error: "provider 500" },
		]);
		expect(outcome.kept).toBe(2);
	});
});
