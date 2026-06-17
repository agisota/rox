import { db } from "@rox/db/client";
import { skills, skillVersions } from "@rox/db/schema";
import {
	type AgentRolePreset,
	appendContextEntry,
	type ContextEntry,
	renderContextForPrompt,
} from "@rox/workflow-core";
import type {
	AgentRunRequest,
	AgentRunResolver,
	AgentRunResultPort,
} from "@rox/workflow-runtime";
import { and, eq } from "drizzle-orm";

export interface MakeAgentRunResolverArgs {
	organizationId: string;
	userId: string;
	v2ProjectId: string | null;
	/** Relay URL for dispatching CLI/terminal agents to the host. */
	relayUrl: string;
	/** The pipeline run id (provenance for the dispatched agent session). */
	runId: string;
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
 * workspace → relay `agents.run` to the host), routing chat vs CLI from the role
 * preset's `agentKind`.
 *
 * The executor stays DB-free + host-free; this resolver carries the DB lookup of
 * the role preset and (TODO) the host bridge. It already renders the
 * accumulating context into the prompt and returns the appended context entry so
 * downstream nodes see the full transcript (design §5).
 */
export function makeAgentRunResolver(
	args: MakeAgentRunResolverArgs,
): AgentRunResolver {
	return async (req: AgentRunRequest): Promise<AgentRunResultPort> => {
		const role = await loadRolePreset(args.organizationId, req.roleSkillSlug);
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
		const renderedContext = renderContextForPrompt(req.context);
		const prompt = [
			preset.systemPrompt,
			req.promptTemplate?.trim() ? req.promptTemplate : undefined,
			renderedContext,
		]
			.filter(Boolean)
			.join("\n\n");

		// TODO(agent-pipelines): dispatch to the host via the relay primitive
		// (mirror packages/trpc/src/router/automation/dispatch.ts):
		//   1. mintUserJwt({ userId, organizationIds:[organizationId], scope:
		//      "pipeline-run", runId, ttlSeconds: 300 })
		//   2. preset.agentKind === "chat"  -> run in-process via host chat runtime
		//      preset.agentKind === "terminal" -> create a git-worktree workspace +
		//      relay "agents.run", read back the final message/diff on
		//      agent:lifecycle Stop (Stage E, host-service).
		// Until the host bridge lands we record a deterministic placeholder output
		// so the executor branch + context accumulation are exercised end-to-end.
		const message = `[agent ${preset.agentId} | role ${req.roleSkillSlug}] pending host execution`;
		void prompt;
		void args.relayUrl;
		void args.userId;
		void args.v2ProjectId;
		void args.runId;

		const entry: ContextEntry = {
			nodeId: req.blockId,
			role: req.roleSkillSlug,
			agentId: preset.agentId,
			message,
			at: new Date().toISOString(),
		};
		// Appending here is belt-and-suspenders; the executor also appends from
		// `appendedContext`. We expose the helper usage to keep the contract clear.
		void appendContextEntry(req.context, entry);

		return {
			output: { message },
			appendedContext: [entry],
		};
	};
}
