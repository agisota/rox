import { describe, expect, it } from "bun:test";
import {
	applyDragMove,
	applyEdgeResize,
	MIN_BLOCK_HEIGHT,
	PX_PER_MINUTE,
	snapMinutes,
} from "./timeGrid";

const DAY = new Date("2026-06-25T00:00:00.000Z");
const iso = (d: Date) => d.toISOString();
/** px delta for a whole-minute move (PX_PER_MINUTE = 0.8). */
const px = (minutes: number) => minutes * PX_PER_MINUTE;

describe("snapMinutes", () => {
	it("rounds to the nearest 15-minute step", () => {
		expect(snapMinutes(0)).toBe(0);
		expect(snapMinutes(7)).toBe(0);
		expect(snapMinutes(8)).toBe(15);
		expect(snapMinutes(22)).toBe(15);
		expect(snapMinutes(23)).toBe(30);
		expect(snapMinutes(-8)).toBe(-15);
	});
});

describe("applyDragMove", () => {
	const start = new Date("2026-06-25T09:00:00.000Z");
	const end = new Date("2026-06-25T10:00:00.000Z");

	it("shifts a block down by a snapped delta, preserving duration", () => {
		const r = applyDragMove(start, end, px(30), DAY);
		expect(iso(r.start)).toBe("2026-06-25T09:30:00.000Z");
		expect(iso(r.end)).toBe("2026-06-25T10:30:00.000Z");
	});

	it("snaps a non-aligned delta to 15 min", () => {
		const r = applyDragMove(start, end, px(22), DAY);
		expect(iso(r.start)).toBe("2026-06-25T09:15:00.000Z");
		expect(iso(r.end)).toBe("2026-06-25T10:15:00.000Z");
	});

	it("clamps the top so the block never leaves the body start", () => {
		const r = applyDragMove(start, end, px(-600), DAY);
		expect(iso(r.start)).toBe("2026-06-25T00:00:00.000Z");
		expect(iso(r.end)).toBe("2026-06-25T01:00:00.000Z");
	});

	it("clamps the bottom so a 1h block ends at most at 24:00", () => {
		const r = applyDragMove(start, end, px(24 * 60), DAY);
		expect(iso(r.start)).toBe("2026-06-25T23:00:00.000Z");
		expect(iso(r.end)).toBe("2026-06-26T00:00:00.000Z");
	});
});

describe("applyEdgeResize", () => {
	const start = new Date("2026-06-25T09:00:00.000Z");
	const end = new Date("2026-06-25T10:00:00.000Z");

	it("extends the end by a snapped delta, keeping start fixed", () => {
		const r = applyEdgeResize(start, end, px(30), DAY);
		expect(iso(r.start)).toBe("2026-06-25T09:00:00.000Z");
		expect(iso(r.end)).toBe("2026-06-25T10:30:00.000Z");
	});

	it("enforces a minimum block height when shrinking", () => {
		const r = applyEdgeResize(start, end, px(-600), DAY);
		expect(iso(r.start)).toBe("2026-06-25T09:00:00.000Z");
		const minDurationMin = MIN_BLOCK_HEIGHT / PX_PER_MINUTE;
		const durationMin = (r.end.getTime() - r.start.getTime()) / 60_000;
		expect(durationMin).toBeGreaterThanOrEqual(minDurationMin);
	});

	it("never extends past the end of the day body", () => {
		const r = applyEdgeResize(start, end, px(24 * 60), DAY);
		expect(iso(r.end)).toBe("2026-06-26T00:00:00.000Z");
	});
});
