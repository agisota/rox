import { describe, expect, it } from "bun:test";
import { canAfford, perksFor, ROX_PERKS, resolveTier } from "./rox-perks";

describe("rox-perks", () => {
	it("free users are hard-stopped at zero balance", () => {
		expect(ROX_PERKS.free.canSpendBelowZero).toBe(false);
		expect(canAfford("free", 100, 50)).toBe(true);
		expect(canAfford("free", 50, 50)).toBe(true);
		expect(canAfford("free", 49, 50)).toBe(false);
	});

	it("subscribers may run a negative (postpaid) balance", () => {
		expect(ROX_PERKS.subscriber.canSpendBelowZero).toBe(true);
		expect(canAfford("subscriber", 0, 1000)).toBe(true);
		expect(canAfford("subscriber", -500, 1000)).toBe(true);
	});

	it("resolves tier from subscription status", () => {
		expect(resolveTier("active")).toBe("subscriber");
		expect(resolveTier("trialing")).toBe("subscriber");
		expect(resolveTier("incomplete")).toBe("free");
		expect(resolveTier("canceled")).toBe("free");
		expect(resolveTier(null)).toBe("free");
		expect(resolveTier(undefined)).toBe("free");
	});

	it("perksFor returns the matrix entry", () => {
		expect(perksFor("free").tier).toBe("free");
		expect(perksFor("subscriber").prioritySupport).toBe(true);
	});
});
