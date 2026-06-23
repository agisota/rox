import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realDbSchema from "@rox/db/schema";
import type { PipelineEvent } from "@rox/workflow-core";

/**
 * Tests for the cross-run trigger-storm guards in `dispatchPipelineEvent`
 * (design §3.3 / §9). The dispatcher is DB-coupled (it walks `parentRunId`
 * ancestry, queries `pipeline_triggers`, dedupes against recent `workflow_runs`,
 * loads the pipeline, and fires `runPipeline`). The three guard DECISIONS are
 * extracted as pure functions (`isLoopReplayEvent`, `evaluateAncestryGuard`,
 * `triggerRefMatchesDispatch`) and unit-tested directly here; the loop-replay
 * SHORT-CIRCUIT is exercised end-to-end through `dispatchPipelineEvent` against a
 * DB mock that throws if any query runs — proving a replay event never touches
 * the DB or fires a run.
 *
 * A full DB-backed dispatch (matching trigger → recursion check → dedupe →
 * validate → runPipeline) needs Neon and is covered by the manual post-merge
 * pipeline run; these tests own the guard logic offline.
 */

// DB mock: any query is a test failure for the loop-replay path (it must return
// before touching the DB). `runPipeline` is stubbed to record dispatches.
const dbThrow = {
	select() {
		throw new Error("dispatcher touched the DB on a short-circuited event");
	},
	insert() {
		throw new Error("dispatcher touched the DB on a short-circuited event");
	},
	update() {
		throw new Error("dispatcher touched the DB on a short-circuited event");
	},
};
mock.module("@rox/db/client", () => ({ db: dbThrow, dbWs: dbThrow }));

mock.module("@rox/db/schema", () => ({
	...realDbSchema,
	pipelineTriggers: {
		organizationId: "pipeline_triggers.organization_id",
		enabled: "pipeline_triggers.enabled",
		triggerKind: "pipeline_triggers.trigger_kind",
		v2ProjectId: "pipeline_triggers.v2_project_id",
	},
	workflowDefinitions: {
		id: "workflow_definitions.id",
		organizationId: "workflow_definitions.organization_id",
		engine: "workflow_definitions.engine",
	},
	workflowRuns: {
		id: "workflow_runs.id",
		workflowId: "workflow_runs.workflow_id",
		organizationId: "workflow_runs.organization_id",
		parentRunId: "workflow_runs.parent_run_id",
		createdAt: "workflow_runs.created_at",
		triggerRef: "workflow_runs.trigger_ref",
	},
}));

let runPipelineCalls: unknown[] = [];
mock.module("./run-pipeline", () => ({
	runPipeline: async (args: unknown) => {
		runPipelineCalls.push(args);
		return { runId: "run-x", status: "succeeded" };
	},
}));

const {
	dispatchPipelineEvent,
	isLoopReplayEvent,
	evaluateAncestryGuard,
	buildDispatchedPipelineRunArgs,
	triggerRefMatchesDispatch,
	MAX_AGENT_RUN_DEPTH,
} = await import("./dispatcher");

function agentRunFinishedEvent(
	overrides: Partial<PipelineEvent> = {},
): PipelineEvent {
	return {
		kind: "agent_run_finished",
		organizationId: "org-1",
		v2ProjectId: "proj-1",
		sourceRunId: "run-source",
		payload: { nodeId: "node-a", roleSlug: "critic" },
		...overrides,
	};
}

beforeEach(() => {
	runPipelineCalls = [];
});

// ── Guard 2: recursion / depth (pure) ───────────────────────────────────────
describe("evaluateAncestryGuard — recursion + depth cap", () => {
	test("DISP-REC-01: refuses a pipeline already in the ancestor chain (cycle)", () => {
		// The triggering run's chain already contains pipeline `wf-self` — firing it
		// again is the self-retrigger storm.
		const ancestry = {
			workflowIds: new Set(["wf-self", "wf-parent"]),
			depth: 2,
		};
		const decision = evaluateAncestryGuard(ancestry, "wf-self");
		expect(decision.allow).toBe(false);
		expect(decision.allow === false && decision.reason).toBe("cycle");
	});

	test("DISP-REC-02: allows a pipeline not yet in the chain (legit fan-out)", () => {
		const ancestry = { workflowIds: new Set(["wf-a"]), depth: 1 };
		expect(evaluateAncestryGuard(ancestry, "wf-b").allow).toBe(true);
	});

	test("DISP-REC-03: refuses once the chain reaches MAX_AGENT_RUN_DEPTH", () => {
		const ancestry = {
			workflowIds: new Set(["wf-a"]),
			depth: MAX_AGENT_RUN_DEPTH,
		};
		const decision = evaluateAncestryGuard(ancestry, "wf-new");
		expect(decision.allow).toBe(false);
		expect(decision.allow === false && decision.reason).toBe("max_depth");
	});

	test("DISP-REC-04: allows at depth just under the cap", () => {
		const ancestry = {
			workflowIds: new Set(["wf-a"]),
			depth: MAX_AGENT_RUN_DEPTH - 1,
		};
		expect(evaluateAncestryGuard(ancestry, "wf-new").allow).toBe(true);
	});
});

// ── Guard 3: short-window dedupe (pure matcher) ──────────────────────────────
describe("triggerRefMatchesDispatch — dedupe key match", () => {
	test("DISP-DEDUP-01: matches same node + same event kind", () => {
		expect(
			triggerRefMatchesDispatch(
				{ nodeId: "node-a", eventKind: "agent_run_finished" },
				"node-a",
				"agent_run_finished",
			),
		).toBe(true);
	});

	test("DISP-DEDUP-02: different node does not match (distinct dispatch)", () => {
		expect(
			triggerRefMatchesDispatch(
				{ nodeId: "node-b", eventKind: "agent_run_finished" },
				"node-a",
				"agent_run_finished",
			),
		).toBe(false);
	});

	test("DISP-DEDUP-03: different event kind does not match", () => {
		expect(
			triggerRefMatchesDispatch(
				{ nodeId: "node-a", eventKind: "user_sent_message" },
				"node-a",
				"agent_run_finished",
			),
		).toBe(false);
	});

	test("DISP-DEDUP-04: null node matches only a null-node ref", () => {
		expect(
			triggerRefMatchesDispatch(
				{ eventKind: "project_initialized" },
				null,
				"project_initialized",
			),
		).toBe(true);
		expect(
			triggerRefMatchesDispatch(
				{ nodeId: "node-a", eventKind: "project_initialized" },
				null,
				"project_initialized",
			),
		).toBe(false);
	});
});

// ── Guard 1: loop-replay re-emit (pure + short-circuit) ──────────────────────
describe("isLoopReplayEvent — loop-replay re-emit detection", () => {
	test("DISP-LOOP-01: iteration >= 1 is a replay", () => {
		expect(
			isLoopReplayEvent(agentRunFinishedEvent({ payload: { iteration: 1 } })),
		).toBe(true);
		expect(
			isLoopReplayEvent(agentRunFinishedEvent({ payload: { iteration: 3 } })),
		).toBe(true);
	});

	test("DISP-LOOP-02: iteration 0 or absent is the settled emit (not a replay)", () => {
		expect(
			isLoopReplayEvent(agentRunFinishedEvent({ payload: { iteration: 0 } })),
		).toBe(false);
		expect(
			isLoopReplayEvent(agentRunFinishedEvent({ payload: { nodeId: "n" } })),
		).toBe(false);
	});
});

describe("dispatchPipelineEvent — loop-replay short-circuit", () => {
	test("DISP-LOOP-03: a replay event (iteration >= 1) never touches the DB or fires a run", async () => {
		// The DB mock throws on any query; reaching the trigger query would fail the
		// test. A replay must return { dispatched: 0 } before any DB access.
		const result = await dispatchPipelineEvent(
			agentRunFinishedEvent({
				payload: { nodeId: "node-a", roleSlug: "critic", iteration: 2 },
			}),
		);
		expect(result).toEqual({ dispatched: 0 });
		expect(runPipelineCalls).toHaveLength(0);
	});

	test("DISP-LOOP-04: a settled (non-replay) event proceeds past the guard and hits the DB", async () => {
		// Boundary proof: the short-circuit is specifically the loop-replay guard,
		// not a blanket no-op. A settled emit (iteration 0) proceeds to the trigger
		// query, which the throwing DB mock surfaces — confirming the guard does not
		// over-block legitimate dispatches.
		await expect(
			dispatchPipelineEvent(
				agentRunFinishedEvent({
					payload: { nodeId: "node-a", roleSlug: "critic", iteration: 0 },
				}),
			),
		).rejects.toThrow("dispatcher touched the DB");
		expect(runPipelineCalls).toHaveLength(0);
	});
});

describe("buildDispatchedPipelineRunArgs — node-entry run handoff", () => {
	test("DISP-ENTRY-01: binds the dispatched run to the trigger row node", () => {
		const args = buildDispatchedPipelineRunArgs({
			organizationId: "org-1",
			userId: "owner-1",
			pipeline: {
				id: "pipe-1",
				ownerUserId: "owner-1",
				v2ProjectId: "proj-1",
				draftState: { blocks: {}, edges: [] },
			},
			triggerKind: "agent_run_finished",
			triggerId: "trigger-1",
			nodeId: "target-node",
			event: agentRunFinishedEvent({
				payload: { message: "resume here", nodeId: "source-node" },
			}),
		});

		expect(args.entryNodeId).toBe("target-node");
		expect(args.input).toEqual({
			message: "resume here",
			nodeId: "source-node",
		});
		expect(args.initialContext.seedMessage).toBe("resume here");
		expect(args.triggerRef).toMatchObject({
			triggerId: "trigger-1",
			nodeId: "target-node",
			eventKind: "agent_run_finished",
		});
	});
});
