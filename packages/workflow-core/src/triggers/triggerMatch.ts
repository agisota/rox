/**
 * Pipeline trigger matching for Agent Pipelines.
 *
 * A pipeline node fires when an event matches a registered trigger. The trigger
 * registry (`pipeline_triggers` in `@rox/db`) stores a `TriggerMatchConfig` per
 * node; the dispatcher evaluates `triggerMatches` against an incoming
 * `PipelineEvent`.
 *
 * Five of the six product triggers are cross-run events handled here. The sixth,
 * `all_prior_agents_finished`, is a graph JOIN (native executor barrier on a
 * node's incoming edges) — NOT an event kind, so it is intentionally absent
 * from `PipelineTriggerEventKind`.
 *
 * Pure, deterministic, unit-testable. No DB, no React, no side effects.
 */

/**
 * Cross-run event kinds that can fire a pipeline node. These map onto the
 * existing `triggerKindValues` pgEnum in `@rox/db` (see the design spec §1.2).
 */
export type PipelineTriggerEventKind =
	| "user_sent_message"
	| "agent_run_finished"
	| "project_initialized"
	| "file_or_artifact_created"
	| "service_or_skill_connected";

/** All cross-run event kinds, for iteration / validation. */
export const PIPELINE_TRIGGER_EVENT_KINDS: readonly PipelineTriggerEventKind[] =
	[
		"user_sent_message",
		"agent_run_finished",
		"project_initialized",
		"file_or_artifact_created",
		"service_or_skill_connected",
	] as const;

/**
 * Event-specific match predicate persisted per trigger row. Every field is
 * optional; an empty config matches any event of the row's `triggerKind`.
 */
export interface TriggerMatchConfig {
	/** user_sent_message: restrict to a chat session. */
	chatSessionId?: string;
	/** agent_run_finished: only fire after these upstream node ids. */
	afterNodeIds?: string[];
	/** agent_run_finished: only fire after these role slugs. */
	afterRoleSlugs?: string[];
	/** file_or_artifact_created: glob the file/artifact path must match. */
	pathGlob?: string;
	/** file_or_artifact_created: artifact kind to match. */
	artifactKind?: string;
	/** service_or_skill_connected: skill slug to match. */
	skillSlug?: string;
	/** service_or_skill_connected: integration id to match. */
	integrationId?: string;
}

/** An event emitted on a concrete signal source, fanned out to the dispatcher. */
export interface PipelineEvent {
	kind: PipelineTriggerEventKind;
	organizationId: string;
	v2ProjectId?: string | null;
	/**
	 * The `workflow_runs.id` of the run that emitted this event, when the source
	 * is an in-run emit (a finished `agent_run` node). Threaded so the dispatcher
	 * can chase the `parentRunId` ancestry and refuse to re-fire a pipeline that
	 * already appears in the chain (recursion/depth guard, design §3.3 / §9).
	 * Absent for host-originating events that aren't tied to a pipeline run.
	 */
	sourceRunId?: string;
	/** Event-specific payload (chat session, node id, artifact, skill, …). */
	payload: PipelineEventPayload;
}

/** Loosely-typed, event-specific payload. Fields populated per `kind`. */
export interface PipelineEventPayload {
	chatSessionId?: string;
	nodeId?: string;
	roleSlug?: string;
	path?: string;
	artifactKind?: string;
	skillSlug?: string;
	integrationId?: string;
	[key: string]: unknown;
}

/**
 * Minimal glob matcher supporting `*` (any run of non-`/`), `**` (any run incl.
 * `/`), and `?` (single char). Anchored full-string match. Pure + deterministic.
 */
function globMatches(glob: string, value: string): boolean {
	let re = "";
	for (let i = 0; i < glob.length; i++) {
		const ch = glob.charAt(i);
		if (ch === "*") {
			if (glob.charAt(i + 1) === "*") {
				re += ".*";
				i++;
			} else {
				re += "[^/]*";
			}
		} else if (ch === "?") {
			re += "[^/]";
		} else {
			re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(`^${re}$`).test(value);
}

/**
 * Pure predicate: does this registry row's config match this event?
 *
 * `kind` is the trigger row's mapped event kind (the dispatcher resolves the
 * pgEnum `triggerKind` to a `PipelineTriggerEventKind` before calling this).
 */
export function triggerMatches(
	cfg: TriggerMatchConfig,
	kind: PipelineTriggerEventKind,
	event: PipelineEvent,
): boolean {
	if (event.kind !== kind) return false;

	switch (kind) {
		case "user_sent_message": {
			if (
				cfg.chatSessionId &&
				cfg.chatSessionId !== event.payload.chatSessionId
			)
				return false;
			return true;
		}
		case "agent_run_finished": {
			const nodeOk =
				!cfg.afterNodeIds?.length ||
				(event.payload.nodeId != null &&
					cfg.afterNodeIds.includes(event.payload.nodeId));
			const roleOk =
				!cfg.afterRoleSlugs?.length ||
				(event.payload.roleSlug != null &&
					cfg.afterRoleSlugs.includes(event.payload.roleSlug));
			return nodeOk && roleOk;
		}
		case "project_initialized": {
			// Project scoping is enforced by the dispatcher's query; no extra match.
			return true;
		}
		case "file_or_artifact_created": {
			if (cfg.artifactKind && cfg.artifactKind !== event.payload.artifactKind)
				return false;
			if (cfg.pathGlob) {
				const path = event.payload.path;
				if (typeof path !== "string" || !globMatches(cfg.pathGlob, path))
					return false;
			}
			return true;
		}
		case "service_or_skill_connected": {
			if (cfg.skillSlug && cfg.skillSlug !== event.payload.skillSlug)
				return false;
			if (
				cfg.integrationId &&
				cfg.integrationId !== event.payload.integrationId
			)
				return false;
			return true;
		}
		default: {
			// Exhaustiveness guard — unknown kinds never match.
			const _exhaustive: never = kind;
			return _exhaustive;
		}
	}
}
