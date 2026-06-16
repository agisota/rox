import { describe, expect, it } from "bun:test";
import {
	type PricingFields,
	type RequestUsage,
	roxCostForRequest,
} from "./rox-models";
import { planRequestSettlement } from "./rox-settlement";

const usage: RequestUsage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };

const paid: PricingFields = {
	publicUsdPerMIn: 3,
	publicUsdPerMOut: 15,
	pricingFamily: "anthropic",
	isFree: false,
};

const free: PricingFields = {
	publicUsdPerMIn: 0,
	publicUsdPerMOut: 0,
	pricingFamily: "other",
	isFree: true,
};

const cost = roxCostForRequest(usage, paid).totalRox;

describe("planRequestSettlement", () => {
	it("records usage but moves nothing for a free model", () => {
		const plan = planRequestSettlement({
			balance: 0,
			usage,
			entry: free,
			tier: "free",
			modelId: "rox-r1",
		});
		expect(plan.decision.reason).toBe("no-charge");
		expect(plan.usage).toEqual({
			modelId: "rox-r1",
			tokensIn: 1_000_000,
			tokensOut: 1_000_000,
			roxCost: 0,
		});
		expect(plan.ledgerDeltaRox).toBeNull();
		expect(plan.newBalanceRox).toBeNull();
	});

	it("debits ledger and balance for a covered paid request", () => {
		const balance = 1_000_000;
		const plan = planRequestSettlement({
			balance,
			usage,
			entry: paid,
			tier: "free",
			modelId: "claude-opus",
		});
		expect(plan.decision.reason).toBe("charged");
		expect(plan.usage.roxCost).toBe(cost);
		expect(plan.usage.modelId).toBe("claude-opus");
		expect(plan.ledgerDeltaRox).toBe(-cost);
		expect(plan.newBalanceRox).toBe(plan.decision.balanceAfter);
	});

	it("records usage but moves nothing when a free-tier user is blocked", () => {
		const plan = planRequestSettlement({
			balance: 1,
			usage,
			entry: paid,
			tier: "free",
			modelId: "claude-opus",
		});
		expect(plan.decision.allowed).toBe(false);
		expect(plan.decision.reason).toBe("insufficient-balance");
		// Usage is still recorded (cost is what the request *would* have cost).
		expect(plan.usage.roxCost).toBe(cost);
		// ...but nothing is debited.
		expect(plan.ledgerDeltaRox).toBeNull();
		expect(plan.newBalanceRox).toBeNull();
	});

	it("debits a subscriber postpaid into a negative balance", () => {
		const plan = planRequestSettlement({
			balance: 0,
			usage,
			entry: paid,
			tier: "subscriber",
			modelId: "claude-opus",
		});
		expect(plan.decision.reason).toBe("postpaid");
		expect(plan.ledgerDeltaRox).toBe(-cost);
		expect(plan.newBalanceRox).toBe(plan.decision.balanceAfter);
		expect(plan.newBalanceRox).toBeLessThan(0);
	});

	it("clamps negative token counts to zero in the usage row", () => {
		const plan = planRequestSettlement({
			balance: 0,
			usage: { inputTokens: -5, outputTokens: -1 },
			entry: free,
			tier: "free",
			modelId: "rox-r1",
		});
		expect(plan.usage.tokensIn).toBe(0);
		expect(plan.usage.tokensOut).toBe(0);
	});
});
