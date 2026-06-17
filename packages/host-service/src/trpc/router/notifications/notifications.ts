import type { AgentIdentity } from "@rox/shared/agent-identity";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { terminalSessions } from "../../../db/schema";
import { mapEventType } from "../../../events";
import type { ApiClient } from "../../../types";
import { publicProcedure, router } from "../../index";

/**
 * Relay a CLI/terminal `agent_run_finished` pipeline event to the main API
 * (Agent Pipelines, design §4.3). The host runs on local SQLite and cannot reach
 * the Neon-backed pipeline dispatcher; the main API resolves matching pipeline
 * triggers and fires them. Fire-and-forget: never awaited, never throws into the
 * lifecycle hook. A missing/older API (no `pipeline.ingestEvent`) or a transport
 * error is swallowed — agent lifecycle handling must not depend on a listener.
 *
 * `v2ProjectId` is intentionally omitted: the lifecycle hook doesn't carry the
 * workspace's project, so the event is org-wide (matches unscoped triggers). The
 * pipeline-run path that needs project scope is the in-process executor emit,
 * which already carries it.
 */
function emitCliAgentRunFinished(
	api: ApiClient,
	agentRunRef: {
		kind: "terminal" | "chat";
		sessionId: string;
		roleSlug?: string;
		nodeId?: string;
	},
): void {
	// Guard every hop: a context without an api client (tests) or an older/missing
	// `pipeline` router would otherwise throw SYNCHRONOUSLY (before any `.catch`)
	// and break the lifecycle broadcast. `api` itself can be undefined here, so the
	// chain starts at `api?.` — optional chaining keeps the relay fire-and-forget.
	void api?.pipeline?.ingestEvent
		?.mutate({ kind: "agent_run_finished", agentRunRef })
		?.catch(() => {
			// Best-effort signal — never break the lifecycle broadcast.
		});
}

// Hook scripts emit "" for unset env vars; we coerce to undefined so the
// AgentIdentity broadcast carries only meaningful fields.
const agentIdentityInput = z
	.object({
		agentId: z.string().optional(),
		sessionId: z.string().optional(),
		definitionId: z.string().optional(),
	})
	.optional();

const hookInput = z.object({
	terminalId: z.string().optional(),
	eventType: z.string().optional(),
	agent: agentIdentityInput,
});

function trimOrUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function normalizeAgentIdentity(
	agent: z.infer<typeof agentIdentityInput>,
): AgentIdentity | undefined {
	const agentId = trimOrUndefined(agent?.agentId);
	if (!agentId) return undefined;
	const sessionId = trimOrUndefined(agent?.sessionId);
	const definitionId = trimOrUndefined(agent?.definitionId);
	return {
		agentId: agentId as AgentIdentity["agentId"],
		...(sessionId ? { sessionId } : {}),
		...(definitionId
			? { definitionId: definitionId as AgentIdentity["definitionId"] }
			: {}),
	};
}

export const notificationsRouter = router({
	/**
	 * Agent lifecycle hook. The shell hook POSTs here; we normalize, resolve
	 * the terminal's workspace, and fan out over the WS event bus.
	 *
	 * Intentionally unauthenticated: a caller can only trigger a chime and a
	 * sidebar indicator. Reusing the host-service PSK would leak it into every
	 * agent shell's env for zero practical gain.
	 */
	hook: publicProcedure.input(hookInput).mutation(async ({ ctx, input }) => {
		const eventType = mapEventType(input.eventType);
		if (!eventType) {
			return { success: true, ignored: true as const };
		}

		if (!input.terminalId) {
			return { success: true, ignored: true as const };
		}

		const terminalSession = ctx.db.query.terminalSessions
			.findFirst({
				where: eq(terminalSessions.id, input.terminalId),
				columns: { originWorkspaceId: true },
			})
			.sync();
		if (!terminalSession?.originWorkspaceId) {
			return { success: true, ignored: true as const };
		}

		const agent = normalizeAgentIdentity(input.agent);
		const occurredAt = Date.now();

		ctx.eventBus.broadcastAgentLifecycle({
			workspaceId: terminalSession.originWorkspaceId,
			eventType,
			terminalId: input.terminalId,
			...(agent ? { agent } : {}),
			occurredAt,
		});

		// On `Stop`, emit the `agent_run_finished` pipeline event for CLI/terminal
		// agents (Agent Pipelines, design §4.3). This is the host-lifecycle seam for
		// terminal agents finishing OUTSIDE a pipeline run's blocking capture (the
		// in-process executor agent_run branch already emits it directly for nodes it
		// dispatched). This hook runs in the host-service process on local SQLite,
		// where the DB-backed dispatcher CANNOT run (`pipeline_triggers` is in the
		// Neon main DB), so we relay to the main API over the host's authenticated
		// api client; `pipeline.ingestEvent` fans it out through
		// `publishPipelineEvent` → `dispatchPipelineEvent`. Fire-and-forget: a failing
		// relay must never break the lifecycle broadcast / chime.
		if (eventType === "Stop") {
			emitCliAgentRunFinished(ctx.api, {
				kind: "terminal",
				sessionId: agent?.sessionId ?? input.terminalId,
				// The role slug isn't carried on the lifecycle hook; the agent's
				// definitionId (when present) is the closest stable role handle.
				...(agent?.definitionId ? { roleSlug: agent.definitionId } : {}),
			});
		}

		ctx.terminalAgentStore.recordEvent({
			terminalId: input.terminalId,
			workspaceId: terminalSession.originWorkspaceId,
			eventType,
			...(agent?.agentId ? { agentId: agent.agentId } : {}),
			...(agent?.sessionId ? { agentSessionId: agent.sessionId } : {}),
			...(agent?.definitionId ? { definitionId: agent.definitionId } : {}),
			occurredAt,
		});

		return { success: true, ignored: false as const };
	}),
});
