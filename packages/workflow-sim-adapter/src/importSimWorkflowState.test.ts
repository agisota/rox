import { describe, expect, test } from "bun:test";
import { validateGraph } from "@rox/workflow-core";
import {
	importSimWorkflowState,
	UNSUPPORTED_BLOCK_TYPE,
} from "./importSimWorkflowState";
import type { SimWorkflowState } from "./simTypes";

describe("importSimWorkflowState", () => {
	test("SIM-01: imports blocks, edges, variables, loops, parallels", () => {
		const sim: SimWorkflowState = {
			blocks: {
				s: { type: "starter", name: "Start", position: { x: 0, y: 0 } },
				c: { type: "condition", name: "Check" },
				r: { type: "response", name: "Done" },
			},
			edges: [
				{ id: "e1", source: "s", target: "c" },
				{ id: "e2", source: "c", target: "r", sourceHandle: "true" },
			],
			loops: { l1: { nodes: ["c"], iterations: 3 } },
			parallels: { p1: { nodes: ["c", "r"] } },
			variables: { topic: { type: "string", value: "x" } },
			metadata: { name: "My Sim flow" },
		};
		const { state } = importSimWorkflowState(sim);
		expect(state.blocks.s?.type).toBe("start");
		expect(state.blocks.c?.type).toBe("condition");
		expect(state.blocks.r?.type).toBe("response");
		expect(state.edges).toHaveLength(2);
		expect(state.edges[1]?.sourceHandle).toBe("true");
		expect(state.loops.l1?.maxIterations).toBe(3);
		expect(state.parallels.p1?.nodes).toEqual(["c", "r"]);
		expect(state.variables.topic?.type).toBe("string");
		expect(state.metadata.name).toBe("My Sim flow");
		// The converted graph is valid Rox.
		expect(validateGraph(state).valid).toBe(true);
	});

	test("SIM-02: unsupported Sim block becomes an adapter block + warning", () => {
		const sim: SimWorkflowState = {
			blocks: {
				s: { type: "starter" },
				weird: { type: "some_proprietary_sim_block" },
				r: { type: "response" },
			},
			edges: [
				{ source: "s", target: "weird" },
				{ source: "weird", target: "r" },
			],
		};
		const result = importSimWorkflowState(sim);
		expect(result.state.blocks.weird?.type).toBe(UNSUPPORTED_BLOCK_TYPE);
		expect(result.state.blocks.weird?.metadata?.simType).toBe(
			"some_proprietary_sim_block",
		);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.publishable).toBe(false);
	});

	test("SIM-03: Sim workflow block maps to a skill_call with a dependency", () => {
		const sim: SimWorkflowState = {
			blocks: {
				s: { type: "starter" },
				child: { type: "workflow", data: { workflowId: "wf_child_123" } },
				r: { type: "response" },
			},
			edges: [
				{ source: "s", target: "child" },
				{ source: "child", target: "r" },
			],
		};
		const result = importSimWorkflowState(sim);
		expect(result.state.blocks.child?.type).toBe("skill_call:wf_child_123");
		expect(result.childWorkflowDependencies).toContain("wf_child_123");
		expect(result.publishable).toBe(true);
	});
});
