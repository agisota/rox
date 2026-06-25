import { db } from "@rox/db/client";
import { skills, skillVersions } from "@rox/db/schema";
import {
	type AgentRolePreset,
	agentOutputToContextEntry,
	buildAgentRunPrompt,
	type ContextEntry,
	classifyAgentRunError,
	resolveAgentRunNodeConfig,
} from "@rox/workflow-core";
import type {
	AgentRunRequest,
	AgentRunResolver,
	AgentRunResultPort,
} from "@rox/workflow-runtime";
import { and, eq } from "drizzle-orm";
import {
	type RunAgentOnHostArgs,
	type RunAgentOnHostResult,
	runAgentOnHostAndCapture,
} from "./agent-run-host-bridge";

/** Loads a role preset by org + slug (the DB port; injectable for tests). */
export type LoadRolePresetPort = (
	organizationId: string,
	roleSkillSlug: string,
) => Promise<{ preset: AgentRolePreset } | null>;

/** Dispatches the built prompt to the host and captures output (the host port). */
export type RunAgentOnHostPort = (
	args: RunAgentOnHostArgs,
) => Promise<RunAgentOnHostResult>;

export interface MakeAgentRunResolverArgs {
	organizationId: string;
	userId: string;
	v2ProjectId: string | null;
	/** Relay URL for dispatching CLI/terminal agents to the host. */
	relayUrl: string;
	/** The pipeline run id (provenance for the dispatched agent session). */
	runId: string;
	/**
	 * Pre-existing workspace to run every agent_run node in. When null, the first
	 * dispatched node creates a git-worktree workspace on the host and subsequent
	 * nodes in the same run reuse it (see the in-run cache in
	 * {@link makeAgentRunResolver}).
	 */
	initialWorkspaceId?: string | null;
	/**
	 * Injectable ports (default to the real DB lookup + host relay). Exposed so the
	 * resolver's pure composition — prompt build → dispatch → context append →
	 * error mapping — can be unit tested without a DB or a live host.
	 */
	ports?: {
		loadRolePreset?: LoadRolePresetPort;
		runOnHost?: RunAgentOnHostPort;
	};
}

/**
 * Resolve an agent-role skill (`skills(kind="agent")`) + its current version's
 * `agentConfig` preset, scoped to the org. Returns null when the role is
 * missing, not an agent, or has no published preset.
 */
async function loadRolePreset(
	organizationId: string,
	roleSkillSlug: string,
): Promise<{ preset: AgentRolePreset } | null> {
	const [skill] = await db
		.select({ id: skills.id, currentVersionId: skills.currentVersionId })
		.from(skills)
		.where(
			and(
				eq(skills.slug, roleSkillSlug),
				eq(skills.organizationId, organizationId),
				eq(skills.kind, "agent"),
			),
		)
		.limit(1);
	if (!skill?.currentVersionId) return null;
	const [version] = await db
		.select({ agentConfig: skillVersions.agentConfig })
		.from(skillVersions)
		.where(eq(skillVersions.id, skill.currentVersionId))
		.limit(1);
	if (!version?.agentConfig) return null;
	return { preset: version.agentConfig };
}

/**
 * Build the {@link AgentRunResolver} injected into the WorkflowExecutor for an
 * `agent_run` block. It mirrors `dispatchAutomation` (mint JWT → reuse/create a
 * workspace → relay the run to the host), routing chat vs CLI from the role
 * preset's `agentKind` (design §3.2 / §5).
 *
 * The executor stays DB-free + host-free; this resolver carries the DB lookup of
 * the role preset and the host bridge. The PURE pieces — prompt build, output →
 * context mapping, dispatch-target selection, error classification — live in
 * `@rox/workflow-core` (`agentRunBridge`) and are unit tested there. The impure
 * host call lives in `./agent-run-host-bridge`.
 *
 * One worktree per run: the resolver caches the workspace id created by the
 * first dispatched node and threads it into the rest, so all agent nodes in a
 * pipeline run share a single workspace (and its accumulating git state).
 */
export function makeAgentRunResolver(
	args: MakeAgentRunResolverArgs,
): AgentRunResolver {
	// Shared across every agent_run node in this run: the first dispatch creates
	// the workspace (when none was supplied) and later nodes reuse it.
	let runWorkspaceId: string | null = args.initialWorkspaceId ?? null;
	const loadPreset = args.ports?.loadRolePreset ?? loadRolePreset;
	const runOnHost = args.ports?.runOnHost ?? runAgentOnHostAndCapture;

	return async (req: AgentRunRequest): Promise<AgentRunResultPort> => {
		const role = await loadPreset(args.organizationId, req.roleSkillSlug);
		if (!role) {
			return {
				error: {
					code: "AGENT_ROLE_NOT_FOUND",
					message: `Agent role "${req.roleSkillSlug}" not found or has no preset`,
				},
			};
		}

		const { preset } = role;
		// Prompt = role persona + optional per-node template + rendered transcript.
		const prompt = buildAgentRunPrompt({
			preset,
			promptTemplate: req.promptTemplate,
			context: req.context,
		});
		// Merge the node's per-node overrides (NodeInspector #407 — forwarded on the
		// request by the executor) OVER the role preset, within bounds. The pure
		// merge lives in @rox/workflow-core; here we feed it the request fields.
		// `maxTurns`, `model` and `temperature` are ALL transported to the host now
		// (#527): `agents.runAndCapture` accepts model/temperature and a chat agent's
		// runtime switches to the resolved model for the run (see agent-run-host-bridge).
		const config = resolveAgentRunNodeConfig({
			preset,
			subBlocks: {
				...(req.maxTurns != null ? { maxTurns: req.maxTurns } : {}),
				...(req.temperature != null ? { temperature: req.temperature } : {}),
				...(req.modelOverride != null
					? { modelOverride: req.modelOverride }
					: {}),
			},
		});

		try {
			// Cross-process host bridge: resolve host + workspace, relay the run, and
			// block for the captured output (mirrors dispatchAutomation, but the
			// pipeline variant returns the agent's output inline so we can thread it
			// into the accumulating context). See ./agent-run-host-bridge.
			const result = await runOnHost({
				relayUrl: args.relayUrl,
				organizationId: args.organizationId,
				userId: args.userId,
				runId: args.runId,
				v2ProjectId: args.v2ProjectId,
				workspaceId: runWorkspaceId,
				agentKind: config.agentKind,
				agentId: config.agentId,
				prompt,
				// Per-node maxTurns override (when set) already merged over the preset.
				maxTurns: config.maxTurns,
				// Per-node model/temperature (NodeInspector #407), resolved over the
				// preset and now transported to the host runtime (#527). Additive: only
				// sent when the resolved config selected a value.
				...(config.model != null ? { model: config.model } : {}),
				...(config.temperature != null
					? { temperature: config.temperature }
					: {}),
				label: req.roleSkillSlug,
			});

			// Reuse the (possibly freshly created) workspace for downstream nodes.
			runWorkspaceId = result.workspaceId;

			// An empty capture means the agent settled without producing output —
			// surface it as a typed error so the node's errorMode applies (the run
			// doesn't silently absorb an empty turn).
			if (!result.message.trim()) {
				return {
					error: {
						code: "AGENT_NO_OUTPUT",
						message: `Agent role "${req.roleSkillSlug}" produced no output`,
					},
					childRunRef: { kind: result.kind, sessionId: result.sessionId },
				};
			}

			const entry: ContextEntry = agentOutputToContextEntry({
				blockId: req.blockId,
				roleSkillSlug: req.roleSkillSlug,
				agentId: config.agentId,
				message: result.message,
				artifacts: result.artifacts,
			});

			return {
				output: {
					message: entry.message,
					...(result.artifacts && result.artifacts.length > 0
						? { artifacts: result.artifacts }
						: {}),
				},
				appendedContext: [entry],
				childRunRef: { kind: result.kind, sessionId: result.sessionId },
			};
		} catch (cause) {
			// Any host-bridge failure (no host / offline / relay error / no output)
			// becomes a typed, classified error so the executor can apply the node's
			// errorMode (fail_parent vs continue) — design §3.2.
			return { error: classifyAgentRunError(cause) };
		}
	};
}
