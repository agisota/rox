import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	type McpInvokePort,
	McpServerNotFoundError,
	McpToolNotFoundError,
	makeMcpToolHandler,
} from "./mcpToolHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "m1",
		block: { type: "mcp_tool", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("makeMcpToolHandler", () => {
	const fakeInvoke: McpInvokePort = async (req) => ({
		result: { server: req.server, tool: req.tool, args: req.args },
	});

	test("returns out handle with the tool result", async () => {
		const handler = makeMcpToolHandler(fakeInvoke);
		const res = await handler(
			ctx({
				server: "github",
				tool: "create_issue",
				arguments: { title: "T" },
			}),
		);
		expect(res.handle).toBe("out");
		expect(res.output?.result).toEqual({
			server: "github",
			tool: "create_issue",
			args: { title: "T" },
		});
	});

	test("passes ONLY configured args (not the whole merged input)", async () => {
		const handler = makeMcpToolHandler(fakeInvoke);
		const res = await handler(
			ctx(
				{ server: "github", tool: "x", arguments: { title: "{{t}}" } },
				{ t: "Bug", secret: "leak" },
			),
		);
		const args = (res.output?.result as { args: Record<string, unknown> }).args;
		expect(args).toEqual({ title: "Bug" });
		expect(args.secret).toBeUndefined();
	});

	test("missing server routes to MCP_SERVER_NOT_BOUND error handle", async () => {
		const handler = makeMcpToolHandler(fakeInvoke);
		const res = await handler(ctx({ tool: "x" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("MCP_SERVER_NOT_BOUND");
	});

	test("missing tool name routes to MCP_TOOL_NAME_MISSING error handle", async () => {
		const handler = makeMcpToolHandler(fakeInvoke);
		const res = await handler(ctx({ server: "github" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("MCP_TOOL_NAME_MISSING");
	});

	test("McpServerNotFoundError maps to MCP_SERVER_NOT_FOUND", async () => {
		const handler = makeMcpToolHandler(async () => {
			throw new McpServerNotFoundError("no server: ghost");
		});
		const res = await handler(ctx({ server: "ghost", tool: "x" }));
		expect(res.error?.code).toBe("MCP_SERVER_NOT_FOUND");
	});

	test("McpToolNotFoundError maps to MCP_TOOL_NOT_FOUND", async () => {
		const handler = makeMcpToolHandler(async () => {
			throw new McpToolNotFoundError("no tool: ghost");
		});
		const res = await handler(ctx({ server: "github", tool: "ghost" }));
		expect(res.error?.code).toBe("MCP_TOOL_NOT_FOUND");
	});

	test("generic failure maps to MCP_TOOL_CALL_FAILED", async () => {
		const handler = makeMcpToolHandler(async () => {
			throw new Error("transport down");
		});
		const res = await handler(ctx({ server: "github", tool: "x" }));
		expect(res.error?.code).toBe("MCP_TOOL_CALL_FAILED");
	});
});
