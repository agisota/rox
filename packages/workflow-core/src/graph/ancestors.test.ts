import { describe, expect, it } from "bun:test";
import type { RoxWorkflowState } from "../types";
import { ancestorsOf } from "./ancestors";

function state(): RoxWorkflowState {
	return {
		blocks: {
			start: { type: "start" },
			a: { type: "model" },
			b: { type: "model" },
			c: { type: "model" },
			d: { type: "response" },
		},
		// start -> a -> c -> d ; start -> b -> d (b is NOT an ancestor of c)
		edges: [
			{ source: "start", target: "a" },
			{ source: "a", target: "c" },
			{ source: "c", target: "d" },
			{ source: "start", target: "b" },
			{ source: "b", target: "d" },
		],
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "t" },
	};
}

describe("ancestorsOf", () => {
	it("collects transitive upstream nodes only", () => {
		expect(ancestorsOf(state(), "c")).toEqual(new Set(["a", "start"]));
	});

	it("excludes sibling branches not feeding the target", () => {
		const anc = ancestorsOf(state(), "c");
		expect(anc.has("b")).toBe(false);
	});

	it("returns empty for the start node", () => {
		expect(ancestorsOf(state(), "start").size).toBe(0);
	});

	it("respects the allow predicate (disabled node cuts the path)", () => {
		const anc = ancestorsOf(state(), "d", (id) => id !== "a");
		// d's ancestors via a are cut; only b + start reachable through b remain.
		expect(anc.has("a")).toBe(false);
		expect(anc.has("b")).toBe(true);
	});
});
