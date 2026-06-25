import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { InMemoryRunRecorder } from "../executor/InMemoryRunRecorder";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { WorkflowExecutor } from "../executor/WorkflowExecutor";
import { makeModelHandler } from "./modelHandler";
import {
	KnowledgeBaseNotFoundError,
	makeRagHandler,
	type RetrievalPort,
} from "./ragHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "k1",
		block: { type: "knowledge_retrieval", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("makeRagHandler", () => {
	const fakeRetrieve: RetrievalPort = async (req) => ({
		chunks: [
			{ text: `chunk-for:${req.query}`, score: 0.9, sourceId: "doc-1" },
			{ text: "second chunk", score: 0.4, sourceId: "doc-2" },
		].slice(0, req.topK),
		sources: [
			{ id: "doc-1", title: "Doc One", url: "/knowledge/doc-1" },
			{ id: "doc-2", title: "Doc Two", url: "/knowledge/doc-2" },
		].slice(0, req.topK),
	});

	test("returns out handle with chunks + sources", async () => {
		const handler = makeRagHandler(fakeRetrieve);
		const res = await handler(
			ctx({ knowledgeBase: "kb-uuid", query: "what is rox", topK: 2 }),
		);
		expect(res.handle).toBe("out");
		expect(res.output?.chunks).toEqual([
			{ text: "chunk-for:what is rox", score: 0.9, sourceId: "doc-1" },
			{ text: "second chunk", score: 0.4, sourceId: "doc-2" },
		]);
		expect(res.output?.sources).toEqual([
			{ id: "doc-1", title: "Doc One", url: "/knowledge/doc-1" },
			{ id: "doc-2", title: "Doc Two", url: "/knowledge/doc-2" },
		]);
		expect(res.error).toBeUndefined();
	});

	test("passes knowledge base id + clamped topK to the port", async () => {
		const seen: unknown[] = [];
		const handler = makeRagHandler(async (req) => {
			seen.push(req);
			return { chunks: [], sources: [] };
		});
		// topK above the cap (100) is clamped; query trimmed.
		await handler(ctx({ knowledgeBase: "kb-1", query: "  hi  ", topK: 999 }));
		expect(seen[0]).toEqual({
			knowledgeBaseId: "kb-1",
			query: "hi",
			topK: 100,
		});
	});

	test("falls back to upstream input query when node has none", async () => {
		const seen: unknown[] = [];
		const handler = makeRagHandler(async (req) => {
			seen.push(req.query);
			return { chunks: [], sources: [] };
		});
		await handler(ctx({ knowledgeBase: "kb-1" }, { query: "from upstream" }));
		expect(seen[0]).toBe("from upstream");
	});

	test("defaults topK when unset", async () => {
		const seen: number[] = [];
		const handler = makeRagHandler(async (req) => {
			seen.push(req.topK);
			return { chunks: [], sources: [] };
		});
		await handler(ctx({ knowledgeBase: "kb-1", query: "q" }));
		expect(seen[0]).toBe(5);
	});

	test("missing knowledge base routes to error handle (not silent)", async () => {
		const handler = makeRagHandler(fakeRetrieve);
		const res = await handler(ctx({ query: "q" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("KNOWLEDGE_BASE_NOT_BOUND");
		expect(res.output).toBeUndefined();
	});

	test("missing query (node + upstream) routes to error handle", async () => {
		const handler = makeRagHandler(fakeRetrieve);
		const res = await handler(ctx({ knowledgeBase: "kb-1" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("KNOWLEDGE_QUERY_MISSING");
	});

	test("KnowledgeBaseNotFoundError maps to KNOWLEDGE_BASE_NOT_FOUND", async () => {
		const handler = makeRagHandler(async () => {
			throw new KnowledgeBaseNotFoundError("base xyz not found");
		});
		const res = await handler(ctx({ knowledgeBase: "xyz", query: "q" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("KNOWLEDGE_BASE_NOT_FOUND");
		expect(res.error?.message).toContain("xyz");
	});

	test("generic retrieval failure routes to KNOWLEDGE_RETRIEVAL_FAILED", async () => {
		const handler = makeRagHandler(async () => {
			throw new Error("db timeout");
		});
		const res = await handler(ctx({ knowledgeBase: "kb-1", query: "q" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("KNOWLEDGE_RETRIEVAL_FAILED");
		expect(res.error?.message).toContain("db timeout");
	});
});

describe("rag node integration", () => {
	function state(): RoxWorkflowState {
		return {
			blocks: {
				start: { type: "start" },
				kb: {
					type: "knowledge_retrieval",
					subBlocks: { knowledgeBase: "kb-uuid", query: "{{question}}" },
				},
				// The model node consumes the retrieved context from its upstream
				// knowledge_retrieval node via the `{{chunks}}` placeholder.
				m: {
					type: "model",
					subBlocks: { userPrompt: "Answer using: {{chunks}}" },
				},
				response: { type: "response" },
			},
			edges: [
				{ source: "start", target: "kb" },
				{ source: "kb", target: "m" },
				{ source: "m", target: "response" },
			],
			variables: {},
			loops: {},
			parallels: {},
			metadata: { name: "rag-run" },
		};
	}

	test("start→knowledge_retrieval→model passes retrieved chunks into the model input", async () => {
		const exec = new WorkflowExecutor();
		const recorder = new InMemoryRunRecorder();
		let modelSawPrompt = "";
		const handlers: Record<string, BlockHandler> = {
			knowledge_retrieval: makeRagHandler(async (req) => ({
				chunks: [{ text: `ctx:${req.query}`, sourceId: "doc-1" }],
				sources: [{ id: "doc-1", title: "Doc One" }],
			})),
			model: makeModelHandler(async (req) => {
				modelSawPrompt = req.prompt;
				return { text: "answered" };
			}),
		};
		const result = await exec.execute(
			state(),
			{ question: "what is rox" },
			{ handlers, recorder },
		);
		expect(result.status).toBe("succeeded");

		const ragStep = recorder.steps.find(
			(s) => s.blockType === "knowledge_retrieval",
		);
		expect(ragStep?.status).toBe("succeeded");
		expect(ragStep?.output?.chunks).toBeDefined();
		expect(ragStep?.output?.sources).toBeDefined();

		// The model node received the retrieved chunks in its resolved prompt.
		expect(modelSawPrompt).toContain("ctx:what is rox");
		const modelStep = recorder.steps.find((s) => s.blockType === "model");
		expect(modelStep?.status).toBe("succeeded");
		expect(modelStep?.output?.text).toBe("answered");
	});
});
