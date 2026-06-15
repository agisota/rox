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
 * every active agent source in the context's organization. Tools are exposed
 * under the `mcp__{slug}__{tool}` namespace; calls are forwarded to pooled
 * downstream clients with the original tool name. A source that fails to
 * connect or list tools is isolated (see `result.failures` / `pool.getFailures`)
 * and never blocks the rest.
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
	const connected = await pool.connectAll(ctx);
	const result = await registerProxyTools(server, connected);

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
