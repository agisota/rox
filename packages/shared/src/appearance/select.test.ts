import { describe, expect, it } from "bun:test";
import { type Identifiable, pickNext, pickNextIndex } from "./select";

const items: Identifiable[] = [
	{ id: "a" },
	{ id: "b" },
	{ id: "c" },
	{ id: "d" },
];

describe("pickNextIndex", () => {
	it("returns -1 for an empty range", () => {
		expect(pickNextIndex(0, 0)).toBe(-1);
	});

	it("returns 0 for a single item regardless of random", () => {
		expect(pickNextIndex(1, 0, () => 0)).toBe(0);
		expect(pickNextIndex(1, 0, () => 0.999)).toBe(0);
	});

	it("never returns the current index when length > 1", () => {
		for (let len = 2; len <= 6; len++) {
			for (let current = 0; current < len; current++) {
				// Sweep the random output across its whole range.
				for (let r = 0; r < 1; r += 0.05) {
					const next = pickNextIndex(len, current, () => r);
					expect(next).not.toBe(current);
					expect(next).toBeGreaterThanOrEqual(0);
					expect(next).toBeLessThan(len);
				}
			}
		}
	});

	it("can reach every non-current index (uniform mapping)", () => {
		const seen = new Set<number>();
		for (let r = 0; r < 1; r += 0.01) {
			seen.add(pickNextIndex(4, 1, () => r));
		}
		expect([...seen].sort()).toEqual([0, 2, 3]);
	});
});

describe("pickNext", () => {
	it("returns null for an empty list", () => {
		expect(pickNext([], "a")).toBeNull();
	});

	it("returns the only item for a single-item list", () => {
		expect(pickNext([{ id: "solo" }], "solo")).toEqual({ id: "solo" });
	});

	it("never repeats the current item across many draws", () => {
		let current = "a";
		for (let i = 0; i < 1000; i++) {
			const next = pickNext(items, current);
			expect(next).not.toBeNull();
			expect(next?.id).not.toBe(current);
			current = next?.id ?? current;
		}
	});

	it("treats an unknown currentId as no current (all eligible)", () => {
		const seen = new Set<string>();
		for (let r = 0; r < 1; r += 0.01) {
			const next = pickNext(items, "missing", () => r);
			if (next) seen.add(next.id);
		}
		expect([...seen].sort()).toEqual(["a", "b", "c", "d"]);
	});

	it("is deterministic for a fixed random source", () => {
		const rng = () => 0.4;
		expect(pickNext(items, "a", rng)?.id).toBe(pickNext(items, "a", rng)?.id);
	});
});
