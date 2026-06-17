import { db } from "@rox/db/client";
import type { TriggerKind } from "@rox/db/enums";
import { pipelineTriggers, workflowDefinitions } from "@rox/db/schema";
import {
	createAccumulatedContext,
	type PipelineEvent,
	type PipelineTriggerEventKind,
	triggerMatches,
} from "@rox/workflow-core";
import { and, eq, isNull, or } from "drizzle-orm";
import type { RunSkillTriggerKind } from "../skill/run-service";
import { runPipeline } from "./run-pipeline";

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
 * Cross-run trigger dispatcher (design §4.2). Given an event emitted on a
 * concrete signal source (chat send, agent finished, project created, …), find
 * every enabled `pipeline_triggers` row whose kind + matchConfig match, and fire
 * each matched pipeline as a run.
 *
 * Fire-and-forget by contract: callers (emit call sites) invoke this without
 * blocking the user path. Failures are swallowed per-trigger so one bad pipeline
 * never breaks the event source.
 */
export async function dispatchPipelineEvent(
	event: PipelineEvent,
): Promise<{ dispatched: number }> {
	const candidateKinds = eventKindToTriggerKinds(event.kind);
	if (candidateKinds.length === 0) return { dispatched: 0 };

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

	const rows = await db
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
			const [pipeline] = await db
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

			// Seed the run with a human-readable description of the firing event.
			const seedMessage =
				typeof event.payload.message === "string"
					? event.payload.message
					: `Triggered by ${event.kind}`;

			// TODO(agent-pipelines): start execution AT row.nodeId (the bound node)
			// rather than the graph's Start node. The executor currently linearizes
			// from Start; node-entry requires either a synthetic Start→nodeId edge or
			// an executor entry-node option. For now we run the whole pipeline graph,
			// which is correct for single-entry pipelines.
			await runPipeline({
				organizationId: event.organizationId,
				userId: pipeline.ownerUserId,
				pipeline,
				// Safe narrowing: the query filtered triggerKind to `candidateKinds`,
				// all of which are members of RunSkillTriggerKind (the cross-run event
				// subset), and `mappedKind` is non-null here.
				triggerKind: row.triggerKind as RunSkillTriggerKind,
				triggerRef: {
					triggerId: row.id,
					nodeId: row.nodeId,
					eventKind: event.kind,
					payload: event.payload,
				},
				input: {},
				initialContext: createAccumulatedContext(seedMessage),
			});
			dispatched++;
		} catch {
			// Never let one pipeline's failure break the event source.
		}
	}

	return { dispatched };
}
