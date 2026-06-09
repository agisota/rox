import { describe, expect, it } from "bun:test";
import {
	type ModelProviderFamily,
	ROX_PER_USDT,
	ROX_PRICE_DIVISOR_CONFIG,
	ROX_PRICE_DIVISORS,
	resolveProviderFamily,
	roxCostForTokens,
	roxPricePerMillion,
	roxToUsd,
	STARTING_BALANCE_ROX,
	usdToRox,
} from "./rox-pricing";

describe("rox-pricing", () => {
	it("starting balance: $5 USDT == 500 Rox", () => {
		expect(ROX_PER_USDT).toBe(100);
		expect(STARTING_BALANCE_ROX).toBe(500);
	});

	it("usd<->rox conversion is consistent", () => {
		expect(usdToRox(5)).toBe(500);
		expect(roxToUsd(500)).toBe(5);
		expect(roxToUsd(usdToRox(3.21))).toBeCloseTo(3.21, 10);
	});

	it("resolves provider families", () => {
		expect(resolveProviderFamily("x-ai/grok-2")).toBe("xai");
		expect(resolveProviderFamily("grok-beta")).toBe("xai");
		expect(resolveProviderFamily("openai/gpt-4o")).toBe("openai");
		expect(resolveProviderFamily("o3-mini")).toBe("openai");
		expect(resolveProviderFamily("anthropic/claude-opus")).toBe("anthropic");
		expect(resolveProviderFamily("google/gemini-2.0")).toBe("google");
		expect(resolveProviderFamily("deepseek-chat")).toBe("other");
		expect(resolveProviderFamily("cohere-command")).toBe("other");
	});

	it("applies the correct divisor per family", () => {
		expect(ROX_PRICE_DIVISORS.xai).toBe(7.5);
		expect(ROX_PRICE_DIVISORS.openai).toBe(7.5);
		expect(ROX_PRICE_DIVISORS.anthropic).toBe(5.25);
		expect(ROX_PRICE_DIVISORS.google).toBe(12.25);
		expect(ROX_PRICE_DIVISORS.other).toBe(25);
	});

	it("derives the flat divisor map from the provenance config", () => {
		const families = Object.keys(ROX_PRICE_DIVISORS) as ModelProviderFamily[];
		// Every family in the config appears in the derived map and vice versa.
		expect(Object.keys(ROX_PRICE_DIVISOR_CONFIG).sort()).toEqual(
			families.sort(),
		);
		for (const family of families) {
			const config = ROX_PRICE_DIVISOR_CONFIG[family];
			// Derived map matches the configured divisor exactly.
			expect(ROX_PRICE_DIVISORS[family]).toBe(config.divisor);
			// Divisor must be a positive, finite margin lever (never 0 → ÷0).
			expect(config.divisor).toBeGreaterThan(0);
			expect(Number.isFinite(config.divisor)).toBe(true);
			// Provenance is recorded and auditable.
			expect(config.source.length).toBeGreaterThan(0);
			expect(["weekly", "monthly", "quarterly"]).toContain(
				config.reviewCadence,
			);
			expect(config.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(Number.isNaN(Date.parse(config.lastReviewed))).toBe(false);
		}
	});

	it("computes Rox price per million from public USD price", () => {
		// openai $10/M -> /7.5 = $1.3333/M -> x100 = 133.33 Rox/M
		expect(roxPricePerMillion(10, "openai/gpt-4o")).toBeCloseTo(133.333, 2);
		// claude $15/M -> /5.25 = $2.857/M -> 285.71 Rox/M
		expect(roxPricePerMillion(15, "claude-opus")).toBeCloseTo(285.714, 2);
		// gemini $7/M -> /12.25 = $0.5714/M -> 57.14 Rox/M
		expect(roxPricePerMillion(7, "gemini-2.0")).toBeCloseTo(57.142, 2);
		// deepseek $1/M -> /25 = $0.04/M -> 4 Rox/M
		expect(roxPricePerMillion(1, "deepseek-latest")).toBeCloseTo(4, 6);
	});

	it("computes Rox cost for a token count", () => {
		// 500k tokens of a $10/M openai model = 0.5 * 133.33 = 66.66 Rox
		expect(roxCostForTokens(500_000, 10, "openai/gpt-4o")).toBeCloseTo(
			66.666,
			2,
		);
		// 2M tokens of a $1/M "other" model = 2 * 4 = 8 Rox
		expect(roxCostForTokens(2_000_000, 1, "deepseek")).toBeCloseTo(8, 6);
	});
});
