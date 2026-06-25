import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { InMemoryRunRecorder } from "../executor/InMemoryRunRecorder";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { WorkflowExecutor } from "../executor/WorkflowExecutor";
import {
	type ModelGeneratePort,
	makeModelHandler,
	resolvePromptTemplate,
} from "./modelHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "m1",
		block: { type: "model", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("resolvePromptTemplate", () => {
	test("expands {{path}} placeholders from input", () => {
		expect(resolvePromptTemplate("Hi {{name}}", { name: "Ann" })).toBe(
			"Hi Ann",
		);
	});
	test("expands dotted paths and JSON-stringifies objects", () => {
		expect(resolvePromptTemplate("v={{a.b}}", { a: { b: { x: 1 } } })).toBe(
			'v={"x":1}',
		);
	});
	test("unknown path resolves to empty string (no literal token left)", () => {
		expect(resolvePromptTemplate("[{{missing}}]", {})).toBe("[]");
	});
});

describe("makeModelHandler", () => {
	const fakeGenerate: ModelGeneratePort = async (req) => ({
		text: `echo:${req.prompt}`,
		usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
	});

	test("returns out handle with text + usage, derives cost from usage", async () => {
		const handler = makeModelHandler(fakeGenerate);
		const res = await handler(
			ctx({ userPrompt: "Say {{greeting}}" }, { greeting: "hello" }),
		);
		expect(res.handle).toBe("out");
		expect(res.output?.text).toBe("echo:Say hello");
		expect(res.output?.usage).toEqual({
			inputTokens: 3,
			outputTokens: 5,
			totalTokens: 8,
		});
		expect(res.cost).toEqual({ inputTokens: 3, outputTokens: 5 });
		expect(res.error).toBeUndefined();
	});

	test("passes model id + temperature + maxTokens through to the port", async () => {
		const seen: unknown[] = [];
		const handler = makeModelHandler(async (req) => {
			seen.push(req);
			return { text: "ok" };
		});
		await handler(
			ctx({
				userPrompt: "hi",
				systemPrompt: "be terse",
				model: "claude-x",
				temperature: 0.2,
				maxTokens: 64,
			}),
		);
		expect(seen[0]).toEqual({
			model: "claude-x",
			system: "be terse",
			prompt: "hi",
			temperature: 0.2,
			maxTokens: 64,
		});
	});

	test("missing user prompt routes to error handle (not silent)", async () => {
		const handler = makeModelHandler(fakeGenerate);
		const res = await handler(ctx({ systemPrompt: "x" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("MODEL_PROMPT_MISSING");
	});

	test("provider failure routes to error handle", async () => {
		const handler = makeModelHandler(async () => {
			throw new Error("429 rate limited");
		});
		const res = await handler(ctx({ userPrompt: "hi" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("MODEL_CALL_FAILED");
		expect(res.error?.message).toContain("429");
	});
});

describe("model node integration", () => {
	function state(): RoxWorkflowState {
		return {
			blocks: {
				start: { type: "start" },
				m: { type: "model", subBlocks: { userPrompt: "Greet {{who}}" } },
				response: { type: "response" },
			},
			edges: [
				{ source: "start", target: "m" },
				{ source: "m", target: "response" },
			],
			variables: {},
			loops: {},
			parallels: {},
			metadata: { name: "model-run" },
		};
	}

	test("start→model→response runs, model step succeeds with output + cost", async () => {
		const exec = new WorkflowExecutor();
		const recorder = new InMemoryRunRecorder();
		const handlers: Record<string, BlockHandler> = {
			model: makeModelHandler(async (req) => ({
				text: `LLM(${req.prompt})`,
				usage: { inputTokens: 10, outputTokens: 20 },
			})),
		};
		const result = await exec.execute(
			state(),
			{ who: "world" },
			{ handlers, recorder },
		);
		expect(result.status).toBe("succeeded");
		const modelStep = recorder.steps.find((s) => s.blockType === "model");
		expect(modelStep?.status).toBe("succeeded");
		expect(modelStep?.output?.text).toBe("LLM(Greet world)");
		expect((modelStep?.output?.text as string).length).toBeGreaterThan(0);
		expect(modelStep?.cost).toEqual({ inputTokens: 10, outputTokens: 20 });
	});
});
