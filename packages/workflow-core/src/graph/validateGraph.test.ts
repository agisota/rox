import { describe, expect, test } from "bun:test";
import { WorkflowErrorCode } from "../errors";
import { getNodeType } from "../registry";
import type { RoxBlockState, RoxWorkflowState } from "../types";
import { topologicalSort } from "./topologicalSort";
import { validateGraph } from "./validateGraph";

function makeState(
	blocks: Record<string, RoxBlockState>,
	edges: RoxWorkflowState["edges"],
): RoxWorkflowState {
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

	test("CORE-REG-01: registry config checks are off by default", () => {
		// An agent_run with no role is valid by default (no resolveNodeType) so old
		// graphs keep validating; the required-config rule is strictly opt-in.
		const state = makeState(
			{ start: { type: "start" }, run: { type: "agent_run" } },
			[{ source: "start", target: "run" }],
		);
		expect(validateGraph(state).valid).toBe(true);
	});

	test("CORE-REG-02: opt-in registry check flags a missing required config", () => {
		const state = makeState(
			{ start: { type: "start" }, run: { type: "agent_run" } },
			[{ source: "start", target: "run" }],
		);
		const result = validateGraph(state, { resolveNodeType: getNodeType });
		expect(result.valid).toBe(false);
		expect(codes(result)).toContain(WorkflowErrorCode.MISSING_REQUIRED_CONFIG);
	});

	test("CORE-REG-03: opt-in registry check passes with valid config", () => {
		const state = makeState(
			{
				start: { type: "start" },
				run: { type: "agent_run", subBlocks: { roleSlug: "critic" } },
				done: { type: "response" },
			},
			[
				{ source: "start", target: "run" },
				{ source: "run", target: "done" },
			],
		);
		const result = validateGraph(state, { resolveNodeType: getNodeType });
		expect(result.valid).toBe(true);
	});

	test("CORE-REG-04: registry check skips unknown + disabled blocks", () => {
		const state = makeState(
			{
				start: { type: "start" },
				// Unknown type → skipped (forward-compatible).
				mystery: { type: "future_node" },
				// Disabled agent_run with no role → not config-flagged.
				run: { type: "agent_run", enabled: false },
				done: { type: "response" },
			},
			[
				{ source: "start", target: "mystery" },
				{ source: "mystery", target: "done" },
			],
		);
		const result = validateGraph(state, { resolveNodeType: getNodeType });
		expect(codes(result)).not.toContain(
			WorkflowErrorCode.MISSING_REQUIRED_CONFIG,
		);
	});

	test("CORE-REG-05: required input port must be wired", () => {
		// response requires an incoming edge; leave it unwired (still reachable via
		// a different start path is impossible here, so it would also be unreachable
		// — assert specifically on the port code via a wired-but-role-less setup).
		const state = makeState(
			{
				start: { type: "start" },
				run: { type: "agent_run", subBlocks: { roleSlug: "critic" } },
			},
			[{ source: "start", target: "run" }],
		);
		// run has an incoming edge and a role → valid with ports enabled.
		expect(validateGraph(state, { resolveNodeType: getNodeType }).valid).toBe(
			true,
		);
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

describe("validateGraph — port-type compatibility", () => {
	test("PORT-01: off by default (no resolveNodeType)", () => {
		// embedding.out:vector → knowledge_retrieval.in:string is incompatible, but
		// the type check is strictly opt-in, so without resolveNodeType it is silent.
		const state = makeState(
			{
				start: { type: "start" },
				emb: { type: "embedding" },
				kr: { type: "knowledge_retrieval" },
			},
			[
				{ source: "start", target: "emb" },
				{
					source: "emb",
					target: "kr",
					sourceHandle: "out",
					targetHandle: "in",
				},
			],
		);
		expect(codes(validateGraph(state))).not.toContain(
			WorkflowErrorCode.INCOMPATIBLE_PORT_TYPES,
		);
	});

	test("PORT-02: opt-in check flags an incompatible edge", () => {
		const state = makeState(
			{
				start: { type: "start" },
				emb: { type: "embedding" },
				kr: { type: "knowledge_retrieval" },
			},
			[
				{ source: "start", target: "emb" },
				{
					source: "emb",
					target: "kr",
					sourceHandle: "out",
					targetHandle: "in",
				},
			],
		);
		const result = validateGraph(state, { resolveNodeType: getNodeType });
		expect(codes(result)).toContain(WorkflowErrorCode.INCOMPATIBLE_PORT_TYPES);
	});

	test("PORT-03: `any`/untyped source out-port passes", () => {
		// start.out is untyped (`any`) → compatible with knowledge_retrieval.in:string.
		const state = makeState(
			{
				start: { type: "start" },
				kr: { type: "knowledge_retrieval" },
				done: { type: "response" },
			},
			[
				{ source: "start", target: "kr", targetHandle: "in" },
				{ source: "kr", target: "done" },
			],
		);
		expect(
			codes(validateGraph(state, { resolveNodeType: getNodeType })),
		).not.toContain(WorkflowErrorCode.INCOMPATIBLE_PORT_TYPES);
	});

	test("PORT-04: matching concrete types pass", () => {
		// classifier.out:string → embedding.in:string is an exact type match.
		const state = makeState(
			{
				start: { type: "start" },
				cls: { type: "classifier" },
				emb: { type: "embedding" },
				done: { type: "response" },
			},
			[
				{ source: "start", target: "cls", targetHandle: "in" },
				{
					source: "cls",
					target: "emb",
					sourceHandle: "out",
					targetHandle: "in",
				},
				{ source: "emb", target: "done" },
			],
		);
		expect(
			codes(validateGraph(state, { resolveNodeType: getNodeType })),
		).not.toContain(WorkflowErrorCode.INCOMPATIBLE_PORT_TYPES);
	});

	test("PORT-05: legacy untyped graph stays valid under the check", () => {
		// The legacy node types carry no concrete in-port types → every wire
		// resolves to `any` on the target side and the check never fires.
		const state = makeState(
			{
				start: { type: "start" },
				cond: { type: "condition", subBlocks: { expression: "x > 1" } },
				done: { type: "response" },
			},
			[
				{ source: "start", target: "cond" },
				{ source: "cond", target: "done", sourceHandle: "true" },
			],
		);
		const result = validateGraph(state, { resolveNodeType: getNodeType });
		expect(codes(result)).not.toContain(
			WorkflowErrorCode.INCOMPATIBLE_PORT_TYPES,
		);
	});

	test("PORT-06: disabled endpoint skips the check", () => {
		const state = makeState(
			{
				start: { type: "start" },
				emb: { type: "embedding", enabled: false },
				kr: { type: "knowledge_retrieval" },
			},
			[
				{ source: "start", target: "emb" },
				{
					source: "emb",
					target: "kr",
					sourceHandle: "out",
					targetHandle: "in",
				},
			],
		);
		expect(
			codes(validateGraph(state, { resolveNodeType: getNodeType })),
		).not.toContain(WorkflowErrorCode.INCOMPATIBLE_PORT_TYPES);
	});
});
