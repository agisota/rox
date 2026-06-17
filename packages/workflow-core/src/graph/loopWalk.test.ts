import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "../types";
import { detectCycle } from "./detectCycles";
import {
	edgeKey,
	loopBackEdgeKeys,
	resolveLoops,
	stripLoopBackEdges,
} from "./loopWalk";

/**
 * Build a critic ⇄ improver feedback loop:
 *   start → improver → critic → response
 *                ↑__________│  (back-edge: critic → improver, handle "revise")
 * The loop body is { improver, critic }; the back-edge closes the cycle.
 */
function feedbackLoop(maxIterations?: number): RoxWorkflowState {
	return {
		blocks: {
			start: { type: "start" },
			improver: { type: "agent_run", subBlocks: { roleSkillSlug: "improver" } },
			critic: { type: "agent_run", subBlocks: { roleSkillSlug: "critic" } },
			response: { type: "response" },
		},
		edges: [
			{ id: "e1", source: "start", target: "improver" },
			{ id: "e2", source: "improver", target: "critic" },
			{
				id: "e_back",
				source: "critic",
				target: "improver",
				sourceHandle: "revise",
			},
			{
				id: "e3",
				source: "critic",
				target: "response",
				sourceHandle: "accept",
			},
		],
		variables: {},
		loops: { loop1: { nodes: ["improver", "critic"], maxIterations } },
		parallels: {},
		metadata: { name: "feedback" },
	};
}

describe("loopWalk", () => {
	test("resolveLoops finds the entry node and back-edge", () => {
		const loops = resolveLoops(feedbackLoop());
		expect(loops).toHaveLength(1);
		const loop = loops[0];
		// `improver` is entered from outside (start → improver), so it's the entry.
		expect(loop?.entryNodeId).toBe("improver");
		expect(loop?.bodyNodeIds.sort()).toEqual(["critic", "improver"]);
		expect(loop?.backEdges.map((e) => e.id)).toEqual(["e_back"]);
	});

	test("loopBackEdgeKeys + stripLoopBackEdges removes the cycle", () => {
		const state = feedbackLoop();
		// The raw graph has a cycle (critic → improver → critic).
		expect(detectCycle(state)).not.toBeNull();
		const keys = loopBackEdgeKeys(resolveLoops(state));
		expect(keys.has("e_back")).toBe(true);
		const stripped = stripLoopBackEdges(state, keys);
		// Once the back-edge is stripped, the forward graph is acyclic.
		expect(detectCycle(stripped)).toBeNull();
		expect(stripped.edges.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
		// Original state is untouched (immutability contract).
		expect(state.edges).toHaveLength(4);
	});

	test("stripLoopBackEdges is a no-op when there are no back-edges", () => {
		const state: RoxWorkflowState = {
			blocks: { start: { type: "start" }, response: { type: "response" } },
			edges: [{ source: "start", target: "response" }],
			variables: {},
			loops: {},
			parallels: {},
			metadata: { name: "linear" },
		};
		expect(stripLoopBackEdges(state, new Set())).toBe(state);
	});

	test("edgeKey is stable: prefers id, else endpoints + handle", () => {
		expect(edgeKey({ id: "x", source: "a", target: "b" })).toBe("x");
		expect(edgeKey({ source: "a", target: "b", sourceHandle: "true" })).toBe(
			"a b true",
		);
		expect(edgeKey({ source: "a", target: "b" })).toBe("a b ");
	});

	test("resolveLoops skips loops with no body or no internal back-edge", () => {
		const state: RoxWorkflowState = {
			blocks: {
				start: { type: "start" },
				a: { type: "response" },
			},
			edges: [{ source: "start", target: "a" }],
			variables: {},
			loops: {
				empty: { nodes: [] },
				// `a`'s only in-edge comes from outside the body → no internal back-edge.
				noBack: { nodes: ["a"] },
			},
			parallels: {},
			metadata: { name: "edge" },
		};
		expect(resolveLoops(state)).toEqual([]);
	});

	test("resolveLoops ignores body node ids missing from blocks", () => {
		const state = feedbackLoop();
		state.loops.loop1 = {
			nodes: ["improver", "critic", "ghost"],
		};
		const loops = resolveLoops(state);
		expect(loops[0]?.bodyNodeIds).not.toContain("ghost");
	});
});
