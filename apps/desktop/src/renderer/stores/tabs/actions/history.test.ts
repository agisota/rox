import { describe, expect, it } from "bun:test";
import { pushActiveToHistory } from "./history";

describe("pushActiveToHistory", () => {
	it("returns the stack unchanged when the active id is undefined", () => {
		const stack = ["a", "b"];
		expect(pushActiveToHistory(stack, undefined)).toBe(stack);
	});

	it("returns the stack unchanged when the active id is null", () => {
		const stack = ["a", "b"];
		expect(pushActiveToHistory(stack, null)).toBe(stack);
	});

	it("prepends the active id onto an empty stack", () => {
		expect(pushActiveToHistory([], "a")).toEqual(["a"]);
	});

	it("prepends the active id when not already present", () => {
		expect(pushActiveToHistory(["b", "c"], "a")).toEqual(["a", "b", "c"]);
	});

	it("moves an existing active id to the front (dedup)", () => {
		expect(pushActiveToHistory(["b", "a", "c"], "a")).toEqual(["a", "b", "c"]);
	});

	it("keeps the active id at the front when already first", () => {
		expect(pushActiveToHistory(["a", "b"], "a")).toEqual(["a", "b"]);
	});

	it("removes every duplicate of the active id, preserving other order", () => {
		expect(pushActiveToHistory(["a", "b", "a", "c"], "a")).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("does not mutate the input stack", () => {
		const stack = ["b", "a"];
		pushActiveToHistory(stack, "a");
		expect(stack).toEqual(["b", "a"]);
	});
});
