import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import type { BlockHandler } from "./types";
import { WorkflowExecutor } from "./WorkflowExecutor";

function state(
	blocks: RoxWorkflowState["blocks"],
	edges: RoxWorkflowState["edges"],
): RoxWorkflowState {
	return {
		blocks,
		edges,
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "t" },
	};
}

const exec = new WorkflowExecutor();

/**
 * A `consumer` handler that echoes its resolved config back as output, so the
 * test can assert that `{{ref}}` placeholders in `subBlocks` were expanded
 * against upstream node outputs before the handler ran.
 */
const echoConfig: BlockHandler = (ctx) => ({
	output: { seen: ctx.block.subBlocks ?? {} },
});

describe("WorkflowExecutor cross-node data passing (#550)", () => {
	test("expands {{retrieval.chunks}} from a non-immediate upstream node", async () => {
		// start -> retrieval -> middle -> consumer
		// consumer references `retrieval` (an ancestor, not its direct input).
		const wf = state(
			{
				start: { type: "start" },
				retrieval: { type: "knowledge_retrieval", name: "Retrieval" },
				middle: { type: "transform" },
				consumer: {
					type: "consumer",
					subBlocks: { prompt: "use {{retrieval.chunks}}" },
				},
				response: { type: "response" },
			},
			[
				{ source: "start", target: "retrieval" },
				{ source: "retrieval", target: "middle" },
				{ source: "middle", target: "consumer" },
				{ source: "consumer", target: "response" },
			],
		);
		const handlers: Record<string, BlockHandler> = {
			knowledge_retrieval: () => ({ output: { chunks: "C1\nC2" } }),
			transform: (ctx) => ({ output: ctx.input }),
			consumer: echoConfig,
		};
		const r = await exec.execute(wf, {}, { handlers });
		expect(r.status).toBe("succeeded");
		const step = r.steps.find((s) => s.blockId === "consumer");
		expect(step?.status).toBe("succeeded");
		expect(step?.output).toEqual({ seen: { prompt: "use C1\nC2" } });
	});

	test("references resolve by human-facing node name", async () => {
		const wf = state(
			{
				start: { type: "start" },
				a: { type: "transform", name: "Model 1" },
				consumer: {
					type: "consumer",
					subBlocks: { prompt: "{{Model 1.text}}" },
				},
				response: { type: "response" },
			},
			[
				{ source: "start", target: "a" },
				{ source: "a", target: "consumer" },
				{ source: "consumer", target: "response" },
			],
		);
		const handlers: Record<string, BlockHandler> = {
			transform: () => ({ output: { text: "named-value" } }),
			consumer: echoConfig,
		};
		const r = await exec.execute(wf, {}, { handlers });
		const step = r.steps.find((s) => s.blockId === "consumer");
		expect(step?.output).toEqual({ seen: { prompt: "named-value" } });
	});

	test("unknown path routes the node to a failed step (no silent undefined)", async () => {
		const wf = state(
			{
				start: { type: "start" },
				a: { type: "transform", name: "A" },
				consumer: {
					type: "consumer",
					subBlocks: { prompt: "{{a.nope}}" },
				},
				response: { type: "response" },
			},
			[
				{ source: "start", target: "a" },
				{ source: "a", target: "consumer" },
				{ source: "consumer", target: "response" },
			],
		);
		const handlers: Record<string, BlockHandler> = {
			transform: () => ({ output: { text: "v" } }),
			consumer: echoConfig,
		};
		const r = await exec.execute(wf, {}, { handlers });
		expect(r.status).toBe("failed");
		expect(r.error?.code).toBe("REFERENCE_UNRESOLVED");
		const step = r.steps.find((s) => s.blockId === "consumer");
		expect(step?.status).toBe("failed");
	});

	test("an unreachable (non-ancestor) node is not resolvable", async () => {
		// `other` runs on a parallel branch and is NOT an ancestor of consumer,
		// so `{{Other.text}}` is not a cross-node ref here: it is left intact
		// (never expanded with `other`'s value).
		const wf = state(
			{
				start: { type: "start" },
				par: { type: "parallel" },
				other: { type: "transform", name: "Other" },
				a: { type: "transform" },
				consumer: {
					type: "consumer",
					subBlocks: { prompt: "{{Other.text}}" },
				},
				response: { type: "response" },
			},
			[
				{ source: "start", target: "par" },
				{ source: "par", target: "other" },
				{ source: "par", target: "a" },
				{ source: "a", target: "consumer" },
				{ source: "other", target: "response" },
				{ source: "consumer", target: "response" },
			],
		);
		const handlers: Record<string, BlockHandler> = {
			parallel: (ctx) => ({ output: ctx.input }),
			transform: () => ({ output: { text: "v" } }),
			consumer: echoConfig,
		};
		const r = await exec.execute(wf, {}, { handlers });
		expect(r.status).toBe("succeeded");
		const step = r.steps.find((s) => s.blockId === "consumer");
		// Placeholder kept verbatim — `other`'s value never leaked in.
		expect(step?.output).toEqual({ seen: { prompt: "{{Other.text}}" } });
	});
});
