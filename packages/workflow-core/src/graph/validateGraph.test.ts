import { describe, expect, test } from "bun:test";
import { WorkflowErrorCode } from "../errors";
import type { SupersetBlockState, SupersetWorkflowState } from "../types";
import { topologicalSort } from "./topologicalSort";
import { validateGraph } from "./validateGraph";

function makeState(
	blocks: Record<string, SupersetBlockState>,
	edges: SupersetWorkflowState["edges"],
): SupersetWorkflowState {
	return {
		blocks,
		edges,
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "test" },
	};
}

function codes(result: { issues: { code: string }[] }): string[] {
	return result.issues.map((i) => i.code);
}

describe("validateGraph", () => {
	test("CORE-01: valid minimal workflow", () => {
		const state = makeState(
			{ start: { type: "start" }, response: { type: "response" } },
			[{ source: "start", target: "response" }],
		);
		const result = validateGraph(state);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
		expect(result.executionPlan).toEqual(["start", "response"]);
	});

	test("CORE-02: missing start block rejected", () => {
		const state = makeState({ response: { type: "response" } }, []);
		const result = validateGraph(state);
		expect(result.valid).toBe(false);
		expect(codes(result)).toContain(WorkflowErrorCode.MISSING_START_BLOCK);
	});

	test("CORE-02b: multiple start blocks rejected", () => {
		const state = makeState(
			{ start: { type: "start" }, start2: { type: "start" } },
			[],
		);
		expect(codes(validateGraph(state))).toContain(
			WorkflowErrorCode.MULTIPLE_START_BLOCKS,
		);
	});

	test("CORE-03: edge to missing node rejected", () => {
		const state = makeState({ start: { type: "start" } }, [
			{ source: "start", target: "unknown" },
		]);
		expect(codes(validateGraph(state))).toContain(
			WorkflowErrorCode.INVALID_EDGE_TARGET,
		);
	});

	test("CORE-04: cycle rejected", () => {
		const state = makeState(
			{
				a: { type: "start" },
				b: { type: "condition" },
				c: { type: "condition" },
			},
			[
				{ source: "a", target: "b" },
				{ source: "b", target: "c" },
				{ source: "c", target: "a" },
			],
		);
		expect(codes(validateGraph(state))).toContain(
			WorkflowErrorCode.CYCLE_DETECTED,
		);
	});

	test("CORE-05: unreachable enabled block rejected", () => {
		const state = makeState(
			{
				start: { type: "start" },
				response: { type: "response" },
				orphan: { type: "create_task" },
			},
			[{ source: "start", target: "response" }],
		);
		const result = validateGraph(state);
		expect(result.valid).toBe(false);
		expect(codes(result)).toContain(WorkflowErrorCode.UNREACHABLE_BLOCK);
	});

	test("CORE-05b: disabled unreachable block is allowed", () => {
		const state = makeState(
			{
				start: { type: "start" },
				response: { type: "response" },
				orphan: { type: "create_task", enabled: false },
			},
			[{ source: "start", target: "response" }],
		);
		const result = validateGraph(state);
		expect(result.valid).toBe(true);
		expect(codes(result)).not.toContain(WorkflowErrorCode.UNREACHABLE_BLOCK);
	});

	test("CORE-06: disabled block cannot be a required bridge", () => {
		const state = makeState(
			{
				start: { type: "start" },
				mid: { type: "create_task", enabled: false },
				response: { type: "response" },
			},
			[
				{ source: "start", target: "mid" },
				{ source: "mid", target: "response" },
			],
		);
		const result = validateGraph(state);
		expect(result.valid).toBe(false);
		expect(codes(result)).toContain(WorkflowErrorCode.DISABLED_BRIDGE_BLOCK);
	});

	test("CORE-10: deterministic topological order", () => {
		const state = makeState(
			{
				start: { type: "start" },
				a: { type: "condition" },
				b: { type: "condition" },
				response: { type: "response" },
			},
			[
				{ source: "start", target: "a" },
				{ source: "start", target: "b" },
				{ source: "a", target: "response" },
				{ source: "b", target: "response" },
			],
		);
		const first = validateGraph(state).executionPlan;
		expect(first).toEqual(["start", "a", "b", "response"]);
		for (let i = 0; i < 100; i++) {
			expect(topologicalSort(state)).toEqual(first ?? []);
		}
	});
});
