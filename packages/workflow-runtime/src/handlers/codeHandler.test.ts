import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	CodeExecutionError,
	type CodeExecutionPort,
	type CodeExecutionRequest,
	type CodeExecutionResult,
	makeCodeHandler,
	resolveCodeInputs,
	resolveCodeMemoryMb,
	resolveCodeTimeoutMs,
	shapeCodeOutput,
} from "./codeHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "c1",
		block: { type: "code", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

/** Records every request so tests can assert what reached the sandbox port. */
function recordingPort(result: CodeExecutionResult): {
	port: CodeExecutionPort;
	calls: CodeExecutionRequest[];
} {
	const calls: CodeExecutionRequest[] = [];
	const port: CodeExecutionPort = async (req) => {
		calls.push(req);
		return result;
	};
	return { port, calls };
}

describe("resolveCodeTimeoutMs / resolveCodeMemoryMb (caps)", () => {
	test("defaults when unset / non-numeric", () => {
		expect(resolveCodeTimeoutMs(undefined)).toBe(5_000);
		expect(resolveCodeTimeoutMs("nope")).toBe(5_000);
		expect(resolveCodeMemoryMb(undefined)).toBe(128);
		expect(resolveCodeMemoryMb(Number.NaN)).toBe(128);
	});
	test("clamps below the floor and above the hard cap", () => {
		expect(resolveCodeTimeoutMs(0)).toBe(1);
		expect(resolveCodeTimeoutMs(10_000_000)).toBe(30_000);
		expect(resolveCodeMemoryMb(1)).toBe(8);
		expect(resolveCodeMemoryMb(99_999)).toBe(512);
	});
	test("passes a valid value through (floored)", () => {
		expect(resolveCodeTimeoutMs(2_500)).toBe(2_500);
		expect(resolveCodeMemoryMb(256.9)).toBe(256);
	});
});

describe("resolveCodeInputs", () => {
	test("forwards the whole upstream input when no inputs map is set", () => {
		const upstream = { a: 1, b: 2 };
		expect(resolveCodeInputs(undefined, upstream)).toEqual(upstream);
		expect(resolveCodeInputs({}, upstream)).toEqual(upstream);
	});
	test("maps named inputs from dotted paths in the upstream input", () => {
		const upstream = { user: { email: "x@y.z" }, count: 7 };
		expect(
			resolveCodeInputs({ mail: "user.email", n: "count" }, upstream),
		).toEqual({ mail: "x@y.z", n: 7 });
	});
	test("unresolved path yields undefined for that name (no throw)", () => {
		expect(resolveCodeInputs({ x: "missing.path" }, { a: 1 })).toEqual({
			x: undefined,
		});
	});
});

describe("shapeCodeOutput", () => {
	test("object return passes through as the output map", () => {
		expect(shapeCodeOutput({ value: { ok: true, n: 3 } })).toEqual({
			ok: true,
			n: 3,
		});
	});
	test("non-object return is wrapped under result", () => {
		expect(shapeCodeOutput({ value: 42 })).toEqual({ result: 42 });
		expect(shapeCodeOutput({ value: "hi" })).toEqual({ result: "hi" });
		expect(shapeCodeOutput({ value: [1, 2] })).toEqual({ result: [1, 2] });
		expect(shapeCodeOutput({ value: null })).toEqual({ result: null });
		expect(shapeCodeOutput({ value: undefined })).toEqual({ result: null });
	});
	test("logs ride alongside when present", () => {
		expect(shapeCodeOutput({ value: { a: 1 }, logs: ["x"] })).toEqual({
			a: 1,
			logs: ["x"],
		});
	});
});

describe("makeCodeHandler", () => {
	test("runs the port and returns the shaped output on the out handle", async () => {
		const { port, calls } = recordingPort({ value: { doubled: 42 } });
		const handler = makeCodeHandler(port);
		const res = await handler(
			ctx(
				{
					language: "javascript",
					source: "function main(input){return {doubled: input.n*2};}",
					inputs: { n: "value" },
				},
				{ value: 21 },
			),
		);
		expect(res.handle).toBe("out");
		expect(res.output).toEqual({ doubled: 42 });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.language).toBe("javascript");
		expect(calls[0]?.input).toEqual({ n: 21 });
		// Caps are stamped onto the request (security policy travels with it).
		expect(calls[0]?.timeoutMs).toBe(5_000);
		expect(calls[0]?.memoryLimitMb).toBe(128);
	});

	test("forwards configured (clamped) timeout + memory caps to the port", async () => {
		const { port, calls } = recordingPort({ value: {} });
		await makeCodeHandler(port)(
			ctx({
				language: "javascript",
				source: "function main(){return {};}",
				timeoutMs: 999_999,
				memoryLimitMb: 4,
			}),
		);
		expect(calls[0]?.timeoutMs).toBe(30_000); // clamped to hard cap
		expect(calls[0]?.memoryLimitMb).toBe(8); // clamped up to the floor
	});

	test("missing language routes to error (never silently runs)", async () => {
		const { port, calls } = recordingPort({ value: {} });
		const res = await makeCodeHandler(port)(
			ctx({ source: "function main(){return {};}" }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CODE_LANGUAGE_MISSING");
		expect(calls).toHaveLength(0);
	});

	test("missing source routes to error before the port is called", async () => {
		const { port, calls } = recordingPort({ value: {} });
		const res = await makeCodeHandler(port)(ctx({ language: "javascript" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CODE_SOURCE_MISSING");
		expect(calls).toHaveLength(0);
	});

	test("oversized source routes to error before the port is called", async () => {
		const { port, calls } = recordingPort({ value: {} });
		const res = await makeCodeHandler(port)(
			ctx({ language: "javascript", source: "x".repeat(50_001) }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CODE_SOURCE_TOO_LARGE");
		expect(calls).toHaveLength(0);
	});

	test("a typed CodeExecutionError from the port maps onto the error handle", async () => {
		const handler = makeCodeHandler(async () => {
			throw new CodeExecutionError("CODE_TIMEOUT", "sandbox timed out", {
				timeoutMs: 5_000,
			});
		});
		const res = await handler(
			ctx({ language: "javascript", source: "while(true){}" }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CODE_TIMEOUT");
		expect(res.error?.message).toBe("sandbox timed out");
		expect(res.error?.details).toEqual({ timeoutMs: 5_000 });
	});

	test("an unsupported-language sandbox error surfaces its typed code", async () => {
		const handler = makeCodeHandler(async () => {
			throw new CodeExecutionError(
				"CODE_LANGUAGE_UNSUPPORTED",
				"python is not runnable on this host",
			);
		});
		const res = await handler(
			ctx({ language: "python", source: "def main(i):\n  return i" }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CODE_LANGUAGE_UNSUPPORTED");
	});

	test("a plain thrown error becomes CODE_EXECUTION_FAILED", async () => {
		const handler = makeCodeHandler(async () => {
			throw new Error("worker crashed");
		});
		const res = await handler(
			ctx({ language: "javascript", source: "function main(){return 1;}" }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CODE_EXECUTION_FAILED");
		expect(res.error?.message).toContain("worker crashed");
	});
});
