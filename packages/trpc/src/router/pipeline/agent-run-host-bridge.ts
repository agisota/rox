import { mintUserJwt } from "@rox/auth/server";
import { dbWs } from "@rox/db/client";
import { users, v2Hosts, v2UsersHosts } from "@rox/db/schema";
import { buildHostRoutingKey } from "@rox/shared/host-routing";
import {
	deduplicateBranchName,
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@rox/shared/workspace-launch";
import { and, eq } from "drizzle-orm";
import { RelayDispatchError, relayMutation } from "../automation/relay-client";

/**
 * Main-side (Neon API) half of the `agent_run` host bridge.
 *
 * This mirrors `dispatchAutomation` (packages/trpc/src/router/automation/
 * dispatch.ts): mint a scoped JWT → resolve the target host → reuse or create a
 * git-worktree workspace → relay the run to the desktop host-service. The one
 * difference is that pipelines need the agent's OUTPUT back inline (to thread
 * into the accumulating context), so it relays `agents.runAndCapture` — a
 * blocking variant of `agents.run` that waits for completion and returns the
 * captured transcript/diff (see the host-side handler in
 * packages/host-service/src/trpc/router/agents/agents.ts).
 *
 * The DB lookups + relay call are inherently impure; the pure prompt/context/
 * error logic lives in `@rox/workflow-core` (`agentRunBridge`) and is unit
 * tested there. This module is exercised through the cross-process integration
 * path (host present), not unit tests.
 */

/** The agent kind selected by the resolver from the role preset. */
export type HostBridgeAgentKind = "chat" | "terminal";

export interface RunAgentOnHostArgs {
	/** Relay base URL (env.RELAY_URL). */
	relayUrl: string;
	/** Org owning the pipeline run (host routing + JWT scope). */
	organizationId: string;
	/** User the run acts on behalf of (host resolution + JWT subject). */
	userId: string;
	/** Pipeline run id — provenance threaded into the JWT + branch name. */
	runId: string;
	/** Project the pipeline targets, when project-scoped (workspace creation). */
	v2ProjectId: string | null;
	/** Reuse this workspace when set; otherwise create a fresh worktree. */
	workspaceId: string | null;
	/** chat (rox in-process) vs terminal (CLI in a worktree). */
	agentKind: HostBridgeAgentKind;
	/** Agent id: ROX_AGENT_ID for chat, a CLI id ("claude"/"codex"/…) for terminal. */
	agentId: string;
	/** The fully-built prompt (persona + node template + rendered transcript). */
	prompt: string;
	/** Max agent turns before the host forces a stop. */
	maxTurns: number;
	/** Human-readable label for the created workspace / branch slug. */
	label: string;
}

/** Output captured from the host after the agent finished. */
export interface RunAgentOnHostResult {
	/** chat | terminal — which runtime executed the agent. */
	kind: HostBridgeAgentKind;
	/** The spawned chat/terminal session id (provenance for childRunRef). */
	sessionId: string;
	/** The captured agent output text (assistant transcript tail / buffer tail). */
	message: string;
	/** Artifacts the agent reported producing, when any. */
	artifacts?: { kind: string; ref: string }[];
	/** The workspace the agent ran in (reused or freshly created). */
	workspaceId: string;
}

/** Raised when no usable host can be resolved for the org/user. */
export class AgentHostUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentHostUnavailableError";
	}
}

/**
 * Resolve a host + workspace and relay the agent run to it, blocking for the
 * captured output. Mirrors `dispatchAutomation`'s resolve→workspace→relay shape.
 *
 * Throws on failure (no host → {@link AgentHostUnavailableError} with "no host"
 * / "offline" in the message so the resolver can classify it; relay failure →
 * {@link RelayDispatchError}). The caller (`makeAgentRunResolver`) wraps this in
 * a try/catch and routes through `classifyAgentRunError`.
 */
export async function runAgentOnHostAndCapture(
	args: RunAgentOnHostArgs,
): Promise<RunAgentOnHostResult> {
	const host = await resolveTargetHost(args.organizationId, args.userId);
	if (!host) {
		throw new AgentHostUnavailableError("no host available");
	}
	if (!host.isOnline) {
		throw new AgentHostUnavailableError("target host offline");
	}

	const [owner] = await dbWs
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, args.userId))
		.limit(1);

	const jwt = await mintUserJwt({
		userId: args.userId,
		email: owner?.email,
		organizationIds: [args.organizationId],
		scope: "pipeline-run",
		runId: args.runId,
		ttlSeconds: 300,
	});

	const routingKey = buildHostRoutingKey(args.organizationId, host.machineId);

	let workspaceId = args.workspaceId;
	if (!workspaceId) {
		if (!args.v2ProjectId) {
			// Terminal agents need a worktree; without a project we cannot create one.
			// Chat agents could in principle run project-less, but the host
			// chat/terminal session is workspace-scoped, so a workspace is required.
			throw new AgentHostUnavailableError(
				"pipeline run has no project to create a workspace in",
			);
		}
		workspaceId = await createWorkspaceOnHost({
			relayUrl: args.relayUrl,
			hostId: routingKey,
			jwt,
			projectId: args.v2ProjectId,
			label: args.label,
			runId: args.runId,
		});
	}

	const result = await relayMutation<
		{
			workspaceId: string;
			agent: string;
			prompt: string;
			maxTurns: number;
		},
		{
			kind: HostBridgeAgentKind;
			sessionId: string;
			message: string;
			artifacts?: { kind: string; ref: string }[];
		}
	>(
		{
			relayUrl: args.relayUrl,
			hostId: routingKey,
			jwt,
			// A blocking agent run (chat turn or CLI invocation) can take minutes;
			// give it the same generous ceiling workspace creation uses.
			timeoutMs: 180_000,
		},
		"agents.runAndCapture",
		{
			workspaceId,
			agent: args.agentId,
			prompt: args.prompt,
			maxTurns: args.maxTurns,
		},
	);

	return {
		kind: result.kind,
		sessionId: result.sessionId,
		message: result.message,
		...(result.artifacts && result.artifacts.length > 0
			? { artifacts: result.artifacts }
			: {}),
		workspaceId,
	};
}

/**
 * Pick a host for the org/user: the most-recently-updated online host the user
 * is linked to. Mirrors `dispatchAutomation.resolveTargetHost`'s default branch.
 */
async function resolveTargetHost(
	organizationId: string,
	userId: string,
): Promise<{ machineId: string; isOnline: boolean } | null> {
	const [host] = await dbWs
		.select({
			machineId: v2Hosts.machineId,
			isOnline: v2Hosts.isOnline,
		})
		.from(v2Hosts)
		.innerJoin(
			v2UsersHosts,
			and(
				eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
				eq(v2UsersHosts.hostId, v2Hosts.machineId),
			),
		)
		.where(
			and(
				eq(v2UsersHosts.userId, userId),
				eq(v2Hosts.organizationId, organizationId),
				eq(v2Hosts.isOnline, true),
			),
		)
		.orderBy(v2Hosts.updatedAt)
		.limit(1);

	return host ?? null;
}

/**
 * Create a git-worktree workspace on the host for this agent run. Mirrors
 * `dispatchAutomation.createWorkspaceOnHost` — readable, collision-free branch
 * name derived from the node label + a second-precision timestamp + run id.
 */
async function createWorkspaceOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	projectId: string;
	label: string;
	runId: string;
}): Promise<string> {
	const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
	const baseSlug = slugifyForBranch(args.label, 24);
	const runSuffix = args.runId.slice(0, 8);
	const candidateBranch = sanitizeBranchNameWithMaxLength(
		baseSlug
			? `pipe-${baseSlug}-${timestamp}-${runSuffix}`
			: `pipe-${timestamp}-${runSuffix}`,
		60,
	);
	const branchName = deduplicateBranchName(candidateBranch, []);
	const workspaceName = (args.label || "Pipeline agent").slice(0, 100);

	const result = await relayMutation<
		{ projectId: string; name: string; branch: string },
		{ workspace: { id: string } }
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
			// Workspace creation does git clone + worktree setup — give it real room.
			timeoutMs: 90_000,
		},
		"workspaces.create",
		{
			projectId: args.projectId,
			name: workspaceName,
			branch: branchName,
		},
	);

	return result.workspace.id;
}

/** Narrow a thrown value to the relay transport error (re-exported for callers). */
export { RelayDispatchError };
