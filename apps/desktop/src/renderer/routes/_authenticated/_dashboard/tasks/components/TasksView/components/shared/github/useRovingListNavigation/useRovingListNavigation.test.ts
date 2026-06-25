import { describe, expect, test } from "bun:test";
import { rovingKeyAction } from "./rovingKeyAction";

describe("rovingKeyAction", () => {
	test("j / ArrowDown move down and clamp at the end", () => {
		expect(rovingKeyAction("j", 0, 3)).toEqual({ type: "move", index: 1 });
		expect(rovingKeyAction("ArrowDown", 1, 3)).toEqual({
			type: "move",
			index: 2,
		});
		expect(rovingKeyAction("j", 2, 3)).toEqual({ type: "move", index: 2 });
	});

	test("k / ArrowUp move up and clamp at the start", () => {
		expect(rovingKeyAction("k", 2, 3)).toEqual({ type: "move", index: 1 });
		expect(rovingKeyAction("ArrowUp", 0, 3)).toEqual({
			type: "move",
			index: 0,
		});
	});

	test("first keypress with no selection focuses the first row", () => {
		expect(rovingKeyAction("j", -1, 3)).toEqual({ type: "move", index: 0 });
		expect(rovingKeyAction("k", -1, 3)).toEqual({ type: "move", index: 0 });
	});

	test("Home / End jump to the edges", () => {
		expect(rovingKeyAction("Home", 2, 5)).toEqual({ type: "move", index: 0 });
		expect(rovingKeyAction("End", 0, 5)).toEqual({ type: "move", index: 4 });
	});

	test("Enter activates only when a row is focused", () => {
		expect(rovingKeyAction("Enter", 2, 5)).toEqual({
			type: "activate",
			index: 2,
		});
		expect(rovingKeyAction("Enter", -1, 5)).toEqual({ type: "none" });
	});

	test("unrelated keys and empty lists are no-ops", () => {
		expect(rovingKeyAction("x", 1, 5)).toEqual({ type: "none" });
		expect(rovingKeyAction("j", 0, 0)).toEqual({ type: "none" });
	});
});
