import { describe, expect, test } from "bun:test";
import { WorkflowErrorCode } from "../../../../workflow-core/src/errors";
// Imported via a relative path to the workflow-core SOURCE (not the
// `@rox/workflow-core` bare specifier) on purpose: in this worktree the
// workspace packages are not symlinked into node_modules, so every bare
// `@rox/*` value import is unresolvable (the sibling `mesh` / `run-pipeline`
// caller suites rely on those symlinks and cannot load here either). A full
// `createCaller` test of `pipeline.runOnce` would have to load `./pipeline` →
// `../../trpc` + `./run-pipeline`, which pull `@rox/db/{client,schema}`,
// `@rox/shared/constants`, `@rox/workflow-runtime`, and `@rox/workflow-core` as
// values — an unmockable resolution wall here (and deps install is out of
// scope). So this characterizes the exact predicate `pipeline.runOnce` branches
// on instead: `validateGraph(pipeline.draftState).valid`. See pipeline.ts:178
// — `if (!validation.valid) throw BAD_REQUEST "Cannot run an invalid pipeline
// graph"` — which is the PR #517 guard. `validateGraph` resolves cleanly from
// source, so the predicate is exercised against the REAL implementation.
import { validateGraph } from "../../../../workflow-core/src/graph/validateGraph";
import type { RoxWorkflowState } from "../../../../workflow-core/src/types";

/** A minimal valid pipeline graph: one start, a reachable response, no cycle. */
const VALID_DRAFT: RoxWorkflowState = {
	blocks: {
		start: { type: "start" },
		out: { type: "response" },
	},
	edges: [{ source: "start", target: "out" }],
	variables: {},
	loops: {},
	parallels: {},
	metadata: { name: "valid" },
};

function draft(
	blocks: RoxWorkflowState["blocks"],
	edges: RoxWorkflowState["edges"] = [],
): RoxWorkflowState {
	return {
		blocks,
		edges,
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "draft" },
	};
}

describe("pipeline.runOnce invalid-graph guard predicate (PR #517 wiring)", () => {
	// `runOnce` (pipeline.ts:178) computes `validateGraph(pipeline.draftState)`
	// and throws BAD_REQUEST "Cannot run an invalid pipeline graph" when
	// `!validation.valid`, BEFORE ever calling `runPipeline`. These pin the
	// `valid` flag the guard reads for each rejectable graph shape.

	test("a graph with no start block is invalid (guard would reject)", () => {
		const result = validateGraph(draft({ lonely: { type: "agent_run" } }));
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.severity === "error")).toBe(true);
		expect(
			result.issues.some(
				(i) => i.code === WorkflowErrorCode.MISSING_START_BLOCK,
			),
		).toBe(true);
	});

	test("an empty graph (no blocks at all) is invalid", () => {
		const result = validateGraph(draft({}));
		expect(result.valid).toBe(false);
	});

	test("a graph with a cycle is invalid", () => {
		const result = validateGraph(
			draft(
				{
					start: { type: "start" },
					a: { type: "agent_run" },
					b: { type: "agent_run" },
				},
				[
					{ source: "start", target: "a" },
					{ source: "a", target: "b" },
					{ source: "b", target: "a" },
				],
			),
		);
		expect(result.valid).toBe(false);
		expect(
			result.issues.some((i) => i.code === WorkflowErrorCode.CYCLE_DETECTED),
		).toBe(true);
	});

	test("an edge pointing at a missing node is invalid", () => {
		const result = validateGraph(
			draft({ start: { type: "start" } }, [
				{ source: "start", target: "ghost" },
			]),
		);
		expect(result.valid).toBe(false);
		expect(
			result.issues.some(
				(i) => i.code === WorkflowErrorCode.INVALID_EDGE_TARGET,
			),
		).toBe(true);
	});

	test("two start blocks is invalid", () => {
		const result = validateGraph(
			draft({ start: { type: "start" }, start2: { type: "start" } }),
		);
		expect(result.valid).toBe(false);
		expect(
			result.issues.some(
				(i) => i.code === WorkflowErrorCode.MULTIPLE_START_BLOCKS,
			),
		).toBe(true);
	});

	test("the minimal start→response graph is valid (guard would proceed to runPipeline)", () => {
		const result = validateGraph(VALID_DRAFT);
		expect(result.valid).toBe(true);
		expect(result.issues.some((i) => i.severity === "error")).toBe(false);
		// When valid, the guard falls through and `runPipeline` runs; the validator
		// also hands back the deterministic execution plan the run path consumes.
		expect(result.executionPlan).toEqual(["start", "out"]);
	});

	test("a lone start block (no work nodes) is still a valid graph", () => {
		const result = validateGraph(draft({ start: { type: "start" } }));
		expect(result.valid).toBe(true);
		expect(result.executionPlan).toEqual(["start"]);
	});
});
