import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	makeToolCallHandler,
	type ToolInvokePort,
	ToolNotFoundError,
} from "./toolCallHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "t1",
		block: { type: "tool_call", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("makeToolCallHandler", () => {
	const fakeInvoke: ToolInvokePort = async (req) => ({
		result: { echoedTool: req.toolId, echoedArgs: req.args },
	});

	test("returns out handle with the tool result", async () => {
		const handler = makeToolCallHandler(fakeInvoke);
		const res = await handler(
			ctx({ tool: "send_email", arguments: { to: "a@b.c" } }, { from: "x" }),
		);
		expect(res.handle).toBe("out");
		expect(res.output?.result).toEqual({
			echoedTool: "send_email",
			// merged input + configured arg, configured arg wins on collisions.
			echoedArgs: { from: "x", to: "a@b.c" },
		});
	});

	test("expands {{path}} placeholders in arguments from input", async () => {
		const handler = makeToolCallHandler(fakeInvoke);
		const res = await handler(
			ctx({ tool: "greet", arguments: { msg: "hi {{name}}" } }, { name: "Bo" }),
		);
		const args = (res.output?.result as { echoedArgs: Record<string, unknown> })
			.echoedArgs;
		expect(args.msg).toBe("hi Bo");
	});

	test("missing tool id routes to error handle", async () => {
		const handler = makeToolCallHandler(fakeInvoke);
		const res = await handler(ctx({ arguments: {} }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("TOOL_NOT_BOUND");
	});

	test("ToolNotFoundError maps to TOOL_NOT_FOUND error handle", async () => {
		const handler = makeToolCallHandler(async () => {
			throw new ToolNotFoundError("no such tool: zap");
		});
		const res = await handler(ctx({ tool: "zap" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("TOOL_NOT_FOUND");
		expect(res.error?.message).toContain("zap");
	});

	test("generic port failure maps to TOOL_CALL_FAILED error handle", async () => {
		const handler = makeToolCallHandler(async () => {
			throw new Error("boom");
		});
		const res = await handler(ctx({ tool: "send_email" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("TOOL_CALL_FAILED");
	});
});
