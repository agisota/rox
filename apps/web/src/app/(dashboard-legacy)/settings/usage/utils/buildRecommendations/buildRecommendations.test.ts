import { describe, expect, it } from "bun:test";
import { buildRecommendations, type UsageRow } from "./buildRecommendations";

const row = (over: Partial<UsageRow>): UsageRow => ({
	modelId: "gpt-5",
	tokensIn: 1_000,
	tokensOut: 500,
	usdCost: 0.01,
	roxCost: 1,
	...over,
});

describe("buildRecommendations", () => {
	it("returns nothing for empty usage", () => {
		expect(buildRecommendations([])).toEqual([]);
	});

	it("flags a dominant paid model", () => {
		const recs = buildRecommendations([
			row({ modelId: "gpt-5", roxCost: 9 }),
			row({ modelId: "claude-opus", roxCost: 1 }),
		]);
		expect(recs.some((r) => r.includes("gpt-5"))).toBe(true);
	});

	it("nudges free-model usage when only paid models are used", () => {
		const recs = buildRecommendations([row({ modelId: "gpt-5", roxCost: 2 })]);
		expect(recs.some((r) => r.includes("Rox R1"))).toBe(true);
	});

	it("does not nudge when rox-r1 is already used", () => {
		const recs = buildRecommendations([row({ modelId: "rox-r1", roxCost: 0 })]);
		expect(recs.some((r) => r.includes("free forever"))).toBe(false);
	});

	it("warns about oversized prompts", () => {
		const recs = buildRecommendations([
			row({ modelId: "rox-r1", roxCost: 0, tokensIn: 80_000 }),
		]);
		expect(recs.some((r) => r.includes("large"))).toBe(true);
	});
});
