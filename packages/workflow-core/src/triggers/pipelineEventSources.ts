/**
 * Pure event-shape builders for the two REAL host-originating pipeline event
 * sources (Agent Pipelines, design §4.3 "emit seams"):
 *
 *   1. `user_sent_message`         — a user sent a chat message.
 *   2. `agent_run_finished` (CLI)  — a host terminal/CLI agent finished its run.
 *
 * These complement the already-live producers:
 *   - the in-run executor emit (`emitAgentRunFinished` in `@rox/trpc`) for
 *     `agent_run` NODES completing inside a pipeline run, and
 *   - the dispatcher's own join/barrier (`all_prior_agents_finished`).
 *
 * Both sources fire on the DESKTOP host (chat send seam / terminal lifecycle),
 * whose process talks to a local SQLite DB — NOT the Neon main DB where the
 * `pipeline_triggers` registry + DB-backed dispatcher live. So the host cannot
 * call `dispatchPipelineEvent` directly; it relays a `pipeline.ingestEvent`
 * mutation to the main API, which resolves the org/project server-side and then
 * calls the pure `publishPipelineEvent` half (whose registered sink is the
 * dispatcher). These builders are the deterministic shape the relay endpoint
 * constructs once it has resolved scope — isolated here so the event shape +
 * field mapping is unit-testable with no DB, network, or React.
 *
 * Purity: same discipline as the rest of `@rox/workflow-core` — no DB, no
 * network, no side effects. Just `inputs → PipelineEvent`.
 */

import type { PipelineEvent } from "./triggerMatch";

/** A reference to the host agent run that finished (CLI/terminal session). */
export interface CliAgentRunRef {
	/** Which host runtime executed the agent. CLI agents run in a terminal pty. */
	kind: "terminal" | "chat";
	/** The host terminal/chat session id the agent ran in. */
	sessionId: string;
	/** The role slug the agent fulfilled, when the run carried one. */
	roleSlug?: string;
	/** The pipeline node id that dispatched the agent, when run-scoped. */
	nodeId?: string;
}

/** Resolved scope for a host-originating event (resolved server-side, never
 * trusted from the host). */
export interface PipelineEventScope {
	organizationId: string;
	/** Project the event belongs to; null = org-wide (matches unscoped triggers). */
	v2ProjectId: string | null;
}

/**
 * Build a `user_sent_message` pipeline event from a chat send.
 *
 * The chat `sendMessage` seam (host-service `ChatService`) carries the session
 * id + the submitted message text; the main-API relay resolves `scope` from the
 * chat session before calling this. The event's `chatSessionId` lets a trigger
 * scope to one session (`TriggerMatchConfig.chatSessionId`); `message` seeds the
 * dispatched run's accumulating context (the dispatcher reads `payload.message`).
 */
export function buildUserSentMessageEvent(args: {
	scope: PipelineEventScope;
	chatSessionId: string;
	message: string;
}): PipelineEvent {
	return {
		kind: "user_sent_message",
		organizationId: args.scope.organizationId,
		v2ProjectId: args.scope.v2ProjectId,
		payload: {
			chatSessionId: args.chatSessionId,
			// `message` is not part of TriggerMatchConfig matching, but the dispatcher
			// reads `payload.message` to seed the run's accumulating context.
			message: args.message,
		},
	};
}

/**
 * Build an `agent_run_finished` pipeline event for a CLI/terminal agent that
 * finished on the host (the host lifecycle `agent_end` / terminal `exit`).
 *
 * This is the cross-run feedback signal (e.g. a critic CLI finishing fires an
 * improver node bound with an `agent_run_finished` trigger). Mirrors the payload
 * shape the in-run executor emit (`emitAgentRunFinished`) produces — `nodeId` +
 * `roleSlug` drive `TriggerMatchConfig.afterNodeIds` / `afterRoleSlugs`, and the
 * spawned session id is threaded through for provenance.
 */
export function buildCliAgentRunFinishedEvent(args: {
	scope: PipelineEventScope;
	agentRunRef: CliAgentRunRef;
}): PipelineEvent {
	const { agentRunRef } = args;
	return {
		kind: "agent_run_finished",
		organizationId: args.scope.organizationId,
		v2ProjectId: args.scope.v2ProjectId,
		payload: {
			...(agentRunRef.nodeId != null ? { nodeId: agentRunRef.nodeId } : {}),
			...(agentRunRef.roleSlug != null
				? { roleSlug: agentRunRef.roleSlug }
				: {}),
			// Provenance: the host session the finished agent ran in.
			childSessionId: agentRunRef.sessionId,
			childSessionKind: agentRunRef.kind,
		},
	};
}
