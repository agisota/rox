import { describe, expect, it } from "bun:test";
import {
	enrichModelOption,
	formatContextWindow,
	getModelCapabilityMeta,
	normalizeModelId,
	rankEnrichedModels,
} from "./modelCapabilities";

describe("normalizeModelId", () => {
	it("strips provider prefix and lowercases", () => {
		expect(normalizeModelId("anthropic/Claude-Opus-4-8")).toBe(
			"claude-opus-4-8",
		);
		expect(normalizeModelId("openai/gpt-5.5")).toBe("gpt-5.5");
		expect(normalizeModelId("r1")).toBe("r1");
	});
});

describe("getModelCapabilityMeta", () => {
	it("returns catalog metadata for known models", () => {
		const opus = getModelCapabilityMeta("anthropic/claude-opus-4-8");
		expect(opus.capabilities).toContain("vision");
		expect(opus.capabilities).toContain("tools");
		expect(opus.strength).toBeGreaterThan(90);
		expect(opus.contextWindowTokens).toBe(200_000);
	});

	it("infers capabilities for unknown ids via heuristics", () => {
		const vision = getModelCapabilityMeta("acme-vision-pro");
		expect(vision.capabilities).toContain("vision");
		expect(vision.capabilities).toContain("tools");

		const reasoner = getModelCapabilityMeta("custom-reasoner-1");
		expect(reasoner.capabilities).toContain("reasoning");
	});

	it("does not assume tools for embedding models", () => {
		const embed = getModelCapabilityMeta("text-embedding-3-large");
		expect(embed.capabilities).not.toContain("tools");
	});

	it("flags long context for million-token windows", () => {
		const gemini = getModelCapabilityMeta("google/gemini-2.5-pro");
		expect(gemini.capabilities).toContain("longContext");
		expect(gemini.contextWindowTokens).toBeGreaterThanOrEqual(1_000_000);
	});
});

describe("formatContextWindow", () => {
	it("formats K and M windows, omits sub-1K", () => {
		expect(formatContextWindow(256_000)).toBe("256K");
		expect(formatContextWindow(1_000_000)).toBe("1M");
		expect(formatContextWindow(400_000)).toBe("400K");
		expect(formatContextWindow(500)).toBeNull();
	});
});

describe("rankEnrichedModels", () => {
	it("orders by strength desc, then context window, then name", () => {
		const ranked = rankEnrichedModels([
			enrichModelOption({
				id: "groq/llama-3.3-70b-versatile",
				name: "Llama",
				provider: "Groq",
			}),
			enrichModelOption({
				id: "anthropic/claude-opus-4-8",
				name: "Opus 4.8",
				provider: "Anthropic",
			}),
			enrichModelOption({
				id: "anthropic/claude-haiku-4-5",
				name: "Haiku 4.5",
				provider: "Anthropic",
			}),
		]);
		expect(ranked.map((model) => model.name)).toEqual([
			"Opus 4.8",
			"Haiku 4.5",
			"Llama",
		]);
	});

	it("does not mutate the input array", () => {
		const input = [
			enrichModelOption({ id: "a", name: "A", provider: "Groq" }),
			enrichModelOption({ id: "r1", name: "ROX R1", provider: "Rox" }),
		];
		const snapshot = [...input];
		rankEnrichedModels(input);
		expect(input).toEqual(snapshot);
	});
});
