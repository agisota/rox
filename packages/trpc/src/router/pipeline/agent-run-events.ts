import { publishPipelineEvent } from "@rox/workflow-core";
import type { AgentRunFinishedInfo } from "@rox/workflow-runtime";

/**
 * Turn an executor `agent_run` completion into the cross-run pipeline events
 * (design §4.3): one `agent_run_finished` for the node, plus one
 * `file_or_artifact_created` per artifact the agent produced.
 *
 * This is the in-run emit complement to:
 *  - the host `agent:lifecycle` Stop emit (CLI/terminal agents), and
 *  - the dispatcher's own join/barrier (`all_prior_agents_finished`), which is
 *    native executor topology and needs no event.
 *
 * Used by both `runPipeline` (pipeline draft graph) and `runSkill` (published
 * skill graphs that contain `agent_run` nodes). Fire-and-forget — never throws.
 */
export function emitAgentRunFinished(
	scope: {
		organizationId: string;
		v2ProjectId: string | null;
		/** The emitting `workflow_runs.id`. Threaded onto the event as `sourceRunId`
		 * so the dispatcher can chase the parentRun ancestry (recursion guard). */
		runId: string;
	},
	info: AgentRunFinishedInfo,
): void {
	// 1. The node itself finished — fires `agent_run_finished` triggers, the
	//    cross-run feedback signal (e.g. critic → improver in a different node).
	//    `sourceRunId` lets the dispatcher walk the ancestor chain and refuse to
	//    re-fire a pipeline already in it; `iteration` lets it dedupe in-run loop
	//    replays so a settled node fans out at most once (design §3.3).
	publishPipelineEvent({
		kind: "agent_run_finished",
		organizationId: scope.organizationId,
		v2ProjectId: scope.v2ProjectId,
		sourceRunId: scope.runId,
		payload: {
			nodeId: info.blockId,
			roleSlug: info.roleSkillSlug,
			childSessionId: info.childRunRef?.sessionId,
			iteration: info.iteration,
		},
	});

	// 2. Each produced artifact fires `file_or_artifact_created`. Artifacts live
	//    on the node output as `{ artifacts: [{ kind, ref }] }` (the shape the
	//    AgentRunResultPort / ContextEntry carry — design §5). Missing/odd shapes
	//    are skipped silently; this is a best-effort signal, not a validator.
	for (const artifact of extractArtifacts(info.output)) {
		publishPipelineEvent({
			kind: "file_or_artifact_created",
			organizationId: scope.organizationId,
			v2ProjectId: scope.v2ProjectId,
			sourceRunId: scope.runId,
			payload: {
				nodeId: info.blockId,
				artifactKind: artifact.kind,
				path: artifact.ref,
				iteration: info.iteration,
			},
		});
	}
}

/** Best-effort parse of `output.artifacts` into `{ kind, ref }` entries. */
function extractArtifacts(
	output: Record<string, unknown>,
): { kind: string; ref: string }[] {
	const raw = output.artifacts;
	if (!Array.isArray(raw)) return [];
	const out: { kind: string; ref: string }[] = [];
	for (const item of raw) {
		if (item && typeof item === "object") {
			const kind = (item as { kind?: unknown }).kind;
			const ref = (item as { ref?: unknown }).ref;
			if (typeof kind === "string" && typeof ref === "string") {
				out.push({ kind, ref });
			}
		}
	}
	return out;
}
