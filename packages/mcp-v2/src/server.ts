import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import {
	AgentSourcePool,
	type AgentSourcePoolOptions,
} from "./agent-source-pool";
import type { McpContext } from "./auth";
import type { McpToolCallEmitter } from "./define-tool";
import {
	type ProxyRegistrationResult,
	registerDegradedSourcesNotice,
	registerProxyTools,
} from "./proxy-tools";
import { registerTools } from "./tools/register";

export interface McpServerOptions {
	onToolCall?: McpToolCallEmitter;
}

export function createMcpServer(options?: McpServerOptions): McpServer {
	const server = new McpServer(
		{ name: "rox-v2", version: packageJson.version },
		{ capabilities: { tools: {} } },
	);
	registerTools(server, { onToolCall: options?.onToolCall });
	return server;
}

export interface CreateProxyMcpServerOptions extends McpServerOptions {
	/** Inject a pre-built pool (e.g. with a mock connector) — defaults to a real pool. */
	pool?: AgentSourcePool;
	/** Pool construction options when no `pool` is supplied. */
	poolOptions?: AgentSourcePoolOptions;
}

/**
 * A `rox-v2` MCP server whose native tools are augmented with proxy tools for
 * the calling organization's agent sources. Tools are exposed under the
 * `mcp__{slug}__{tool}` namespace; calls are forwarded to pooled downstream
 * clients with the original tool name. A source that fails to connect or list
 * tools is isolated (see `result.failures` / `pool.getFailures`) and never
 * blocks the rest.
 *
 * Source selection is run-scoped by `ctx.sourceId`:
 * - when set, attach ONLY that one active source via `pool.connectSelected`
 *   (a stale/cross-org/inactive id degrades to an empty set — a sourceless run,
 *   not an error);
 * - when absent (the default), attach the org's whole active set via
 *   `pool.connectAll`.
 * Both branches share the same per-source connect/retry/failure-isolation policy
 * (`connectSource`), so a scoped run is exactly a one-source slice of the
 * org-wide behaviour.
 *
 * Callers MUST `await cleanup()` to close pooled downstream connections.
 */
export async function createProxyMcpServer(
	ctx: McpContext,
	options: CreateProxyMcpServerOptions = {},
): Promise<{
	server: McpServer;
	pool: AgentSourcePool;
	result: ProxyRegistrationResult;
	cleanup: () => Promise<void>;
}> {
	const server = createMcpServer({ onToolCall: options.onToolCall });
	const pool = options.pool ?? new AgentSourcePool(options.poolOptions);
	// Run-scoping consumer: a run that supplied `sourceId` attaches exactly that
	// source; otherwise the org's whole active set. `connectSelected` returns the
	// single pooled source (or null when nothing resolved), which we normalise to
	// the same `PooledAgentSource[]` shape `registerProxyTools` consumes.
	const connected = ctx.sourceId
		? await pool
				.connectSelected(ctx, ctx.sourceId)
				.then((pooled) => (pooled ? [pooled] : []))
		: await pool.connectAll(ctx);
	const result = await registerProxyTools(server, connected);
	// T7: surface failed downstream sources as a visible note in tools/list
	// instead of silently omitting them (no-op when every source is healthy).
	registerDegradedSourcesNotice(server, result.failures);

	return {
		server,
		pool,
		result,
		cleanup: async () => {
			await pool.cleanup();
			await server.close();
		},
	};
}
