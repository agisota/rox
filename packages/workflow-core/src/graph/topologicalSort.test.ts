import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "../types";
import { topologicalSort } from "./topologicalSort";

/**
 * Characterization tests for `topologicalSort` (Kahn's algorithm with a
 * lexicographically sorted ready set). Assertions pin the ACTUAL deterministic
 * order the implementation produces — these are behaviour guards, not a spec.
 */

/** Minimal `RoxWorkflowState` builder: blocks from ids + explicit edges. */
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

describe("topologicalSort", () => {
	test("linear chain a→b→c yields source-before-target order", () => {
		const state = stateOf(
			["a", "b", "c"],
			[
				["a", "b"],
				["b", "c"],
			],
		);
		expect(topologicalSort(state)).toEqual(["a", "b", "c"]);
	});

	test("diamond a→{b,c}→d yields a deterministic, valid order", () => {
		const state = stateOf(
			["a", "b", "c", "d"],
			[
				["a", "b"],
				["a", "c"],
				["b", "d"],
				["c", "d"],
			],
		);
		// Lexicographic tie-break in the ready set: after a, both b and c are ready;
		// b sorts before c, and d only unlocks once both are consumed.
		expect(topologicalSort(state)).toEqual(["a", "b", "c", "d"]);
	});

	test("is deterministic across repeated calls", () => {
		const state = stateOf(
			["a", "b", "c", "d"],
			[
				["a", "b"],
				["a", "c"],
				["b", "d"],
				["c", "d"],
			],
		);
		expect(topologicalSort(state)).toEqual(topologicalSort(state));
	});

	test("returns null when the selected nodes contain a cycle", () => {
		const state = stateOf(
			["a", "b", "c"],
			[
				["a", "b"],
				["b", "c"],
				["c", "a"],
			],
		);
		expect(topologicalSort(state)).toBeNull();
	});

	test("single node sorts to itself", () => {
		const state = stateOf(["only"], []);
		expect(topologicalSort(state)).toEqual(["only"]);
	});

	test("empty graph sorts to an empty array (not null)", () => {
		const state = stateOf([], []);
		expect(topologicalSort(state)).toEqual([]);
	});

	test("disconnected roots are emitted in lexicographic order", () => {
		// Two independent chains b→d and a→c; all four roots/leaves are mutually
		// independent except within their chain, so the stable ready-set ordering
		// interleaves them lexicographically.
		const state = stateOf(
			["a", "b", "c", "d"],
			[
				["b", "d"],
				["a", "c"],
			],
		);
		expect(topologicalSort(state)).toEqual(["a", "b", "c", "d"]);
	});

	test("options.nodes restricts the sort to the given subset", () => {
		// Edge into the excluded node "c" is ignored; only a→b is honoured.
		const state = stateOf(
			["a", "b", "c"],
			[
				["a", "b"],
				["b", "c"],
			],
		);
		expect(topologicalSort(state, { nodes: new Set(["a", "b"]) })).toEqual([
			"a",
			"b",
		]);
	});

	test("a cycle confined to excluded nodes does not poison the subset sort", () => {
		// c↔d form a cycle but are excluded from the node set, so a→b still sorts.
		const state = stateOf(
			["a", "b", "c", "d"],
			[
				["a", "b"],
				["c", "d"],
				["d", "c"],
			],
		);
		expect(topologicalSort(state, { nodes: new Set(["a", "b"]) })).toEqual([
			"a",
			"b",
		]);
	});
});
