import { describe, expect, it } from "bun:test";
import {
	buildDisplayState,
	mapAgentMessage,
	mapAgentMessages,
	type OmpAgentMessage,
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
