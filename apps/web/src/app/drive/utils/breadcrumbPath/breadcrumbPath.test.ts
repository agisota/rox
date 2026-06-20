import { describe, expect, it } from "bun:test";
import { breadcrumbPath, truncateStackTo } from "./breadcrumbPath";

describe("breadcrumbPath", () => {
	it("returns only the root when the stack is empty, marked current", () => {
		const segments = breadcrumbPath([]);
		expect(segments).toHaveLength(1);
		expect(segments[0]).toMatchObject({ id: null, isCurrent: true });
	});

	it("appends each folder and marks the last one current", () => {
		const segments = breadcrumbPath([
			{ id: "a", name: "Docs" },
			{ id: "b", name: "Specs" },
		]);
		expect(segments.map((s) => s.id)).toEqual([null, "a", "b"]);
		expect(segments[0]?.isCurrent).toBe(false);
		expect(segments[2]?.isCurrent).toBe(true);
		expect(segments[2]?.label).toBe("Specs");
	});

	it("uses a custom root label", () => {
		expect(breadcrumbPath([], "Drive")[0]?.label).toBe("Drive");
	});
});

describe("truncateStackTo", () => {
	const stack = [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
	];

	it("clears the stack for the root", () => {
		expect(truncateStackTo(stack, null)).toEqual([]);
	});

	it("trims back to and including the clicked folder", () => {
		expect(truncateStackTo(stack, "b").map((c) => c.id)).toEqual(["a", "b"]);
	});

	it("leaves the stack unchanged for an unknown id", () => {
		expect(truncateStackTo(stack, "zzz")).toEqual(stack);
	});
});
