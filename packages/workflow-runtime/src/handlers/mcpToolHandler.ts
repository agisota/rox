import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { resolvePromptTemplate } from "./modelHandler";

/**
 * Request handed to the injected MCP-invoke port for an `mcp_tool` block. Kept
 * transport-agnostic so `@rox/workflow-runtime` stays SDK-free: the run-service
 * wires the real MCP layer (Rox's `@rox/mcp-v2` downstream client, see
 * `@rox/trpc` pipeline handlers), unit tests inject a fake. The handler has
 * already expanded `{{path}}` placeholders in the argument values before the
 * request reaches the port.
 */
export interface McpInvokeRequest {
	/** MCP server binding from the node config (`subBlocks.server`). */
	server: string;
	/** Tool name exposed by that server (`subBlocks.tool`). */
	tool: string;
	/** Resolved arguments map (placeholders expanded). */
	args: Record<string, unknown>;
}

export interface McpInvokeResult {
	/** Tool result, shape is MCP-defined (passed through to `out`). */
	result: unknown;
}

/**
 * Impure MCP-invoke port: resolves the bound MCP server, lists/locates the tool,
 * and calls it. Injected by the run-service so the executor stays SDK-free
 * (mirrors {@link import("./ragHandler").RetrievalPort}).
 *
 * Contract: throw {@link McpServerNotFoundError} when the server binding cannot
 * be resolved, or {@link McpToolNotFoundError} when the named tool is not
 * exposed by that server — the handler maps both to a graceful `error` handle.
 * Any other thrown error is treated as an MCP call failure.
 */
export type McpInvokePort = (req: McpInvokeRequest) => Promise<McpInvokeResult>;

/** Marker error: the bound MCP server cannot be resolved. */
export class McpServerNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "McpServerNotFoundError";
	}
}

/** Marker error: the named tool is not exposed by the resolved MCP server. */
export class McpToolNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "McpToolNotFoundError";
	}
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Resolve the argument map for an MCP tool node from the node's configured
 * `arguments` (`subBlocks.arguments`, a key→string map), expanding `{{path}}`
 * placeholders in each value against the merged upstream input. Unlike
 * `tool_call`, MCP tools have a strict server-side input schema, so we pass ONLY
 * the explicitly-configured arguments (not the whole merged input) to avoid
 * sending unexpected fields to the downstream server.
 */
function resolveArgs(
	sub: Record<string, unknown>,
	input: Record<string, unknown>,
): Record<string, unknown> {
	const args: Record<string, unknown> = {};
	const configured =
		sub.arguments != null && typeof sub.arguments === "object"
			? (sub.arguments as Record<string, unknown>)
			: {};
	for (const [key, value] of Object.entries(configured)) {
		const str = asString(value);
		if (str != null) args[key] = resolvePromptTemplate(str, input);
	}
	return args;
}

/**
 * Build the `mcp_tool` block handler. Reads the node config from
 * `block.subBlocks` (the bound MCP server + tool name + argument map), resolves
 * the arguments (placeholders expanded from the merged input), then delegates
 * the actual call to the injected {@link McpInvokePort}. Returns
 * `{ output: { result } }` on success, or routes the failure to the `error`
 * handle — including the explicit "server not bound" / "tool name missing"
 * cases, surfaced rather than returned as a silent empty result.
 */
export function makeMcpToolHandler(invoke: McpInvokePort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const server = asString(sub.server);
		const tool = asString(sub.tool);

		if (server == null || server.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "MCP_SERVER_NOT_BOUND",
					message: "MCP Tool node has no server bound (subBlocks.server).",
					blockId: ctx.blockId,
				},
			};
		}

		if (tool == null || tool.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "MCP_TOOL_NAME_MISSING",
					message:
						"MCP Tool node has no tool name configured (subBlocks.tool).",
					blockId: ctx.blockId,
				},
			};
		}

		const args = resolveArgs(sub, ctx.input);

		try {
			const { result } = await invoke({
				server: server.trim(),
				tool: tool.trim(),
				args,
			});
			return { handle: "out", output: { result } };
		} catch (err) {
			let code = "MCP_TOOL_CALL_FAILED";
			if (err instanceof McpServerNotFoundError) code = "MCP_SERVER_NOT_FOUND";
			else if (err instanceof McpToolNotFoundError) code = "MCP_TOOL_NOT_FOUND";
			return {
				handle: "error",
				error: {
					code,
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
	};
}
