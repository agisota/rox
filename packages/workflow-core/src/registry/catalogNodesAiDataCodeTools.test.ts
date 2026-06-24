import { describe, expect, test } from "bun:test";
import { WorkflowErrorCode } from "../errors";
import { validateGraph } from "../graph";
import type { RoxBlockState, RoxWorkflowState } from "../types";
import { getNodeType, isRegisteredNodeType, listByCategory } from "./index";
import { NodeCategory } from "./nodeCategory";
import { validateNodeConfig } from "./validateNodeConfig";

/**
 * Slice 1b catalog — AI / Data / Code / Tools modules (design-time only: no
 * executor). Mirrors `catalogNodes.test.ts` (Logic/Input/Output) and guards each
 * module's configSchema, ports, required fields, palette category, and the
 * registry-driven validateNodeConfig / validateGraph integration.
 */

const AI_IDS = [
	"model",
	"knowledge_retrieval",
	"embedding",
	"classifier",
	"structured_extract",
] as const;
const DATA_IDS = [
	"http_request",
	"db_query",
	"transform",
	"variable_set",
	"parser",
] as const;
const CODE_IDS = ["code"] as const;
const TOOLS_IDS = ["tool_call", "mcp_tool", "web_search"] as const;
const ALL_IDS = [...AI_IDS, ...DATA_IDS, ...CODE_IDS, ...TOOLS_IDS];

const BUILTIN_IDS = [
	"start",
	"agent_run",
	"loop",
	"human_approval",
	"response",
];

function need(id: string) {
	const def = getNodeType(id);
	if (!def) throw new Error(`${id} not registered`);
	return def;
}

/** Build a complete RoxWorkflowState (mirrors validateGraph.test.ts). */
function makeState(
	blocks: Record<string, RoxBlockState>,
	edges: RoxWorkflowState["edges"],
): RoxWorkflowState {
	return {
		blocks,
		edges,
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "test" },
	};
}

describe("catalog node types — AI/Data/Code/Tools (Slice 1b)", () => {
	test("all AI/Data/Code/Tools catalog types register into the shared registry", () => {
		for (const id of ALL_IDS) {
			expect(isRegisteredNodeType(id)).toBe(true);
			expect(getNodeType(id)?.id).toBe(id);
		}
	});

	test("types land in the right palette categories", () => {
		const ai = listByCategory(NodeCategory.AI).map((d) => d.id);
		const data = listByCategory(NodeCategory.Data).map((d) => d.id);
		const code = listByCategory(NodeCategory.Code).map((d) => d.id);
		const tools = listByCategory(NodeCategory.Tools).map((d) => d.id);
		expect(ai).toEqual(expect.arrayContaining([...AI_IDS]));
		expect(data).toEqual(expect.arrayContaining([...DATA_IDS]));
		expect(code).toEqual(expect.arrayContaining([...CODE_IDS]));
		expect(tools).toEqual(expect.arrayContaining([...TOOLS_IDS]));
	});

	test("no new catalog type collides with a built-in id", () => {
		for (const id of ALL_IDS) {
			expect(BUILTIN_IDS.includes(id)).toBe(false);
		}
	});

	test("every module has at least one in/out port and a fields list", () => {
		for (const id of ALL_IDS) {
			const def = need(id);
			expect(def.outputs.length).toBeGreaterThan(0);
			expect(def.fields.length).toBeGreaterThan(0);
		}
	});

	test("every field key round-trips through its configSchema", () => {
		for (const id of ALL_IDS) {
			const def = need(id);
			for (const field of def.fields) {
				const sample = sampleForField(field.key, field.kind);
				const result = def.configSchema.safeParse({ [field.key]: sample });
				expect(result.success).toBe(true);
			}
		}
	});

	test("every empty config parses (all fields optional at the schema layer)", () => {
		// Required-ness is enforced by validateNodeConfig via field hints, not the
		// schema — so an empty object must always parse (additive/backward-compat).
		for (const id of ALL_IDS) {
			expect(need(id).configSchema.safeParse({}).success).toBe(true);
		}
	});

	// --- AI -------------------------------------------------------------------

	test("model: out/error ports, required model+userPrompt, bounded params", () => {
		const def = need("model");
		expect(def.category).toBe(NodeCategory.AI);
		expect(def.outputs.map((p) => p.name)).toEqual(["out", "error"]);
		expect(def.fields.find((f) => f.key === "model")?.required).toBe(true);
		expect(def.fields.find((f) => f.key === "userPrompt")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({
				model: "gpt-5",
				userPrompt: "hi",
				temperature: 0.7,
				maxTokens: 1024,
			}).success,
		).toBe(true);
		expect(def.configSchema.safeParse({ temperature: 3 }).success).toBe(false);
		expect(def.configSchema.safeParse({ maxTokens: 0 }).success).toBe(false);
		expect(def.configSchema.safeParse({ userPrompt: "" }).success).toBe(false);
	});

	test("knowledge_retrieval: required kb+query, topK bounds, kb option source", () => {
		const def = need("knowledge_retrieval");
		const kb = def.fields.find((f) => f.key === "knowledgeBase");
		expect(kb?.required).toBe(true);
		expect(kb?.optionsSource).toBe("knowledgeBases");
		expect(def.fields.find((f) => f.key === "query")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({ knowledgeBase: "kb1", query: "q", topK: 5 })
				.success,
		).toBe(true);
		expect(def.configSchema.safeParse({ topK: 0 }).success).toBe(false);
		expect(def.configSchema.safeParse({ topK: 1.5 }).success).toBe(false);
	});

	test("embedding: required model+input, vector out-port typed array", () => {
		const def = need("embedding");
		expect(def.outputs.find((p) => p.name === "out")?.type).toBe("array");
		expect(def.fields.find((f) => f.key === "model")?.required).toBe(true);
		expect(def.fields.find((f) => f.key === "input")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({ model: "text-embed", input: "hello" })
				.success,
		).toBe(true);
		expect(def.configSchema.safeParse({ input: "" }).success).toBe(false);
	});

	test("classifier: required classes record of strings", () => {
		const def = need("classifier");
		expect(def.fields.find((f) => f.key === "classes")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({
				model: "gpt-5",
				input: "x",
				classes: { spam: "junk", ham: "ok" },
			}).success,
		).toBe(true);
		// class descriptions must be strings.
		expect(def.configSchema.safeParse({ classes: { spam: 1 } }).success).toBe(
			false,
		);
	});

	test("structured_extract: required schema, object out-port", () => {
		const def = need("structured_extract");
		expect(def.outputs.find((p) => p.name === "out")?.type).toBe("object");
		expect(def.fields.find((f) => f.key === "schema")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({
				model: "gpt-5",
				input: "x",
				schema: '{"type":"object"}',
			}).success,
		).toBe(true);
		expect(def.configSchema.safeParse({ schema: "" }).success).toBe(false);
	});

	// --- DATA -----------------------------------------------------------------

	test("http_request: method enum + required url, headers record", () => {
		const def = need("http_request");
		expect(def.category).toBe(NodeCategory.Data);
		expect(def.outputs.map((p) => p.name)).toEqual(["out", "error"]);
		expect(def.fields.find((f) => f.key === "method")?.required).toBe(true);
		expect(def.fields.find((f) => f.key === "url")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({
				method: "POST",
				url: "https://x.test",
				headers: { Authorization: "Bearer x" },
				body: "{}",
			}).success,
		).toBe(true);
		expect(def.configSchema.safeParse({ method: "TRACE" }).success).toBe(false);
		expect(def.configSchema.safeParse({ url: "" }).success).toBe(false);
	});

	test("db_query: connection option source + required sql, array out-port", () => {
		const def = need("db_query");
		expect(def.outputs.find((p) => p.name === "out")?.type).toBe("array");
		const conn = def.fields.find((f) => f.key === "connection");
		expect(conn?.required).toBe(true);
		expect(conn?.optionsSource).toBe("dbConnections");
		expect(def.fields.find((f) => f.key === "sql")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({
				connection: "main",
				sql: "SELECT 1",
				params: { id: "ctx.id" },
			}).success,
		).toBe(true);
		expect(def.configSchema.safeParse({ params: { id: 1 } }).success).toBe(
			false,
		);
	});

	test("transform: mode enum, template + mapping record", () => {
		const def = need("transform");
		expect(def.outputs.map((p) => p.name)).toEqual(["out"]);
		expect(def.configSchema.safeParse({ mode: "template" }).success).toBe(true);
		expect(def.configSchema.safeParse({ mode: "mapping" }).success).toBe(true);
		expect(def.configSchema.safeParse({ mode: "bogus" }).success).toBe(false);
		expect(
			def.configSchema.safeParse({ mapping: { full: "a + b" } }).success,
		).toBe(true);
	});

	test("variable_set: identifier key constraint + required value", () => {
		const def = need("variable_set");
		expect(def.fields.find((f) => f.key === "key")?.required).toBe(true);
		expect(def.fields.find((f) => f.key === "value")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({ key: "customer_id", value: "42" }).success,
		).toBe(true);
		// must be a valid identifier (no spaces, not starting with a digit).
		expect(def.configSchema.safeParse({ key: "1bad" }).success).toBe(false);
		expect(def.configSchema.safeParse({ key: "has space" }).success).toBe(
			false,
		);
	});

	test("parser: format enum + optional input, out/error ports", () => {
		const def = need("parser");
		expect(def.outputs.map((p) => p.name)).toEqual(["out", "error"]);
		expect(def.fields.find((f) => f.key === "format")?.required).toBe(true);
		expect(def.fields.find((f) => f.key === "input")?.required).toBeUndefined();
		expect(def.configSchema.safeParse({ format: "csv" }).success).toBe(true);
		expect(def.configSchema.safeParse({ format: "toml" }).success).toBe(false);
	});

	// --- CODE -----------------------------------------------------------------

	test("code: language enum + required source, in/out ports (config only)", () => {
		const def = need("code");
		expect(def.category).toBe(NodeCategory.Code);
		expect(def.outputs.map((p) => p.name)).toEqual(["out", "error"]);
		expect(def.fields.find((f) => f.key === "language")?.required).toBe(true);
		expect(def.fields.find((f) => f.key === "source")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({
				language: "typescript",
				source: "return 1",
				inputs: { a: "ctx.a" },
				outputs: { r: "number" },
			}).success,
		).toBe(true);
		expect(def.configSchema.safeParse({ language: "ruby" }).success).toBe(
			false,
		);
		expect(def.configSchema.safeParse({ source: "" }).success).toBe(false);
	});

	// --- TOOLS ----------------------------------------------------------------

	test("tool_call: tool option source + arguments record", () => {
		const def = need("tool_call");
		expect(def.category).toBe(NodeCategory.Tools);
		const tool = def.fields.find((f) => f.key === "tool");
		expect(tool?.required).toBe(true);
		expect(tool?.optionsSource).toBe("tools");
		expect(
			def.configSchema.safeParse({
				tool: "search",
				arguments: { q: "ctx.query" },
			}).success,
		).toBe(true);
		expect(def.configSchema.safeParse({ arguments: { q: 1 } }).success).toBe(
			false,
		);
	});

	test("mcp_tool: server option source + required tool", () => {
		const def = need("mcp_tool");
		const server = def.fields.find((f) => f.key === "server");
		expect(server?.required).toBe(true);
		expect(server?.optionsSource).toBe("mcpServers");
		expect(def.fields.find((f) => f.key === "tool")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({
				server: "fs",
				tool: "read_file",
				arguments: { path: "/tmp/x" },
			}).success,
		).toBe(true);
		expect(def.configSchema.safeParse({ tool: "" }).success).toBe(false);
	});

	test("web_search: required query, maxResults bounds, array out-port", () => {
		const def = need("web_search");
		expect(def.outputs.find((p) => p.name === "out")?.type).toBe("array");
		expect(def.fields.find((f) => f.key === "query")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({ query: "rox", maxResults: 10 }).success,
		).toBe(true);
		expect(def.configSchema.safeParse({ maxResults: 0 }).success).toBe(false);
		expect(def.configSchema.safeParse({ maxResults: 51 }).success).toBe(false);
		expect(def.configSchema.safeParse({ query: "" }).success).toBe(false);
	});

	// --- validateNodeConfig integration --------------------------------------

	test("validateNodeConfig flags a missing required field on a new catalog node", () => {
		const def = need("model");
		const issues = validateNodeConfig(def, { type: "model" }, "m1");
		expect(issues.map((i) => i.code)).toContain(
			WorkflowErrorCode.MISSING_REQUIRED_CONFIG,
		);
		expect(issues.every((i) => i.blockId === "m1")).toBe(true);
	});

	test("validateNodeConfig passes when required fields are provided", () => {
		const def = need("http_request");
		expect(
			validateNodeConfig(
				def,
				{
					type: "http_request",
					subBlocks: { method: "GET", url: "https://x.test" },
				},
				"h1",
			),
		).toEqual([]);
	});

	test("validateNodeConfig surfaces an invalid-config issue from the schema", () => {
		const def = need("web_search");
		const issues = validateNodeConfig(
			def,
			{ type: "web_search", subBlocks: { query: "q", maxResults: 999 } },
			"w1",
		);
		expect(issues.map((i) => i.code)).toContain(
			WorkflowErrorCode.INVALID_NODE_CONFIG,
		);
	});

	// --- validateGraph integration -------------------------------------------

	test("validateGraph stays happy with a start → model → response graph", () => {
		const state = makeState(
			{
				s: { type: "start" },
				m: {
					type: "model",
					subBlocks: { model: "gpt-5", userPrompt: "hi" },
				},
				r: { type: "response" },
			},
			[
				{ id: "e1", source: "s", target: "m" },
				{ id: "e2", source: "m", target: "r" },
			],
		);
		const result = validateGraph(state, { resolveNodeType: getNodeType });
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test("validateGraph flags a new catalog node missing its required incoming port", () => {
		// `http_request` has a required `in` port; with no incoming edge the
		// registry port check should surface a MISSING_REQUIRED_PORT issue.
		const state = makeState(
			{
				s: { type: "start" },
				h: {
					type: "http_request",
					subBlocks: { method: "GET", url: "https://x.test" },
				},
			},
			[],
		);
		const result = validateGraph(state, { resolveNodeType: getNodeType });
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain(
			WorkflowErrorCode.MISSING_REQUIRED_PORT,
		);
	});
});

/** Per-field sample that satisfies the AI/Data/Code/Tools schemas. */
function sampleForField(key: string, kind: string): unknown {
	if (kind === "key-value") return { k: "v" };
	if (kind === "number") return 1;
	if (kind === "select") {
		switch (key) {
			case "method":
				return "GET";
			case "format":
				return "json";
			case "language":
				return "javascript";
			case "mode":
				return "template";
			default:
				return "sample";
		}
	}
	if (key === "key") return "valid_key";
	return "sample";
}
