import { describe, expect, it } from "bun:test";

import {
	type AgeGroupableSession,
	groupSessionsByAge,
	sessionAgeGroupKey,
} from "./group-sessions";

// A fixed server-synced "now" so the buckets are deterministic regardless of
// when the suite runs (12:00 to avoid DST/midnight edge ambiguity).
const NOW = new Date("2026-06-25T12:00:00");

function at(iso: string): AgeGroupableSession {
	return { updatedAt: new Date(iso) };
}

describe("sessionAgeGroupKey", () => {
	it("buckets the current day as today (incl. earlier today)", () => {
		expect(sessionAgeGroupKey(new Date("2026-06-25T00:30:00"), NOW)).toBe(
			"today",
		);
		expect(sessionAgeGroupKey(new Date("2026-06-25T11:59:00"), NOW)).toBe(
			"today",
		);
	});

	it("buckets the prior day as yesterday", () => {
		expect(sessionAgeGroupKey(new Date("2026-06-24T23:00:00"), NOW)).toBe(
			"yesterday",
		);
	});

	it("buckets within the last 7 / 30 days", () => {
		expect(sessionAgeGroupKey(new Date("2026-06-21T09:00:00"), NOW)).toBe(
			"last7Days",
		);
		expect(sessionAgeGroupKey(new Date("2026-06-10T09:00:00"), NOW)).toBe(
			"last30Days",
		);
	});

	it("falls back to older beyond 30 days", () => {
		expect(sessionAgeGroupKey(new Date("2026-04-01T09:00:00"), NOW)).toBe(
			"older",
		);
	});
});

describe("groupSessionsByAge", () => {
	it("returns no groups for an empty list", () => {
		expect(groupSessionsByAge([], NOW)).toEqual([]);
	});

	it("coalesces adjacent same-bucket sessions into one group", () => {
		const groups = groupSessionsByAge(
			[
				at("2026-06-25T10:00:00"),
				at("2026-06-25T08:00:00"),
				at("2026-06-24T20:00:00"),
			],
			NOW,
		);
		expect(groups.map((g) => g.key)).toEqual(["today", "yesterday"]);
		expect(groups[0]?.sessions).toHaveLength(2);
		expect(groups[1]?.sessions).toHaveLength(1);
	});

	it("produces the natural Today→…→Older ordering for a recency list", () => {
		const groups = groupSessionsByAge(
			[
				at("2026-06-25T10:00:00"),
				at("2026-06-24T10:00:00"),
				at("2026-06-21T10:00:00"),
				at("2026-06-10T10:00:00"),
				at("2026-04-01T10:00:00"),
			],
			NOW,
		);
		expect(groups.map((g) => g.key)).toEqual([
			"today",
			"yesterday",
			"last7Days",
			"last30Days",
			"older",
		]);
	});

	it("sets olderAt only on the older bucket", () => {
		const olderTs = new Date("2026-04-01T10:00:00").getTime();
		const groups = groupSessionsByAge(
			[at("2026-06-25T10:00:00"), at("2026-04-01T10:00:00")],
			NOW,
		);
		expect(groups[0]?.olderAt).toBeNull();
		expect(groups[1]?.olderAt).toBe(olderTs);
	});

	it("does not globally regroup non-adjacent same-bucket runs", () => {
		// Two distinct "today" runs separated by a "yesterday" stay separate,
		// mirroring the original desktop coalescing behaviour.
		const groups = groupSessionsByAge(
			[
				at("2026-06-25T10:00:00"),
				at("2026-06-24T10:00:00"),
				at("2026-06-25T09:00:00"),
			],
			NOW,
		);
		expect(groups.map((g) => g.key)).toEqual(["today", "yesterday", "today"]);
	});
});
