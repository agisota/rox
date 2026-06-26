import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "../types";
import { detectCycle } from "./detectCycles";

/**
 * Characterization tests for `detectCycle` (colored DFS, deterministic via
 * sorted neighbour traversal). Returns the first cycle's node ids in order, or
 * `null` for an acyclic graph.
 */

function stateOf(
	ids: string[],
	edges: Array<[string, string]>,
): RoxWorkflowState {
	const blocks: RoxWorkflowState["blocks"] = {};
	for (const id of ids) blocks[id] = { type: "agent_run" };
	return {
		blocks,
		edges: edges.map(([source, target]) => ({ source, target })),
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "test" },
	};
}

describe("detectCycle", () => {
	test("acyclic chain returns null", () => {
		const state = stateOf(
			["a", "b", "c"],
			[
				["a", "b"],
				["b", "c"],
			],
		);
		expect(detectCycle(state)).toBeNull();
	});

	test("self-loop a→a returns a cycle containing a", () => {
		const state = stateOf(["a"], [["a", "a"]]);
		expect(detectCycle(state)).toEqual(["a"]);
	});

	test("simple 2-cycle a→b→a is reported in traversal order", () => {
		const state = stateOf(
			["a", "b"],
			[
				["a", "b"],
				["b", "a"],
			],
		);
		// DFS starts at the lexicographically first node (a), descends to b, then
		// the back-edge b→a closes the cycle slice [a, b].
		expect(detectCycle(state)).toEqual(["a", "b"]);
	});

	test("longer cycle a→b→c→a is reported as the full path", () => {
		const state = stateOf(
			["a", "b", "c"],
			[
				["a", "b"],
				["b", "c"],
				["c", "a"],
			],
		);
		expect(detectCycle(state)).toEqual(["a", "b", "c"]);
	});

	test("cycle in one component of a multi-component graph is found", () => {
		// Component 1: x→y (acyclic). Component 2: p→q→p (cycle).
		const state = stateOf(
			["p", "q", "x", "y"],
			[
				["x", "y"],
				["p", "q"],
				["q", "p"],
			],
		);
		expect(detectCycle(state)).toEqual(["p", "q"]);
	});

	test("diamond (shared descendant) is NOT a false positive", () => {
		// a→b, a→c, b→d, c→d — a DAG; the shared descendant d must not look cyclic.
		const state = stateOf(
			["a", "b", "c", "d"],
			[
				["a", "b"],
				["a", "c"],
				["b", "d"],
				["c", "d"],
			],
		);
		expect(detectCycle(state)).toBeNull();
	});

	test("respects the optional node subset (cycle outside the set is ignored)", () => {
		// c→d→c is a cycle, but excluded from the node set; a→b stays acyclic.
		const state = stateOf(
			["a", "b", "c", "d"],
			[
				["a", "b"],
				["c", "d"],
				["d", "c"],
			],
		);
		expect(detectCycle(state, new Set(["a", "b"]))).toBeNull();
	});

	test("empty graph returns null", () => {
		const state = stateOf([], []);
		expect(detectCycle(state)).toBeNull();
	});
});
