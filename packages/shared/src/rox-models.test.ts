import { describe, expect, it } from "bun:test";
import {
	isFreeModel,
	ROX_R1,
	ROX_R1_MIRRORS,
	ROX_R1_MODEL_ID,
	type RoxModelCatalogEntry,
	roxCostForRequest,
} from "./rox-models";

// A paid "other"-family model (divisor 25) with distinct in/out prices, chosen
// so 1M tokens produce clean integer Rox amounts: in 25 USD/M -> 25/25=1 USD/M
// -> 100 Rox/M; out 50 USD/M -> 2 USD/M -> 200 Rox/M.
const PAID: Pick<
	RoxModelCatalogEntry,
	"publicUsdPerMIn" | "publicUsdPerMOut" | "pricingFamily" | "isFree"
> = {
	publicUsdPerMIn: 25,
	publicUsdPerMOut: 50,
	pricingFamily: "other",
	isFree: false,
};

describe("rox-models", () => {
	it("rox r1 is a free-forever, zero-priced model", () => {
		expect(ROX_R1.modelId).toBe(ROX_R1_MODEL_ID);
		expect(ROX_R1.isFree).toBe(true);
		expect(ROX_R1.publicUsdPerMIn).toBe(0);
		expect(ROX_R1.publicUsdPerMOut).toBe(0);
		expect(isFreeModel(ROX_R1)).toBe(true);
	});

	it("rox r1 mirrors groq-compound-latest capabilities", () => {
		expect(ROX_R1_MIRRORS).toBe("groq-compound-latest");
		expect(ROX_R1.tools.toolCall).toBe(true);
		expect(ROX_R1.tools.supportedTools).toContain("web_search");
		expect(ROX_R1.limits.contextWindow).toBe(131_072);
	});

	it("isFreeModel reflects the isFree flag", () => {
		expect(isFreeModel({ isFree: false })).toBe(false);
		expect(isFreeModel({ isFree: true })).toBe(true);
	});

	describe("roxCostForRequest", () => {
		it("charges input and output separately via the provider divisor", () => {
			const cost = roxCostForRequest(
				{ inputTokens: 1_000_000, outputTokens: 1_000_000 },
				PAID,
			);
			expect(cost.inputRox).toBeCloseTo(100, 6);
			expect(cost.outputRox).toBeCloseTo(200, 6);
			expect(cost.totalRox).toBeCloseTo(300, 6);
			expect(cost.isFree).toBe(false);
		});

		it("scales linearly with token counts", () => {
			const cost = roxCostForRequest(
				{ inputTokens: 500_000, outputTokens: 250_000 },
				PAID,
			);
			expect(cost.inputRox).toBeCloseTo(50, 6);
			expect(cost.outputRox).toBeCloseTo(50, 6);
			expect(cost.totalRox).toBeCloseTo(100, 6);
		});

		it("a free model (rox r1) is always zero, regardless of usage", () => {
			const cost = roxCostForRequest(
				{ inputTokens: 9_999_999, outputTokens: 9_999_999 },
				ROX_R1,
			);
			expect(cost).toEqual({
				inputRox: 0,
				outputRox: 0,
				totalRox: 0,
				isFree: true,
			});
		});

		it("zero usage costs nothing on a paid model", () => {
			const cost = roxCostForRequest({ inputTokens: 0, outputTokens: 0 }, PAID);
			expect(cost.totalRox).toBe(0);
			expect(cost.isFree).toBe(false);
		});

		it("clamps negative token counts to zero", () => {
			const cost = roxCostForRequest(
				{ inputTokens: -100, outputTokens: -100 },
				PAID,
			);
			expect(cost.totalRox).toBe(0);
		});

		it("applies the anthropic divisor (÷5.25) for a claude-family model", () => {
			const cost = roxCostForRequest(
				{ inputTokens: 1_000_000, outputTokens: 0 },
				{
					publicUsdPerMIn: 15,
					publicUsdPerMOut: 75,
					pricingFamily: "anthropic",
					isFree: false,
				},
			);
			// 15 USD/M ÷ 5.25 = 2.857… USD/M -> ×100 Rox = 285.714… Rox
			expect(cost.inputRox).toBeCloseTo((15 / 5.25) * 100, 6);
		});
	});
});
