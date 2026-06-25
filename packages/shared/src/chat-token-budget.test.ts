import { describe, expect, it } from "bun:test";
import {
	CHARS_PER_TOKEN,
	estimateThreadTokens,
	estimateTokensFromText,
	resolveChatTokenBudget,
} from "./chat-token-budget";

describe("estimateTokensFromText", () => {
	it("uses the chars-per-token heuristic, rounding up", () => {
		expect(estimateTokensFromText("a".repeat(CHARS_PER_TOKEN * 10))).toBe(10);
		expect(estimateTokensFromText("abcde")).toBe(2);
	});

	it("returns 0 for empty text", () => {
		expect(estimateTokensFromText("")).toBe(0);
	});
});

describe("estimateThreadTokens", () => {
	it("sums fragment text and grows as turns accrue", () => {
		const oneTurn = estimateThreadTokens([{ text: "hello there" }]);
		const twoTurns = estimateThreadTokens([
			{ text: "hello there" },
			{ text: "general kenobi" },
		]);
		expect(twoTurns).toBeGreaterThan(oneTurn);
	});

	it("ignores empty and nullish fragments", () => {
		expect(
			estimateThreadTokens([{ text: "" }, { text: null }, { text: undefined }]),
		).toBe(0);
	});
});

describe("resolveChatTokenBudget", () => {
	it("computes the used fraction", () => {
		const budget = resolveChatTokenBudget({
			usedTokens: 5000,
			maxTokens: 10000,
		});
		expect(budget.usedFraction).toBeCloseTo(0.5);
		expect(budget.usedTokens).toBe(5000);
		expect(budget.maxTokens).toBe(10000);
	});

	it("clamps overflow to a full window", () => {
		expect(
			resolveChatTokenBudget({ usedTokens: 20000, maxTokens: 10000 })
				.usedFraction,
		).toBe(1);
	});

	it("reports a zero fraction when the window is unknown", () => {
		expect(
			resolveChatTokenBudget({ usedTokens: 100, maxTokens: 0 }).usedFraction,
		).toBe(0);
	});
});
