import { describe, expect, it } from "bun:test";
import {
	estimateTokensFromText,
	estimateUsedTokens,
	extractTextsFromParts,
	normalizeModelId,
	resolveModelContextWindow,
	selectContextUsage,
} from "./context-usage";

describe("context-usage", () => {
	it("estimates tokens from text length (chars/4, rounded up)", () => {
		expect(estimateTokensFromText("")).toBe(0);
		expect(estimateTokensFromText("abcd")).toBe(1);
		expect(estimateTokensFromText("abcde")).toBe(2);
		expect(estimateTokensFromText("a".repeat(400))).toBe(100);
	});

	it("sums used tokens across fragments and ignores empties", () => {
		expect(estimateUsedTokens([])).toBe(0);
		expect(estimateUsedTokens(["abcd", "", "abcd"])).toBe(2);
	});

	it("normalizes provider-prefixed ids to the bare lowercased id", () => {
		expect(normalizeModelId("openai/GPT-5.5")).toBe("gpt-5.5");
		expect(normalizeModelId("  Claude-Opus-4-8 ")).toBe("claude-opus-4-8");
		expect(normalizeModelId("r1")).toBe("r1");
	});

	it("resolves catalog context windows by canonical id", () => {
		expect(resolveModelContextWindow("rox-r1")).toBe(256_000);
		expect(resolveModelContextWindow("claude-opus-4-8")).toBe(200_000);
		expect(resolveModelContextWindow("openai/gpt-5.5")).toBe(400_000);
		expect(resolveModelContextWindow("gemini-2.5-pro")).toBe(1_000_000);
	});

	it("infers a window for unknown ids and falls back to the default", () => {
		expect(resolveModelContextWindow("some-gemini-exp")).toBe(1_000_000);
		expect(resolveModelContextWindow("custom-claude-x")).toBe(200_000);
		expect(resolveModelContextWindow("totally-unknown")).toBe(128_000);
		expect(resolveModelContextWindow("")).toBe(128_000);
		expect(resolveModelContextWindow(null)).toBe(128_000);
		expect(resolveModelContextWindow(undefined)).toBe(128_000);
	});

	it("extracts text fragments from mixed message parts", () => {
		expect(
			extractTextsFromParts([
				"raw",
				{ type: "text", text: "hello" },
				{ type: "thinking", thinking: "ponder" },
				{ type: "tool_result", content: "result-text" },
				{ type: "tool_call", text: undefined },
				{ type: "file" },
				"",
			]),
		).toEqual(["raw", "hello", "ponder", "result-text"]);
	});

	it("selects a full usage reading from texts + model id", () => {
		expect(selectContextUsage(["a".repeat(400)], "rox-r1")).toEqual({
			usedTokens: 100,
			maxTokens: 256_000,
		});
	});
});
