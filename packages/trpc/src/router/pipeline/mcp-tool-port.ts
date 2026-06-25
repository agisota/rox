import { mintUserJwt } from "@rox/auth/server";
import { db } from "@rox/db/client";
import { members, users } from "@rox/db/schema";
import type {
	McpInvokePort,
	McpInvokeRequest,
	McpInvokeResult,
} from "@rox/workflow-runtime/handlers";
import {
	McpServerNotFoundError,
	McpToolNotFoundError,
} from "@rox/workflow-runtime/handlers";
import { eq } from "drizzle-orm";

/**
 * Org/user scope for a pipeline run's tool nodes, threaded into the MCP port so
 * a `tool_call` / `mcp_tool` node only ever reaches the calling org's own MCP
 * sources (mirrors {@link import("./rag-port").RagPortScope}). A pipeline always
 * runs for exactly one organization and one acting user.
 */
export interface McpPortScope {
	organizationId: string;
	userId: string;
	/** Relay URL stamped onto the synthesized MCP context (mirrors agent_run). */
	relayUrl: string;
}

/**
 * The minimal slice of `@rox/mcp-v2` this port depends on. Declared here (not
 * imported as concrete types at module scope) so the pool is injectable in unit
 * tests with a fake, and so loading this module never eagerly pulls the heavy
 * `@rox/mcp-v2` → app-caller graph until a tool node actually runs.
 */
export interface McpToolClient {
	listTools(): Promise<{ tools: { name: string }[] }>;
	callTool(params: {
		name: string;
		arguments?: Record<string, unknown>;
	}): Promise<unknown>;
}

export interface McpToolPool {
	/** Connect every active source for the context org (keyed by slug). */
	connectAll(ctx: McpToolContext): Promise<unknown>;
	/** Look up a connected client by source slug. */
	get(slug: string): McpToolClient | undefined;
	/** All connected sources (slug + client) — used by the tool-name search. */
	getConnected(): { source: { slug: string }; client: McpToolClient }[];
	/** Per-source connection failures, keyed by slug. */
	getFailures(): Map<string, Error>;
	/** Close every connected client. */
	cleanup(): Promise<void>;
}

/**
 * The MCP context shape the pool needs. A structural subset of
 * `@rox/mcp-v2`'s `McpContext` so this module does not import it at the type
 * level just to re-export the same fields.
 */
export interface McpToolContext {
	userId: string;
	email: string;
	organizationId: string;
	organizationIds: string[];
	source: "api-key" | "oauth";
	clientLabel: string | null;
	requestId: string;
	bearerToken: string;
	relayUrl: string;
}

/** Injectable seams so the ports can be unit tested without a DB or live MCP. */
export interface McpPortDeps {
	/** Builds the per-run MCP context (mints the JWT, loads the user's orgs). */
	buildContext?: (scope: McpPortScope) => Promise<McpToolContext>;
	/** Builds a fresh source pool for one tool invocation. */
	makePool?: () => McpToolPool;
}

/**
 * Build the org-scoped MCP context for a pipeline run the same way the HTTP MCP
 * route's `resolveMcpContext` does: load the acting user's email + org
 * memberships and mint a short-lived user JWT. Throws when the user is missing
 * or does not belong to the run's organization — the handler turns that into a
 * graceful `error` handle rather than calling a downstream source unscoped.
 */
async function buildMcpContext(scope: McpPortScope): Promise<McpToolContext> {
	const [user] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, scope.userId))
		.limit(1);
	if (!user) {
		throw new Error(`Pipeline run user "${scope.userId}" not found`);
	}
	const memberships = await db
		.select({ organizationId: members.organizationId })
		.from(members)
		.where(eq(members.userId, scope.userId));
	const organizationIds = [
		...new Set(memberships.map((m) => m.organizationId)),
	];
	if (!organizationIds.includes(scope.organizationId)) {
		throw new Error(
			`Pipeline run user does not belong to organization "${scope.organizationId}"`,
		);
	}

	const bearerToken = await mintUserJwt({
		userId: scope.userId,
		email: user.email,
		organizationIds,
		ttlSeconds: 300,
	});

	return {
		userId: scope.userId,
		email: user.email,
		organizationId: scope.organizationId,
		organizationIds,
		source: "oauth",
		clientLabel: "pipeline-run",
		requestId: crypto.randomUUID(),
		bearerToken,
		relayUrl: scope.relayUrl,
	};
}

/**
 * Default pool factory. Lazily imports `@rox/mcp-v2` so the heavy app-caller
 * graph it pulls in is only evaluated when a tool node actually runs — keeping
 * `handlers.ts` → `run-pipeline.ts` import-cycle-safe and side-effect-free.
 */
function makeDefaultPool(): McpToolPool {
	let pool: McpToolPool | null = null;
	const ensure = async (): Promise<McpToolPool> => {
		if (pool) return pool;
		const { AgentSourcePool } = await import("@rox/mcp-v2");
		pool = new AgentSourcePool() as unknown as McpToolPool;
		return pool;
	};
	return {
		async connectAll(ctx) {
			return (await ensure()).connectAll(ctx);
		},
		get(slug) {
			return pool?.get(slug);
		},
		getConnected() {
			return pool?.getConnected() ?? [];
		},
		getFailures() {
			return pool?.getFailures() ?? new Map();
		},
		async cleanup() {
			if (pool) await pool.cleanup();
		},
	};
}

/**
 * Surface a connect failure for one bound MCP source as a typed not-found so the
 * handler routes to the node's `error` handle with the real downstream reason,
 * not a silent miss.
 */
function failureFor(
	pool: McpToolPool,
	slug: string,
	what: string,
): McpServerNotFoundError {
	const failure = pool.getFailures().get(slug);
	const detail = failure ? `: ${failure.message}` : "";
	return new McpServerNotFoundError(
		`${what} "${slug}" is not available${detail}`,
	);
}

/**
 * Map a downstream `callTool` rejection to the handler's typed errors. The MCP
 * SDK reports an unknown tool as a JSON-RPC error whose message names the tool;
 * we detect that so the node routes to `MCP_TOOL_NOT_FOUND` rather than a
 * generic failure. Any other rejection is a real call failure (re-thrown as-is
 * so the handler maps it to `MCP_TOOL_CALL_FAILED`).
 */
function isToolNotFound(message: string): boolean {
	const m = message.toLowerCase();
	return (
		m.includes("unknown tool") ||
		m.includes("tool not found") ||
		m.includes("no such tool") ||
		(m.includes("method not found") && m.includes("tool"))
	);
}

/**
 * Real MCP-invoke port for the `mcp_tool` block, wired to Rox's existing MCP
 * layer (`@rox/mcp-v2` {@link import("@rox/mcp-v2").AgentSourcePool}). Lives here
 * (not in `@rox/workflow-runtime`) so the executor stays SDK-free — the runtime
 * only sees the injected port.
 *
 * BINDING: the node's `subBlocks.server` is an agent-source **slug** (the
 * editor's `mcpServers` option source is the org's `agent_sources`). The port
 * connects the org's active sources, resolves the bound one by slug, and calls
 * the named tool with the (already placeholder-expanded) arguments. Reuses the
 * same per-source connect/SSRF/credential path the agent MCP proxy uses — no new
 * SDK, no new transport.
 *
 * ERRORS: an unresolved/unreachable server → {@link McpServerNotFoundError}; an
 * unknown tool → {@link McpToolNotFoundError}; any other downstream failure is
 * re-thrown so the handler maps it to `MCP_TOOL_CALL_FAILED`. The pool is always
 * cleaned up.
 */
export function makePipelineMcpInvoke(
	scope: McpPortScope,
	deps: McpPortDeps = {},
): McpInvokePort {
	const buildContext = deps.buildContext ?? buildMcpContext;
	const makePool = deps.makePool ?? makeDefaultPool;
	return async (req: McpInvokeRequest): Promise<McpInvokeResult> => {
		const ctx = await buildContext(scope);
		const pool = makePool();
		try {
			await pool.connectAll(ctx);
			const client = pool.get(req.server);
			if (!client) {
				throw failureFor(pool, req.server, "MCP server");
			}
			try {
				const result = await client.callTool({
					name: req.tool,
					arguments: req.args,
				});
				return { result };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (isToolNotFound(message)) {
					throw new McpToolNotFoundError(
						`Tool "${req.tool}" is not exposed by MCP server "${req.server}": ${message}`,
					);
				}
				throw err;
			}
		} finally {
			await pool.cleanup();
		}
	};
}

/**
 * Real tool-invoke port for the `tool_call` block. Rox has no separate
 * project-tool registry table: a project's callable tools ARE the tools its
 * active MCP sources expose (the same registry the org's agents call). So this
 * port connects the org's active MCP sources, finds the FIRST source whose
 * `listTools()` exposes a tool named `toolId`, and invokes it there with the
 * (already placeholder-expanded) arguments.
 *
 * This is a real execution path over the existing MCP layer — not a stub: it
 * lists tools across the connected sources and dispatches the call. An unknown
 * tool id → {@link import("@rox/workflow-runtime/handlers").ToolNotFoundError}
 * (surfaced on the node's `error` handle, never a silent empty result); any
 * downstream call failure is re-thrown so the handler maps it to
 * `TOOL_CALL_FAILED`. The pool is always cleaned up.
 */
export function makePipelineToolInvoke(
	scope: McpPortScope,
	deps: McpPortDeps = {},
): import("@rox/workflow-runtime/handlers").ToolInvokePort {
	const buildContext = deps.buildContext ?? buildMcpContext;
	const makePool = deps.makePool ?? makeDefaultPool;
	return async (req) => {
		const { ToolNotFoundError } = await import(
			"@rox/workflow-runtime/handlers"
		);
		const ctx = await buildContext(scope);
		const pool = makePool();
		try {
			await pool.connectAll(ctx);
			const connected = pool.getConnected();
			for (const { client } of connected) {
				let names: string[];
				try {
					const listed = await client.listTools();
					names = listed.tools.map((t) => t.name);
				} catch {
					// A source that fails to list is skipped — another may expose the
					// tool. If none does, the not-found below still fires.
					continue;
				}
				if (names.includes(req.toolId)) {
					const result = await client.callTool({
						name: req.toolId,
						arguments: req.args,
					});
					return { result };
				}
			}
			throw new ToolNotFoundError(
				`Tool "${req.toolId}" is not exposed by any of this organization's connected tool sources.`,
			);
		} finally {
			await pool.cleanup();
		}
	};
}
