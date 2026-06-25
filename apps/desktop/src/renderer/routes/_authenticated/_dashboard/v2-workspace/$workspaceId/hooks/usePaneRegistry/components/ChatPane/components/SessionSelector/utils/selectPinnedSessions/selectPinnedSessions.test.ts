import { describe, expect, it } from "bun:test";
import {
	comparePinned,
	type PinnableSession,
	selectPinnedSessions,
} from "./selectPinnedSessions";

function session(
	sessionId: string,
	opts: {
		pinned?: boolean;
		pinnedAt?: string | null;
		updatedAt?: string;
	} = {},
): PinnableSession {
	return {
		sessionId,
		pinned: opts.pinned ?? false,
		pinnedAt: opts.pinnedAt ? new Date(opts.pinnedAt) : null,
		updatedAt: new Date(opts.updatedAt ?? "2024-01-01T00:00:00Z"),
	};
}

describe("selectPinnedSessions", () => {
	it("returns an empty pinned group when nothing is pinned", () => {
		const list = [session("a"), session("b")];
		const { pinned, rest } = selectPinnedSessions(list, 10);
		expect(pinned).toEqual([]);
		expect(rest.map((s) => s.sessionId)).toEqual(["a", "b"]);
	});

	it("hoists pinned sessions and removes them from rest", () => {
		const list = [
			session("a"),
			session("b", { pinned: true, pinnedAt: "2024-02-01T00:00:00Z" }),
			session("c"),
		];
		const { pinned, rest } = selectPinnedSessions(list, 10);
		expect(pinned.map((s) => s.sessionId)).toEqual(["b"]);
		expect(rest.map((s) => s.sessionId)).toEqual(["a", "c"]);
	});

	it("orders pinned most-recently-pinned-first", () => {
		const list = [
			session("old", { pinned: true, pinnedAt: "2024-01-01T00:00:00Z" }),
			session("new", { pinned: true, pinnedAt: "2024-03-01T00:00:00Z" }),
			session("mid", { pinned: true, pinnedAt: "2024-02-01T00:00:00Z" }),
		];
		const { pinned } = selectPinnedSessions(list, 10);
		expect(pinned.map((s) => s.sessionId)).toEqual(["new", "mid", "old"]);
	});

	it("falls back to activity recency when pinnedAt ties or is missing", () => {
		const list = [
			session("stale", { pinned: true, updatedAt: "2024-01-01T00:00:00Z" }),
			session("fresh", { pinned: true, updatedAt: "2024-05-01T00:00:00Z" }),
		];
		const { pinned } = selectPinnedSessions(list, 10);
		expect(pinned.map((s) => s.sessionId)).toEqual(["fresh", "stale"]);
	});

	it("caps the pinned group and lets excess fall through to rest", () => {
		const list = [
			session("p1", { pinned: true, pinnedAt: "2024-01-03T00:00:00Z" }),
			session("p2", { pinned: true, pinnedAt: "2024-01-02T00:00:00Z" }),
			session("p3", { pinned: true, pinnedAt: "2024-01-01T00:00:00Z" }),
		];
		const { pinned, rest } = selectPinnedSessions(list, 2);
		expect(pinned.map((s) => s.sessionId)).toEqual(["p1", "p2"]);
		expect(rest.map((s) => s.sessionId)).toEqual(["p3"]);
	});

	it("does not mutate the input array", () => {
		const list = [
			session("a", { pinned: true, pinnedAt: "2024-01-01T00:00:00Z" }),
			session("b"),
		];
		const snapshot = list.map((s) => s.sessionId);
		selectPinnedSessions(list, 10);
		expect(list.map((s) => s.sessionId)).toEqual(snapshot);
	});

	it("comparePinned is symmetric in sign", () => {
		const a = session("a", { pinned: true, pinnedAt: "2024-02-01T00:00:00Z" });
		const b = session("b", { pinned: true, pinnedAt: "2024-01-01T00:00:00Z" });
		expect(Math.sign(comparePinned(a, b))).toBe(
			-Math.sign(comparePinned(b, a)),
		);
	});
});
