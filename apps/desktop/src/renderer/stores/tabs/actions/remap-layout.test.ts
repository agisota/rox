import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import { remapLayout } from "./remap-layout";

describe("remapLayout", () => {
	it("remaps a single leaf id", () => {
		const idMap = new Map([["old", "new"]]);
		expect(remapLayout("old", idMap)).toBe("new");
	});

	it("leaves an unmapped leaf id unchanged", () => {
		const idMap = new Map([["old", "new"]]);
		expect(remapLayout("other", idMap)).toBe("other");
	});

	it("remaps every leaf in a nested split tree", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "a",
			second: {
				direction: "column",
				first: "b",
				second: "c",
				splitPercentage: 40,
			},
			splitPercentage: 60,
		};
		const idMap = new Map([
			["a", "a2"],
			["b", "b2"],
			["c", "c2"],
		]);

		expect(remapLayout(layout, idMap)).toEqual({
			direction: "row",
			first: "a2",
			second: {
				direction: "column",
				first: "b2",
				second: "c2",
				splitPercentage: 40,
			},
			splitPercentage: 60,
		});
	});

	it("preserves split metadata (direction, splitPercentage)", () => {
		const layout: MosaicNode<string> = {
			direction: "column",
			first: "x",
			second: "y",
			splitPercentage: 33,
		};
		const result = remapLayout(layout, new Map());
		expect(result).toEqual(layout);
	});

	it("does not mutate the input node", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "a",
			second: "b",
			splitPercentage: 50,
		};
		const snapshot = JSON.parse(JSON.stringify(layout));
		remapLayout(
			layout,
			new Map([
				["a", "a2"],
				["b", "b2"],
			]),
		);
		expect(layout).toEqual(snapshot);
	});

	it("only partially remaps when the map is incomplete", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "a",
			second: "b",
			splitPercentage: 50,
		};
		expect(remapLayout(layout, new Map([["a", "a2"]]))).toEqual({
			direction: "row",
			first: "a2",
			second: "b",
			splitPercentage: 50,
		});
	});
});
