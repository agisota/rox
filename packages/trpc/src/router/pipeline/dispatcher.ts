import { dbWs } from "@rox/db/client";
import type { TriggerKind } from "@rox/db/enums";
import {
	pipelineTriggers,
	type SelectWorkflowDefinition,
	workflowDefinitions,
	workflowRuns,
} from "@rox/db/schema";
import {
	createAccumulatedContext,
	type PipelineEvent,
	type PipelineTriggerEventKind,
	triggerMatches,
	validateGraph,
} from "@rox/workflow-core";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { RunSkillTriggerKind } from "../skill/run-service";
import { type RunPipelineArgs, runPipeline } from "./run-pipeline";

/**
 * Hard cap on cross-run agent-pipeline trigger depth (design §3.3 / §9). A
 * dispatched run may itself emit an `agent_run_finished` event that fires another
 * pipeline; this caps how deep that chain may go before the dispatcher refuses to
 * fire. Sibling to `MAX_SKILL_CALL_DEPTH` (the in-process skill-call cap). The
 * in-run loop cap (`MAX_LOOP_ITERATIONS`) bounds a single run; this bounds the
 * cross-run chain those runs form.
 */
export const MAX_AGENT_RUN_DEPTH = 8;

/**
 * Short window (ms) for cross-run dedupe (design §3.3). A burst of identical
 * `agent_run_finished` events (same workflow + node + event kind) within this
 * window fans out at most one triggered run. Backed by a recent-`workflow_runs`
 * lookup rather than an in-memory map because the dispatcher can run in a
 * serverless invocation that does not share process memory across events.
 */
export const DISPATCH_DEDUPE_WINDOW_MS = 5_000;

/**
 * Map a `trigger_kind` pgEnum value to its cross-run pipeline event kind. The
 * five product event triggers reuse existing enum values (design §1.2); enum
 * kinds that aren't cross-run pipeline events return null and are ignored by the
 * dispatcher.
 */
export function triggerKindToEventKind(
	kind: TriggerKind,
): PipelineTriggerEventKind | null {
	switch (kind) {
		case "chat":
			return "user_sent_message";
		case "agent_run_finished":
			return "agent_run_finished";
		case "project_initialized":
			return "project_initialized";
		case "file_uploaded":
			return "file_or_artifact_created";
		case "repo_connected":
		case "service_connected":
			return "service_or_skill_connected";
		default:
			return null;
	}
}

/**
 * Guard 1 (pure): is this a loop-replay re-emit? A finished `agent_run` node
 * re-fired on a bounded in-run feedback-loop replay carries `payload.iteration`
 * ≥ 1; the settled completion (iteration 0, or absent for non-loop nodes) is the
 * one that should fan out. Extracted pure so the short-circuit is unit-testable.
 */
export function isLoopReplayEvent(event: PipelineEvent): boolean {
	const iteration = event.payload.iteration;
	return typeof iteration === "number" && iteration >= 1;
}

/**
 * Guard 2 (pure): given a triggering run's resolved ancestry, decide whether
 * pipeline `workflowId` may fire. Refuses when the pipeline is already in the
 * chain (the self-retrigger cycle) or when the chain is at/over the depth cap.
 * The ancestry I/O (the `parentRunId` walk) is done by `collectRunAncestry`; this
 * pure split lets the cycle-break + depth-cap rules be tested without a DB.
 */
export function evaluateAncestryGuard(
	ancestry: { workflowIds: Set<string>; depth: number },
	workflowId: string,
): { allow: true } | { allow: false; reason: "cycle" | "max_depth" } {
	if (ancestry.workflowIds.has(workflowId)) {
		return { allow: false, reason: "cycle" };
	}
	if (ancestry.depth >= MAX_AGENT_RUN_DEPTH) {
		return { allow: false, reason: "max_depth" };
	}
	return { allow: true };
}

/**
 * Guard 3 (pure): does a recent run's `triggerRef` represent the same triggered
 * dispatch (same node + event kind)? The recency window + query live in
 * `hasRecentDuplicateRun`; this pure matcher is shared and independently tested.
 */
export function triggerRefMatchesDispatch(
	triggerRef: Record<string, unknown> | null | undefined,
	nodeId: string | null,
	eventKind: PipelineTriggerEventKind,
): boolean {
	const ref = triggerRef ?? {};
	const refNodeId = (ref as { nodeId?: unknown }).nodeId;
	const refEventKind = (ref as { eventKind?: unknown }).eventKind;
	const nodeMatches = nodeId == null ? refNodeId == null : refNodeId === nodeId;
	return nodeMatches && refEventKind === eventKind;
}

export function buildDispatchedPipelineRunArgs(args: {
	organizationId: string;
	userId: string;
	pipeline: SelectWorkflowDefinition;
	triggerKind: RunSkillTriggerKind;
	triggerId: string;
	nodeId: string | null;
	event: PipelineEvent;
}): RunPipelineArgs {
	const seedMessage =
		typeof args.event.payload.message === "string"
			? args.event.payload.message
			: `Triggered by ${args.event.kind}`;

	return {
		organizationId: args.organizationId,
		userId: args.userId,
		pipeline: args.pipeline,
		triggerKind: args.triggerKind,
		parentRunId: args.event.sourceRunId,
		entryNodeId: args.nodeId ?? undefined,
		triggerRef: {
			triggerId: args.triggerId,
			nodeId: args.nodeId,
			eventKind: args.event.kind,
			payload: args.event.payload,
			...(args.event.sourceRunId != null
				? { sourceRunId: args.event.sourceRunId }
				: {}),
			...(typeof args.event.payload.triggeredByUserId === "string"
				? { triggeredByUserId: args.event.payload.triggeredByUserId }
				: {}),
		},
		input: args.event.payload,
		initialContext: createAccumulatedContext(seedMessage),
	};
}

/** Map an event kind back to the candidate `trigger_kind` enum values to query. */
function eventKindToTriggerKinds(
	kind: PipelineTriggerEventKind,
): TriggerKind[] {
	switch (kind) {
		case "user_sent_message":
			return ["chat"];
		case "agent_run_finished":
			return ["agent_run_finished"];
		case "project_initialized":
			return ["project_initialized"];
		case "file_or_artifact_created":
			return ["file_uploaded"];
		case "service_or_skill_connected":
			return ["repo_connected", "service_connected"];
		default:
			return [];
	}
}

/**
 * Walk the `parentRunId` ancestor chain of `sourceRunId`, collecting each
 * ancestor's `workflowId` and counting the depth. Bounded: stops after
 * `MAX_AGENT_RUN_DEPTH + 1` hops (enough to detect "already at/over the cap")
 * and on a null parent / missing row / a cycle (a self/duplicate parent ref).
 *
 * Returns the set of pipeline `workflowId`s already in the chain plus the chain
 * length, so the caller can refuse to re-fire a pipeline already present (cycle
 * break) or fire past the depth cap. `dbWs` (pooled WS) matches the event-path
 * write client.
 */
async function collectRunAncestry(
	sourceRunId: string,
): Promise<{ workflowIds: Set<string>; depth: number }> {
	const workflowIds = new Set<string>();
	const seen = new Set<string>();
	let currentId: string | null = sourceRunId;
	let depth = 0;

	// One extra hop beyond the cap lets the caller see depth > MAX and refuse.
	while (currentId != null && depth <= MAX_AGENT_RUN_DEPTH + 1) {
		if (seen.has(currentId)) break; // defensive: a cycle in the chain.
		seen.add(currentId);

		const [row]: { workflowId: string | null; parentRunId: string | null }[] =
			await dbWs
				.select({
					workflowId: workflowRuns.workflowId,
					parentRunId: workflowRuns.parentRunId,
				})
				.from(workflowRuns)
				.where(eq(workflowRuns.id, currentId))
				.limit(1);
		if (!row) break;
		if (row.workflowId) workflowIds.add(row.workflowId);
		currentId = row.parentRunId;
		depth++;
	}

	return { workflowIds, depth };
}

/**
 * Short-window dedupe (design §3.3). True when an identical triggered run —
 * same pipeline (`workflowId`), same triggering node (`triggerRef.nodeId`), same
 * event kind (`triggerRef.eventKind`) — was created within
 * `DISPATCH_DEDUPE_WINDOW_MS`. A burst of identical `agent_run_finished` events
 * (e.g. re-emits) then fans out at most one run for that pipeline+node+kind.
 */
async function hasRecentDuplicateRun(args: {
	workflowId: string;
	organizationId: string;
	nodeId: string | null;
	eventKind: PipelineTriggerEventKind;
}): Promise<boolean> {
	const since = new Date(Date.now() - DISPATCH_DEDUPE_WINDOW_MS);
	const recent = await dbWs
		.select({ triggerRef: workflowRuns.triggerRef })
		.from(workflowRuns)
		.where(
			and(
				eq(workflowRuns.workflowId, args.workflowId),
				eq(workflowRuns.organizationId, args.organizationId),
				gt(workflowRuns.createdAt, since),
			),
		)
		.orderBy(desc(workflowRuns.createdAt))
		.limit(20);

	return recent.some((r) =>
		triggerRefMatchesDispatch(r.triggerRef, args.nodeId, args.eventKind),
	);
}

/**
 * Cross-run trigger dispatcher (design §4.2). Given an event emitted on a
 * concrete signal source (chat send, agent finished, project created, …), find
 * every enabled `pipeline_triggers` row whose kind + matchConfig match, and fire
 * each matched pipeline as a run.
 *
 * Three guards keep a pipeline with an `agent_run` node + a permissive
 * `agent_run_finished` trigger from re-triggering itself forever (design §3.3):
 *   1. LOOP-REPLAY: events from in-run feedback-loop replays (`payload.iteration`
 *      ≥ 1) are ignored — only the settled (iteration 0 / absent) emit dispatches.
 *   2. RECURSION/DEPTH: the triggering run's `parentRunId` ancestry is walked; a
 *      pipeline already in the chain is refused (cycle break) and the chain may
 *      not exceed `MAX_AGENT_RUN_DEPTH`.
 *   3. DEDUPE: a burst of identical events fans out at most one run per
 *      (workflow, node, eventKind) within `DISPATCH_DEDUPE_WINDOW_MS`.
 *
 * Fire-and-forget by contract: callers (emit call sites) invoke this without
 * blocking the user path. Failures are swallowed per-trigger (and logged) so one
 * bad pipeline never breaks the event source.
 */
export async function dispatchPipelineEvent(
	event: PipelineEvent,
): Promise<{ dispatched: number }> {
	const candidateKinds = eventKindToTriggerKinds(event.kind);
	if (candidateKinds.length === 0) return { dispatched: 0 };

	// Guard 1 — loop-replay amplification: a finished agent_run node re-fired on a
	// bounded in-run loop replay carries iteration ≥ 1. The settled completion
	// (iteration 0 or absent for non-loop nodes) is the one that should fan out;
	// replays are ignored so one node doesn't dispatch one run per loop iteration.
	if (isLoopReplayEvent(event)) {
		return { dispatched: 0 };
	}

	// Guard 2 (part A) — resolve the triggering run's ancestry once for this event.
	// Empty when the event has no sourceRunId (host-originating events that aren't
	// tied to a pipeline run) — those start a fresh chain.
	const ancestry = event.sourceRunId
		? await collectRunAncestry(event.sourceRunId)
		: { workflowIds: new Set<string>(), depth: 0 };

	// Project scope: a trigger with a null v2ProjectId matches any project; a
	// scoped trigger matches only its own project.
	const projectScope = event.v2ProjectId
		? or(
				eq(pipelineTriggers.v2ProjectId, event.v2ProjectId),
				isNull(pipelineTriggers.v2ProjectId),
			)
		: isNull(pipelineTriggers.v2ProjectId);

	// `or(...)` accepts one or more conditions; mapping avoids array-index
	// narrowing issues and handles the single- and multi-kind cases uniformly.
	const kindFilter = or(
		...candidateKinds.map((k) => eq(pipelineTriggers.triggerKind, k)),
	);

	const rows = await dbWs
		.select()
		.from(pipelineTriggers)
		.where(
			and(
				eq(pipelineTriggers.organizationId, event.organizationId),
				eq(pipelineTriggers.enabled, true),
				kindFilter,
				projectScope,
			),
		);

	let dispatched = 0;
	for (const row of rows) {
		const mappedKind = triggerKindToEventKind(row.triggerKind);
		if (!mappedKind || mappedKind !== event.kind) continue;
		if (!triggerMatches(row.matchConfig, mappedKind, event)) continue;

		try {
			// Guard 2 (part B) — recursion / depth. Refuse to re-fire a pipeline that
			// is already in the triggering run's ancestor chain (the self-retrigger
			// cycle) or that would push the chain past the depth cap.
			const ancestryDecision = evaluateAncestryGuard(ancestry, row.workflowId);
			if (!ancestryDecision.allow) {
				console.warn(
					ancestryDecision.reason === "cycle"
						? "[pipeline-dispatch] skip: pipeline already in run chain"
						: "[pipeline-dispatch] skip: max agent-run depth reached",
					{
						triggerId: row.id,
						workflowId: row.workflowId,
						sourceRunId: event.sourceRunId,
						depth: ancestry.depth,
						max: MAX_AGENT_RUN_DEPTH,
					},
				);
				continue;
			}

			// Guard 3 — short-window dedupe. Skip when an identical-trigger run for
			// this pipeline+node+kind already started within the dedupe window.
			if (
				await hasRecentDuplicateRun({
					workflowId: row.workflowId,
					organizationId: event.organizationId,
					nodeId: row.nodeId,
					eventKind: event.kind,
				})
			) {
				continue;
			}

			const [pipeline] = await dbWs
				.select()
				.from(workflowDefinitions)
				.where(
					and(
						eq(workflowDefinitions.id, row.workflowId),
						eq(workflowDefinitions.organizationId, event.organizationId),
						eq(workflowDefinitions.engine, "pipeline"),
					),
				)
				.limit(1);
			if (!pipeline) continue;

			// Mirror `runOnce`: never dispatch an invalid graph. Skip + log so one
			// broken pipeline definition doesn't throw into the event source.
			const validation = validateGraph(pipeline.draftState);
			if (!validation.valid) {
				console.warn("[pipeline-dispatch] skip: invalid pipeline graph", {
					triggerId: row.id,
					workflowId: row.workflowId,
					issues: validation.issues,
				});
				continue;
			}

			await runPipeline(
				buildDispatchedPipelineRunArgs({
					organizationId: event.organizationId,
					userId: pipeline.ownerUserId,
					pipeline,
					// Safe narrowing: the query filtered triggerKind to `candidateKinds`,
					// all of which are members of RunSkillTriggerKind (the cross-run event
					// subset), and `mappedKind` is non-null here.
					triggerKind: row.triggerKind as RunSkillTriggerKind,
					triggerId: row.id,
					nodeId: row.nodeId,
					event,
				}),
			);
			dispatched++;
		} catch (err) {
			// Never let one pipeline's failure break the event source. Log so a
			// misconfigured trigger is diagnosable instead of silently swallowed.
			console.warn("[pipeline-dispatch] trigger failed", {
				triggerId: row.id,
				workflowId: row.workflowId,
				err,
			});
		}
	}

	return { dispatched };
}
