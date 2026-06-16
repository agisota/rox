import { describe, expect, it } from "bun:test";
import { decideRoxCharge } from "./rox-charge";
import {
	type PricingFields,
	type RequestUsage,
	roxCostForRequest,
} from "./rox-models";
import { quantizeRox } from "./rox-pricing";

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

describe("decideRoxCharge", () => {
	it("guards the fixture: the paid model has a positive cost", () => {
		expect(cost).toBeGreaterThan(0);
	});

	it("allows a free model and never debits, regardless of tier or balance", () => {
		for (const tier of ["free", "subscriber"] as const) {
			const d = decideRoxCharge({ balance: 0, usage, entry: free, tier });
			expect(d.allowed).toBe(true);
			expect(d.reason).toBe("no-charge");
			expect(d.cost).toBe(0);
			expect(d.balanceAfter).toBe(0);
			expect(d.entry).toBeNull();
		}
	});

	it("charges a free-tier user when the balance covers the request", () => {
		const balance = 1_000_000;
		const d = decideRoxCharge({
			balance,
			usage,
			entry: paid,
			tier: "free",
			ctx: { modelId: "claude-opus", requestId: "req-1" },
		});
		expect(d.allowed).toBe(true);
		expect(d.reason).toBe("charged");
		expect(d.cost).toBe(cost);
		expect(d.balanceAfter).toBe(quantizeRox(balance - cost));
		expect(d.entry).toMatchObject({
			delta: -cost,
			reason: "request",
			modelId: "claude-opus",
			requestId: "req-1",
		});
	});

	it("blocks a free-tier user who cannot cover the request", () => {
		const balance = 1;
		const d = decideRoxCharge({ balance, usage, entry: paid, tier: "free" });
		expect(d.allowed).toBe(false);
		expect(d.reason).toBe("insufficient-balance");
		expect(d.cost).toBe(cost);
		expect(d.balanceAfter).toBe(balance);
		expect(d.entry).toBeNull();
	});

	it("lets a subscriber run postpaid into a negative balance", () => {
		const d = decideRoxCharge({
			balance: 0,
			usage,
			entry: paid,
			tier: "subscriber",
			ctx: { modelId: "claude-opus", requestId: "req-2" },
		});
		expect(d.allowed).toBe(true);
		expect(d.reason).toBe("postpaid");
		expect(d.cost).toBe(cost);
		expect(d.balanceAfter).toBe(quantizeRox(0 - cost));
		expect(d.balanceAfter).toBeLessThan(0);
		expect(d.entry).toMatchObject({
			delta: -cost,
			reason: "request",
			modelId: "claude-opus",
			requestId: "req-2",
		});
	});
});
