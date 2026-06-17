/**
 * Pure, host-free building blocks for the `agent_run` host bridge.
 *
 * The `agent_run` resolver (in `@rox/trpc`) is the cross-process orchestrator:
 * it mints a JWT, resolves a host + workspace, and relays the run to the
 * desktop host-service. That orchestration is inherently impure (DB + network)
 * and cannot be exercised in a unit test. This module isolates the parts that
 * ARE pure and deterministic so they can be unit-tested directly:
 *
 *   - {@link buildAgentRunPrompt}  — role persona + node template + transcript.
 *   - {@link agentOutputToContextEntry} — host result → accumulating-context entry.
 *   - {@link classifyAgentRunError}     — typed error → {@link AgentRunError} code.
 *   - {@link resolveAgentDispatchTarget} — preset → chat vs terminal dispatch shape.
 *
 * No React, no DB, no network, no side effects — same discipline as the rest of
 * `@rox/workflow-core`.
 */

import {
	type AccumulatedContext,
	type ContextArtifactRef,
	type ContextEntry,
	renderContextForPrompt,
} from "../context/accumulatedContext";
import type { AgentRolePreset } from "./agentRolePreset";

/** Stable error codes surfaced by the `agent_run` resolver. */
export type AgentRunErrorCode =
	/** The role skill was missing, not `kind="agent"`, or had no published preset. */
	| "AGENT_ROLE_NOT_FOUND"
	/** No host could be resolved for the org/user (none linked). */
	| "AGENT_HOST_UNAVAILABLE"
	/** The resolved host is registered but currently offline. */
	| "AGENT_HOST_OFFLINE"
	/** The relay call to the host failed (transport / host error). */
	| "AGENT_DISPATCH_FAILED"
	/** The agent ran but produced no capturable output before the deadline. */
	| "AGENT_NO_OUTPUT";

/** A typed error returned by the resolver (shape matches `WorkflowRunError`). */
export interface AgentRunError {
	code: AgentRunErrorCode;
	message: string;
}

/** How the resolver should dispatch a role, derived purely from its preset. */
export type AgentDispatchTarget =
	/** Rox in-process chat agent — run in the host chat runtime, capture transcript. */
	| { kind: "chat"; agentId: string; maxTurns: number }
	/** Terminal CLI agent — spawn in a git-worktree workspace, capture buffer tail. */
	| {
			kind: "terminal";
			agentId: string;
			maxTurns: number;
			worktreeBranchPrefix?: string;
	  };

/** The default in-process chat agent id (mirrors host `ROX_AGENT_ID`). */
export const ROX_AGENT_ID = "rox";

/** Default cap on agent turns when a role preset omits `settings.maxTurns`. */
export const DEFAULT_AGENT_MAX_TURNS = 8;

/** Hard upper bound for agent pipeline turns before dispatch crosses process boundaries. */
export const MAX_AGENT_MAX_TURNS = 200;

/**
 * Build the prompt fed to the agent for an `agent_run` node. Deterministic
 * composition of three parts (any empty part is dropped), joined by blank lines:
 *
 *   1. the role persona (`preset.systemPrompt`),
 *   2. the optional per-node prompt template (extends/overrides the persona),
 *   3. the rendered accumulating context (seed message + prior node transcript).
 *
 * Stable formatting keeps runs reproducible and is the single source of truth
 * for what the agent sees — the resolver delegates here rather than re-joining.
 */
export function buildAgentRunPrompt(args: {
	preset: Pick<AgentRolePreset, "systemPrompt">;
	promptTemplate?: string;
	context: AccumulatedContext;
}): string {
	const template = args.promptTemplate?.trim();
	return [
		args.preset.systemPrompt.trim() || undefined,
		template ? template : undefined,
		renderContextForPrompt(args.context),
	]
		.filter((part): part is string => Boolean(part))
		.join("\n\n");
}

/**
 * Map a captured agent output into the accumulating-context entry that the
 * executor appends so downstream nodes see this node's contribution.
 *
 * `message` is trimmed; an empty capture collapses to a stable placeholder so
 * the transcript never carries an empty turn (the resolver decides separately
 * whether empty output is an error — see {@link classifyAgentRunError}).
 */
export function agentOutputToContextEntry(args: {
	blockId: string;
	roleSkillSlug: string;
	agentId: string;
	message: string;
	artifacts?: ContextArtifactRef[];
	at?: string;
}): ContextEntry {
	const message = args.message.trim();
	return {
		nodeId: args.blockId,
		role: args.roleSkillSlug,
		agentId: args.agentId,
		message: message.length > 0 ? message : "(no output)",
		...(args.artifacts && args.artifacts.length > 0
			? { artifacts: args.artifacts }
			: {}),
		at: args.at ?? new Date().toISOString(),
	};
}

/**
 * Derive the dispatch target (chat vs terminal) from a role preset. Pure: it
 * only reads the preset — the resolver performs the actual host call. A missing
 * `agentKind` defaults to chat (the safe in-process path); `maxTurns` is clamped
 * to a positive integer and capped at {@link MAX_AGENT_MAX_TURNS}.
 */
export function resolveAgentDispatchTarget(
	preset: AgentRolePreset,
): AgentDispatchTarget {
	const maxTurns = normalizeMaxTurns(preset.settings?.maxTurns);
	if (preset.agentKind === "terminal") {
		return {
			kind: "terminal",
			agentId: preset.agentId || "claude",
			maxTurns,
			...(preset.settings?.worktreeBranchPrefix
				? { worktreeBranchPrefix: preset.settings.worktreeBranchPrefix }
				: {}),
		};
	}
	return {
		kind: "chat",
		agentId: preset.agentId || ROX_AGENT_ID,
		maxTurns,
	};
}

function normalizeMaxTurns(value: number | undefined): number {
	if (value == null || !Number.isFinite(value)) return DEFAULT_AGENT_MAX_TURNS;
	const floored = Math.floor(value);
	if (floored < 1) return DEFAULT_AGENT_MAX_TURNS;
	return Math.min(floored, MAX_AGENT_MAX_TURNS);
}

/**
 * Classify an arbitrary thrown value (or a sentinel string) into a typed
 * {@link AgentRunError}. The resolver wraps its host-bridge call in a try/catch
 * and routes the failure through here so the executor always receives a stable
 * `{ code, message }` shape regardless of where the failure originated.
 */
export function classifyAgentRunError(
	cause: unknown,
	fallbackCode: AgentRunErrorCode = "AGENT_DISPATCH_FAILED",
): AgentRunError {
	const message =
		cause instanceof Error
			? cause.message
			: typeof cause === "string"
				? cause
				: "unknown agent_run failure";
	const lower = message.toLowerCase();
	if (lower.includes("offline")) {
		return { code: "AGENT_HOST_OFFLINE", message };
	}
	if (lower.includes("no host") || lower.includes("host unavailable")) {
		return { code: "AGENT_HOST_UNAVAILABLE", message };
	}
	return { code: fallbackCode, message };
}
