import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { InMemoryRunRecorder } from "../executor/InMemoryRunRecorder";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { WorkflowExecutor } from "../executor/WorkflowExecutor";
import { evaluateBoolean, makeConditionHandler } from "./conditionHandler";
import { makeMergeHandler } from "./mergeHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "c1",
		block: { type: "condition", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("evaluateBoolean", () => {
	test("reads dotted member paths off the scope", () => {
		expect(evaluateBoolean("user.age >= 18", { user: { age: 21 } })).toBe(true);
		expect(evaluateBoolean("user.age >= 18", { user: { age: 12 } })).toBe(
			false,
		);
	});
	test("applies JS truthiness to non-boolean results", () => {
		expect(evaluateBoolean("count", { count: 0 })).toBe(false);
		expect(evaluateBoolean("count", { count: 3 })).toBe(true);
	});
	test("supports logical/comparison operators", () => {
		expect(evaluateBoolean('a == 1 and b == "x"', { a: 1, b: "x" })).toBe(true);
	});
	test("throws on unknown symbol (no silent default)", () => {
		expect(() => evaluateBoolean("missing > 1", {})).toThrow();
	});
});

describe("makeConditionHandler", () => {
	test("true expression fires the `true` handle", () => {
		const res = makeConditionHandler()(ctx({ expression: "x > 5" }, { x: 9 }));
		expect(res.handle).toBe("true");
		expect(res.output?.result).toBe(true);
	});
	test("false expression fires the `false` handle", () => {
		const res = makeConditionHandler()(ctx({ expression: "x > 5" }, { x: 1 }));
		expect(res.handle).toBe("false");
		expect(res.output?.result).toBe(false);
	});
	test("`condition` alias is accepted", () => {
		const res = makeConditionHandler()(ctx({ condition: "ok" }, { ok: true }));
		expect(res.handle).toBe("true");
	});
	test("missing expression routes to error handle", () => {
		const res = makeConditionHandler()(ctx({}));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CONDITION_EXPRESSION_MISSING");
	});
	test("evaluation failure routes to error handle", () => {
		const res = makeConditionHandler()(ctx({ expression: "nope >" }, {}));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CONDITION_EVAL_FAILED");
	});
});

describe("condition branch integration", () => {
	function state(): RoxWorkflowState {
		return {
			blocks: {
				start: { type: "start" },
				cond: { type: "condition", subBlocks: { expression: "n > 10" } },
				a: { type: "response", name: "A" },
				b: { type: "response", name: "B" },
				m: { type: "merge" },
				response: { type: "response" },
			},
			edges: [
				{ source: "start", target: "cond" },
				{ source: "cond", target: "a", sourceHandle: "true" },
				{ source: "cond", target: "b", sourceHandle: "false" },
				{ source: "a", target: "m" },
				{ source: "b", target: "m" },
				{ source: "m", target: "response" },
			],
			variables: {},
			loops: {},
			parallels: {},
			metadata: { name: "cond-run" },
		};
	}

	const handlers: Record<string, BlockHandler> = {
		condition: makeConditionHandler(),
		merge: makeMergeHandler(),
	};

	test("only the taken (true) branch runs; merge gets its output", async () => {
		const exec = new WorkflowExecutor();
		const recorder = new InMemoryRunRecorder();
		const result = await exec.execute(
			state(),
			{ n: 42 },
			{ handlers, recorder },
		);
		expect(result.status).toBe("succeeded");
		const ran = recorder.steps
			.filter((s) => s.status === "succeeded")
			.map((s) => s.blockId);
		expect(ran).toContain("a");
		expect(ran).not.toContain("b");
		// The taken branch carries the condition node's output
		// (`{ result, input }`) down to the merge join.
		const mergeStep = recorder.steps.find((s) => s.blockId === "m");
		expect(mergeStep?.input?.result).toBe(true);
		expect((mergeStep?.input?.input as Record<string, unknown>)?.n).toBe(42);
	});

	test("only the taken (false) branch runs", async () => {
		const exec = new WorkflowExecutor();
		const recorder = new InMemoryRunRecorder();
		const result = await exec.execute(
			state(),
			{ n: 3 },
			{ handlers, recorder },
		);
		expect(result.status).toBe("succeeded");
		const ran = recorder.steps
			.filter((s) => s.status === "succeeded")
			.map((s) => s.blockId);
		expect(ran).toContain("b");
		expect(ran).not.toContain("a");
	});
});
