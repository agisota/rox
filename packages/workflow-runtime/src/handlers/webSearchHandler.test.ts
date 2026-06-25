import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { InMemoryRunRecorder } from "../executor/InMemoryRunRecorder";
import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { WorkflowExecutor } from "../executor/WorkflowExecutor";
import { makeModelHandler } from "./modelHandler";
import {
	makeWebSearchHandler,
	WebSearchNotConfiguredError,
	type WebSearchPort,
} from "./webSearchHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "w1",
		block: { type: "web_search", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("makeWebSearchHandler", () => {
	const fakeSearch: WebSearchPort = async (req) => ({
		results: [
			{ title: `r:${req.query}`, url: "https://a.example", content: "alpha" },
			{ title: "second", url: "https://b.example", content: "beta" },
		].slice(0, req.maxResults),
	});

	test("returns out handle with results", async () => {
		const handler = makeWebSearchHandler(fakeSearch);
		const res = await handler(ctx({ query: "rox pipelines", maxResults: 2 }));
		expect(res.handle).toBe("out");
		expect(res.output?.results).toEqual([
			{ title: "r:rox pipelines", url: "https://a.example", content: "alpha" },
			{ title: "second", url: "https://b.example", content: "beta" },
		]);
	});

	test("clamps maxResults and expands {{path}} in query", async () => {
		const seen: { query: string; maxResults: number }[] = [];
		const handler = makeWebSearchHandler(async (req) => {
			seen.push(req);
			return { results: [] };
		});
		await handler(
			ctx({ query: "find {{topic}}", maxResults: 999 }, { topic: "x" }),
		);
		expect(seen[0]).toEqual({ query: "find x", maxResults: 50 });
	});

	test("falls back to upstream input query and defaults maxResults", async () => {
		const seen: { query: string; maxResults: number }[] = [];
		const handler = makeWebSearchHandler(async (req) => {
			seen.push(req);
			return { results: [] };
		});
		await handler(ctx({}, { query: "upstream q" }));
		expect(seen[0]).toEqual({ query: "upstream q", maxResults: 5 });
	});

	test("missing query routes to error handle (not silent)", async () => {
		const handler = makeWebSearchHandler(fakeSearch);
		const res = await handler(ctx({}));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("WEB_SEARCH_QUERY_MISSING");
		expect(res.output).toBeUndefined();
	});

	test("WebSearchNotConfiguredError maps to WEB_SEARCH_NOT_CONFIGURED", async () => {
		const handler = makeWebSearchHandler(async () => {
			throw new WebSearchNotConfiguredError("no provider key");
		});
		const res = await handler(ctx({ query: "q" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("WEB_SEARCH_NOT_CONFIGURED");
	});

	test("generic failure maps to WEB_SEARCH_FAILED", async () => {
		const handler = makeWebSearchHandler(async () => {
			throw new Error("upstream 502");
		});
		const res = await handler(ctx({ query: "q" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("WEB_SEARCH_FAILED");
	});
});

describe("web_search node integration", () => {
	function state(): RoxWorkflowState {
		return {
			blocks: {
				start: { type: "start" },
				ws: {
					type: "web_search",
					subBlocks: { query: "{{question}}", maxResults: 3 },
				},
				// The model node consumes the search results from its upstream
				// web_search node via the `{{results}}` placeholder.
				m: {
					type: "model",
					subBlocks: { userPrompt: "Summarize: {{results}}" },
				},
				response: { type: "response" },
			},
			edges: [
				{ source: "start", target: "ws" },
				{ source: "ws", target: "m" },
				{ source: "m", target: "response" },
			],
			variables: {},
			loops: {},
			parallels: {},
			metadata: { name: "web-search-run" },
		};
	}

	test("start→web_search→model threads search results into the model input", async () => {
		const exec = new WorkflowExecutor();
		const recorder = new InMemoryRunRecorder();
		let modelSawPrompt = "";
		const handlers: Record<string, BlockHandler> = {
			web_search: makeWebSearchHandler(async (req) => ({
				results: [
					{
						title: `hit:${req.query}`,
						url: "https://x.example",
						content: "snippet",
					},
				],
			})),
			model: makeModelHandler(async (req) => {
				modelSawPrompt = req.prompt;
				return { text: "summarized" };
			}),
		};
		const result = await exec.execute(
			state(),
			{ question: "what is rox" },
			{ handlers, recorder },
		);
		expect(result.status).toBe("succeeded");

		const wsStep = recorder.steps.find((s) => s.blockType === "web_search");
		expect(wsStep?.status).toBe("succeeded");
		expect(wsStep?.output?.results).toBeDefined();

		// The model node received the search results in its resolved prompt.
		expect(modelSawPrompt).toContain("hit:what is rox");
		const modelStep = recorder.steps.find((s) => s.blockType === "model");
		expect(modelStep?.status).toBe("succeeded");
		expect(modelStep?.output?.text).toBe("summarized");
	});
});
