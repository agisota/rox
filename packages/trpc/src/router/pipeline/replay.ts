import type { SelectWorkflowDefinition } from "@rox/db/schema";
import {
	type AccumulatedContext,
	createAccumulatedContext,
} from "@rox/workflow-core";
import type { RunPipelineArgs } from "./run-pipeline";

/** A `workflow_runs` row as loaded for replay (the columns replay reads). */
export type ReplaySourceRun = {
	id: string;
	input: Record<string, unknown> | null;
	accumulatedContext: AccumulatedContext | null;
};

/**
 * Build the {@link runPipeline} args for a replay from a source run (issue #553).
 * Pure (no DB, no ctx, no env) so the replay provenance contract can be
 * unit-tested without the trpc router's module-load env validation. The caller
 * (`pipeline.replayRun`) overrides `input`/`entryNodeId` afterwards for a
 * re-run-from-step.
 *
 * Provenance: `parentRunId` = the source run (links the replay to its origin),
 * and a `replay`-marked `triggerRef` so the trace UI / dispatcher can identify a
 * replay. `triggerKind` stays "manual" — a replay is a manually-fired re-run.
 */
export function buildReplayArgs(params: {
	organizationId: string;
	userId: string;
	pipeline: SelectWorkflowDefinition;
	sourceRun: ReplaySourceRun;
	fromStepBlockId?: string;
}): RunPipelineArgs {
	const { organizationId, userId, pipeline, sourceRun, fromStepBlockId } =
		params;
	// Reuse the source run's seed message so the replay starts from the same
	// originating context; fall back to an empty seed if none was persisted.
	const initialContext: AccumulatedContext = sourceRun.accumulatedContext
		? { seedMessage: sourceRun.accumulatedContext.seedMessage, entries: [] }
		: createAccumulatedContext("");
	return {
		organizationId,
		userId,
		pipeline,
		triggerKind: "manual",
		triggerRef: {
			replay: true,
			sourceRunId: sourceRun.id,
			...(fromStepBlockId ? { fromStepBlockId } : {}),
		},
		input: sourceRun.input ?? {},
		parentRunId: sourceRun.id,
		initialContext,
	};
}
