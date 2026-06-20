import type {
	AgentStateChange,
	AgentStateService,
} from "@rox/agent-state/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

/**
 * Host-side tRPC surface for the cross-host agent-state coordination layer
 * (`@rox/agent-state`, WS-D). Strictly additive sub-router: it reads the
 * agent-state service off `ctx.runtime.agentState` (wired in `app.ts`) and never
 * touches any other runtime concern.
 *
 * The runtime object carries `agentState` (added in `app.ts`); the shared
 * `HostServiceRuntime` type lives in a file outside this workstream's ownership,
 * so we narrow `ctx.runtime` locally here rather than widening the shared type.
 */

interface AgentStateRuntimeSlice {
	agentState?: { service: AgentStateService | null } | null;
}

function getService(ctx: HostServiceContext): AgentStateService {
	const slice = ctx.runtime as unknown as AgentStateRuntimeSlice;
	const service = slice.agentState?.service ?? null;
	if (!service) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"The agent-state coordination layer is not enabled on this host (set AGENT_STATE_DB_PATH to enable it).",
		});
	}
	return service;
}

const scopeSchema = z.enum(["workspace", "run", "host"]);

const scopeRefSchema = z.object({
	orgId: z.string().min(1),
	scope: scopeSchema,
	scopeId: z.string().min(1),
});

const entryInputSchema = z.object({
	orgId: z.string().min(1),
	deviceId: z.string().min(1),
	scope: scopeSchema,
	scopeId: z.string().min(1),
	key: z.string().min(1),
	valueJson: z.string(),
	revision: z.number().int().nonnegative().optional(),
	updatedAt: z.number().int().nonnegative().optional(),
});

const presenceInputSchema = z.object({
	deviceId: z.string().min(1),
	orgId: z.string().min(1),
	machineId: z.string().min(1),
	hostKind: z.enum(["local", "cloud"]),
	state: z.enum(["online", "draining", "offline"]),
	lastSeenAt: z.number().int().nonnegative().optional(),
});

export const agentStateRouter = router({
	/** List every entry currently in a scope (cache-first read). */
	getScope: protectedProcedure
		.input(scopeRefSchema)
		.query(({ ctx, input }) => getService(ctx).listScope(input)),

	/** Upsert a single entry under last-writer-wins semantics. */
	setEntry: protectedProcedure
		.input(entryInputSchema)
		.mutation(({ ctx, input }) => getService(ctx).set(input)),

	/** Report/refresh this host's presence. */
	reportPresence: protectedProcedure
		.input(presenceInputSchema)
		.mutation(({ ctx, input }) => getService(ctx).reportPresence(input)),

	/**
	 * Subscribe to changes within a scope over the host service's in-process
	 * change emitter. Cache-first: the first event is the current snapshot.
	 * The generator runs until the client disconnects (or `signal` aborts).
	 */
	subscribeScope: protectedProcedure
		.input(scopeRefSchema)
		.subscription(async function* ({ ctx, input, signal }) {
			const service = getService(ctx);
			const iterator = service.subscribeScope(input)[Symbol.asyncIterator]();
			try {
				while (true) {
					if (signal?.aborted) return;
					const next = await iterator.next();
					if (next.done) return;
					yield next.value satisfies AgentStateChange;
				}
			} finally {
				await iterator.return?.();
			}
		}),
});
