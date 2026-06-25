import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { InMemoryRunRecorder } from "../executor/InMemoryRunRecorder";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { WorkflowExecutor } from "../executor/WorkflowExecutor";
import { makeMergeHandler } from "./mergeHandler";

function ctx(input: Record<string, unknown>): BlockHandlerContext {
	return {
		blockId: "m1",
		block: { type: "merge" },
		input,
		runInput: {},
		resolveSecret: () => undefined,
	};
}

describe("makeMergeHandler", () => {
	test("surfaces the merged input on the `out` handle", () => {
		const res = makeMergeHandler()(ctx({ a: 1, b: 2 }));
		expect(res.handle).toBe("out");
		expect(res.output).toEqual({ a: 1, b: 2 });
	});
	test("returns a copy (not the same reference)", () => {
		const input = { a: 1 };
		const res = makeMergeHandler()(ctx(input));
		expect(res.output).not.toBe(input);
	});
});

describe("merge join integration", () => {
	// Two parallel-ish branches off start feed one merge; the executor waits for
	// both live in-edges and Object.assign-merges their outputs into the input.
	function state(): RoxWorkflowState {
		return {
			blocks: {
				start: { type: "start" },
				left: { type: "response", name: "left" },
				right: { type: "response", name: "right" },
				m: { type: "merge" },
				response: { type: "response" },
			},
			edges: [
				{ source: "start", target: "left" },
				{ source: "start", target: "right" },
				{ source: "left", target: "m" },
				{ source: "right", target: "m" },
				{ source: "m", target: "response" },
			],
			variables: {},
			loops: {},
			parallels: {},
			metadata: { name: "merge-run" },
		};
	}

	test("merge receives both branch inputs joined into one object", async () => {
		const exec = new WorkflowExecutor();
		const recorder = new InMemoryRunRecorder();
		const handlers: Record<string, BlockHandler> = {
			merge: makeMergeHandler(),
			// Make each branch contribute a distinct key so we can prove the join.
			response: (c) =>
				c.blockId === "left"
					? { output: { left: true, shared: "L" } }
					: c.blockId === "right"
						? { output: { right: true, shared: "R" } }
						: { output: c.input },
		};
		const result = await exec.execute(state(), {}, { handlers, recorder });
		expect(result.status).toBe("succeeded");
		const mergeStep = recorder.steps.find((s) => s.blockId === "m");
		expect(mergeStep?.input?.left).toBe(true);
		expect(mergeStep?.input?.right).toBe(true);
		// Both live branches present; Object.assign is last-writer-wins on `shared`.
		expect(mergeStep?.output?.left).toBe(true);
		expect(mergeStep?.output?.right).toBe(true);
	});
});
