import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { InMemoryRunRecorder } from "../executor/InMemoryRunRecorder";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { WorkflowExecutor } from "../executor/WorkflowExecutor";
import { makeGateHandler, parseGateRoutes } from "./gateHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "g1",
		block: { type: "gate", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("parseGateRoutes", () => {
	test("keeps routes with a string id; accepts when aliases", () => {
		expect(
			parseGateRoutes([
				{ id: "hi", when: "x > 10" },
				{ id: "mid", condition: "x > 5" },
				{ id: "lo" },
				{ when: "x > 0" },
			]),
		).toEqual([
			{ id: "hi", when: "x > 10" },
			{ id: "mid", when: "x > 5" },
			{ id: "lo", when: undefined },
		]);
	});
});

describe("makeGateHandler", () => {
	const routes = [
		{ id: "hi", when: "score >= 90" },
		{ id: "mid", when: "score >= 50" },
		{ id: "lo" },
	];

	test("fires the first matching route in order", () => {
		expect(makeGateHandler()(ctx({ routes }, { score: 95 })).handle).toBe("hi");
		expect(makeGateHandler()(ctx({ routes }, { score: 60 })).handle).toBe(
			"mid",
		);
	});

	test("a predicate-less route is the catch-all", () => {
		expect(makeGateHandler()(ctx({ routes }, { score: 10 })).handle).toBe("lo");
	});

	test("no match and no catch-all falls back to default", () => {
		const res = makeGateHandler()(
			ctx({ routes: [{ id: "hi", when: "x > 100" }] }, { x: 1 }),
		);
		expect(res.handle).toBe("default");
	});

	test("predicate error routes to error handle", () => {
		const res = makeGateHandler()(
			ctx({ routes: [{ id: "x", when: "bad >" }] }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("GATE_EVAL_FAILED");
	});
});

describe("gate routing integration", () => {
	function state(): RoxWorkflowState {
		return {
			blocks: {
				start: { type: "start" },
				g: {
					type: "gate",
					subBlocks: {
						routes: [{ id: "big", when: "n >= 100" }, { id: "small" }],
					},
				},
				big: { type: "response", name: "big" },
				small: { type: "response", name: "small" },
				response: { type: "response" },
			},
			edges: [
				{ source: "start", target: "g" },
				{ source: "g", target: "big", sourceHandle: "big" },
				{ source: "g", target: "small", sourceHandle: "small" },
				{ source: "big", target: "response" },
				{ source: "small", target: "response" },
			],
			variables: {},
			loops: {},
			parallels: {},
			metadata: { name: "gate-run" },
		};
	}

	test("routes to the matching output, prunes the rest", async () => {
		const exec = new WorkflowExecutor();
		const recorder = new InMemoryRunRecorder();
		const handlers: Record<string, BlockHandler> = { gate: makeGateHandler() };
		const result = await exec.execute(
			state(),
			{ n: 250 },
			{ handlers, recorder },
		);
		expect(result.status).toBe("succeeded");
		const ran = recorder.steps
			.filter((s) => s.status === "succeeded")
			.map((s) => s.blockId);
		expect(ran).toContain("big");
		expect(ran).not.toContain("small");
	});
});
