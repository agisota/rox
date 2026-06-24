import { describe, expect, it } from "bun:test";
import {
	buildDisplayState,
	buildHostToolDefinitions,
	buildHostToolErrorResult,
	mapAgentMessage,
	mapAgentMessages,
	mapHostToolResult,
	mapToolToHostDefinition,
	type OmpAgentMessage,
	type RoxHostTool,
	toHostToolParameters,
} from "./omp-mapping";
import { resolveOmpModelRouting } from "./omp-models";

/**
 * Pins the pure omp → mastra mappers against the verified `omp/15.11.0 --mode
 * rpc` frame shapes captured in a live spike. These are the translation layer
 * between omp `AgentMessage`/`get_state` and Rox's `HarnessMessage`/
 * `HarnessDisplayState`; they must stay faithful to the omp wire shape.
 */

describe("mapAgentMessage", () => {
	it("maps a text assistant message with stopReason:stop → complete", () => {
		const omp: OmpAgentMessage = {
			role: "assistant",
			content: [{ type: "text", text: "OK" }],
			stopReason: "stop",
			timestamp: 1782294761053,
		};
		const result = mapAgentMessage(omp, 0);
		expect(result.role).toBe("assistant");
		expect(result.content).toEqual([{ type: "text", text: "OK" }]);
		expect(result.stopReason).toBe("complete");
		expect(result.createdAt).toBeInstanceOf(Date);
	});

	it("surfaces omp error fields (stopReason:error + errorMessage)", () => {
		const omp: OmpAgentMessage = {
			role: "assistant",
			content: [],
			stopReason: "error",
			errorStatus: 400,
			errorMessage: "400 Please reduce the length of the messages",
		};
		const result = mapAgentMessage(omp, 0);
		expect(result.stopReason).toBe("error");
		expect(result.errorMessage).toBe(
			"400 Please reduce the length of the messages",
		);
	});

	it("maps tool_call and tool_result parts", () => {
		const omp: OmpAgentMessage = {
			role: "assistant",
			content: [
				{ type: "tool_call", id: "tc1", name: "read", args: { path: "/x" } },
				{
					type: "tool_result",
					id: "tc1",
					name: "read",
					result: "contents",
					isError: false,
				},
			],
		};
		const result = mapAgentMessage(omp, 0);
		expect(result.content[0]).toEqual({
			type: "tool_call",
			id: "tc1",
			name: "read",
			args: { path: "/x" },
		});
		expect(result.content[1]).toEqual({
			type: "tool_result",
			id: "tc1",
			name: "read",
			result: "contents",
			isError: false,
		});
	});

	it("maps thinking parts and drops unknown part types", () => {
		const omp: OmpAgentMessage = {
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "hmm" },
				{ type: "mystery_part", text: "ignored" },
			],
		};
		const result = mapAgentMessage(omp, 0);
		expect(result.content).toEqual([{ type: "thinking", thinking: "hmm" }]);
	});

	it("derives a stable id from timestamp+index when omp omits id", () => {
		const omp: OmpAgentMessage = {
			role: "user",
			content: [{ type: "text", text: "hi" }],
			timestamp: 1782294758724,
		};
		expect(mapAgentMessage(omp, 3).id).toBe("omp-1782294758724-3");
	});
});

describe("mapAgentMessages", () => {
	it("maps the get_messages array order-preserving", () => {
		const messages: OmpAgentMessage[] = [
			{ role: "user", content: [{ type: "text", text: "Reply with OK" }] },
			{
				role: "assistant",
				content: [{ type: "text", text: "OK" }],
				stopReason: "stop",
			},
		];
		const result = mapAgentMessages(messages);
		expect(result).toHaveLength(2);
		expect(result[0]?.role).toBe("user");
		expect(result[1]?.role).toBe("assistant");
		expect(result[1]?.stopReason).toBe("complete");
	});
});

describe("buildDisplayState", () => {
	it("maps isStreaming → isRunning and carries currentMessage/pending fields", () => {
		const currentMessage = mapAgentMessage(
			{ role: "assistant", content: [{ type: "text", text: "..." }] },
			0,
		);
		const ds = buildDisplayState({
			state: { isStreaming: true, isCompacting: false },
			currentMessage,
			pendingApproval: {
				toolCallId: "id1",
				toolName: "bash",
				args: {},
			},
			pendingQuestion: null,
		});
		expect(ds.isRunning).toBe(true);
		expect(ds.currentMessage).toBe(currentMessage);
		expect(ds.pendingApproval?.toolName).toBe("bash");
		// Canonical zero fields are present and correctly shaped.
		expect(ds.activeTools).toBeInstanceOf(Map);
		expect(ds.tokenUsage.totalTokens).toBe(0);
	});

	it("reports idle when isStreaming is false", () => {
		const ds = buildDisplayState({
			state: { isStreaming: false },
			currentMessage: null,
			pendingApproval: null,
			pendingQuestion: null,
		});
		expect(ds.isRunning).toBe(false);
		expect(ds.currentMessage).toBeNull();
	});
});

describe("resolveOmpModelRouting", () => {
	it("preserves the provider prefix and maps the provider env var", () => {
		const routing = resolveOmpModelRouting("groq/llama-3.3-70b-versatile");
		expect(routing.ompModelId).toBe("groq/llama-3.3-70b-versatile");
		expect(routing.provider).toBe("groq");
		expect(routing.envVar).toBe("GROQ_API_KEY");
		expect(routing.authProviderId).toBe("groq");
	});

	it("maps openai/anthropic/google providers", () => {
		expect(resolveOmpModelRouting("openai/gpt-5.5").envVar).toBe(
			"OPENAI_API_KEY",
		);
		expect(resolveOmpModelRouting("anthropic/claude-opus-4-8").envVar).toBe(
			"ANTHROPIC_API_KEY",
		);
		expect(resolveOmpModelRouting("google/gemini-2.5-pro").envVar).toBe(
			"GEMINI_API_KEY",
		);
	});

	it("returns null env/provider for an unprefixed id", () => {
		const routing = resolveOmpModelRouting("top");
		expect(routing.provider).toBeNull();
		expect(routing.envVar).toBeNull();
	});
});

/**
 * Host-tool bridge mappers (Rox `extraTools` ↔ omp `set_host_tools`/
 * `host_tool_*`). Pinned against the live `omp/15.11.0` host-tool sub-protocol:
 * registration requires non-empty name/description and an object `parameters`;
 * results are `{content:[{type:"text",text}]}`, errors add `isError` at the
 * frame level (carried by the engine, not these pure mappers).
 */
describe("toHostToolParameters", () => {
	it("reads JSON Schema from a Standard-Schema instance (~standard.jsonSchema)", () => {
		const schema = {
			"~standard": {
				version: 1,
				vendor: "zod",
				jsonSchema: {
					input: (opts: { target: string }) => ({
						$target: opts.target,
						type: "object",
						properties: { message: { type: "string" } },
						required: ["message"],
					}),
				},
			},
		};
		const params = toHostToolParameters(schema);
		expect(params.type).toBe("object");
		expect(params.required).toEqual(["message"]);
		// requests draft-07 from the converter
		expect(params.$target).toBe("draft-07");
	});

	it("passes a raw JSON Schema object through unchanged", () => {
		const raw = {
			type: "object",
			properties: { x: { type: "number" } },
			additionalProperties: false,
		};
		expect(toHostToolParameters(raw)).toEqual(raw);
	});

	it("falls back to a permissive object schema for null/undefined", () => {
		expect(toHostToolParameters(undefined)).toEqual({
			type: "object",
			properties: {},
			additionalProperties: true,
		});
		expect(toHostToolParameters(null)).toEqual({
			type: "object",
			properties: {},
			additionalProperties: true,
		});
	});

	it("falls back when the Standard-Schema converter throws", () => {
		const schema = {
			"~standard": {
				jsonSchema: {
					input: () => {
						throw new Error("unsupported target");
					},
				},
			},
		};
		expect(toHostToolParameters(schema)).toEqual({
			type: "object",
			properties: {},
			additionalProperties: true,
		});
	});
});

describe("mapToolToHostDefinition", () => {
	it("translates name/description/inputSchema to an omp host-tool definition", () => {
		const tool: RoxHostTool = {
			description: "Look up a CRM contact",
			inputSchema: {
				type: "object",
				properties: { id: { type: "string" } },
				required: ["id"],
			},
			execute: async () => "ok",
		};
		const def = mapToolToHostDefinition("crm_get_contact", tool);
		expect(def.name).toBe("crm_get_contact");
		expect(def.label).toBe("crm_get_contact");
		expect(def.description).toBe("Look up a CRM contact");
		expect(def.parameters).toEqual({
			type: "object",
			properties: { id: { type: "string" } },
			required: ["id"],
		});
	});

	it("back-fills a non-empty description so omp does not reject the tool", () => {
		const def = mapToolToHostDefinition("noop", {
			execute: async () => null,
		});
		expect(def.description.length).toBeGreaterThan(0);
		expect(def.parameters.type).toBe("object");
	});

	it("trims the tool name", () => {
		const def = mapToolToHostDefinition("  spaced  ", {
			description: "d",
			execute: async () => null,
		});
		expect(def.name).toBe("spaced");
	});
});

describe("buildHostToolDefinitions", () => {
	it("builds definitions only for tools with an execute and a non-empty name", () => {
		const tools: Record<string, RoxHostTool> = {
			good: { description: "g", execute: async () => "x" },
			no_exec: { description: "n" }, // skipped: not invocable
			"": { description: "empty", execute: async () => "y" }, // skipped: no name
		};
		const defs = buildHostToolDefinitions(tools);
		expect(defs.map((d) => d.name)).toEqual(["good"]);
	});

	it("returns an empty array for an empty record", () => {
		expect(buildHostToolDefinitions({})).toEqual([]);
	});
});

describe("mapHostToolResult", () => {
	it("wraps a plain string result as a text content part", () => {
		expect(mapHostToolResult("the answer")).toEqual({
			content: [{ type: "text", text: "the answer" }],
		});
	});

	it("passes through an existing {content:[{type,text}]} result (mastra MCP shape)", () => {
		const mcp = { content: [{ type: "text", text: "from mcp" }] };
		expect(mapHostToolResult(mcp)).toEqual({
			content: [{ type: "text", text: "from mcp" }],
		});
	});

	it("serializes a structured object result so the model still sees it", () => {
		const result = mapHostToolResult({ rows: 3, ok: true });
		expect(result.content).toHaveLength(1);
		expect(result.content[0]?.type).toBe("text");
		expect(result.content[0]?.text).toBe('{"rows":3,"ok":true}');
	});

	it("maps undefined to an empty text part", () => {
		expect(mapHostToolResult(undefined)).toEqual({
			content: [{ type: "text", text: "" }],
		});
	});
});

describe("buildHostToolErrorResult", () => {
	it("surfaces an Error message as the error content", () => {
		expect(buildHostToolErrorResult(new Error("disk offline"))).toEqual({
			content: [{ type: "text", text: "disk offline" }],
			details: {},
		});
	});

	it("stringifies a non-Error rejection", () => {
		expect(buildHostToolErrorResult("boom")).toEqual({
			content: [{ type: "text", text: "boom" }],
			details: {},
		});
	});
});
