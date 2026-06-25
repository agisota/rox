import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { resolvePromptTemplate } from "./modelHandler";

/**
 * Request handed to the injected tool-invoke port for a `tool_call` block. Kept
 * registry-agnostic so `@rox/workflow-runtime` stays DB/SDK-free: the run-service
 * wires the real project-tool registry (see `@rox/trpc` pipeline handlers), unit
 * tests inject a fake. The handler has already expanded `{{path}}` placeholders
 * in the argument values before the request reaches the port.
 */
export interface ToolInvokeRequest {
	/** Registered tool id/name from the node config (`subBlocks.tool`). */
	toolId: string;
	/** Resolved arguments map (placeholders expanded, merged with run input). */
	args: Record<string, unknown>;
}

export interface ToolInvokeResult {
	/** Tool output, shape is provider-defined (passed through to `out`). */
	result: unknown;
}

/**
 * Impure tool-invoke port: looks up the registered project tool by id and runs
 * it. Injected by the run-service so the executor stays registry-free (mirrors
 * {@link import("./ragHandler").RetrievalPort}).
 *
 * Contract: throw {@link ToolNotFoundError} (or any error whose message explains
 * the miss) when the tool id is not registered — the handler turns it into a
 * graceful `error` handle rather than a silent empty result.
 */
export type ToolInvokePort = (
	req: ToolInvokeRequest,
) => Promise<ToolInvokeResult>;

/**
 * Marker error a {@link ToolInvokePort} throws when the requested tool cannot be
 * resolved. The handler maps it to the `error` handle with a clear message; any
 * other thrown error is treated as a tool execution failure.
 */
export class ToolNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ToolNotFoundError";
	}
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Resolve the argument map for a tool node. Starts from the merged upstream
 * input (so an upstream node's output is available to the tool by default), then
 * overlays the node's own configured `arguments` (`subBlocks.arguments`, a
 * key→string map), expanding `{{path}}` placeholders in each configured value
 * against the merged input — the same lightweight resolver the model/http nodes
 * use. Node-configured arguments win over same-named input keys.
 */
function resolveArgs(
	sub: Record<string, unknown>,
	input: Record<string, unknown>,
): Record<string, unknown> {
	const args: Record<string, unknown> = { ...input };
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
 * Build the `tool_call` block handler. Reads the node config from
 * `block.subBlocks` (the bound tool id + an argument map), resolves the
 * arguments from the node config overlaid on the merged upstream input, then
 * delegates the actual invocation to the injected {@link ToolInvokePort}.
 * Returns `{ output: { result } }` on success, or routes the failure to the
 * `error` handle — including the explicit "tool not bound" / "tool not found"
 * cases, which are surfaced rather than returned as a silent empty result.
 */
export function makeToolCallHandler(invoke: ToolInvokePort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const toolId = asString(sub.tool);

		if (toolId == null || toolId.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "TOOL_NOT_BOUND",
					message: "Tool Call node has no tool bound (subBlocks.tool).",
					blockId: ctx.blockId,
				},
			};
		}

		const args = resolveArgs(sub, ctx.input);

		try {
			const { result } = await invoke({ toolId: toolId.trim(), args });
			return { handle: "out", output: { result } };
		} catch (err) {
			const notFound = err instanceof ToolNotFoundError;
			return {
				handle: "error",
				error: {
					code: notFound ? "TOOL_NOT_FOUND" : "TOOL_CALL_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
	};
}
