import { describe, expect, it } from "bun:test";
import {
	applyGrant,
	applyRequestCharge,
	applyTopUp,
	canAfford,
} from "./rox-ledger";
import type { RoxRequestCost } from "./rox-models";

const paidCost = (totalRox: number): RoxRequestCost => ({
	inputRox: totalRox,
	outputRox: 0,
	totalRox,
	isFree: false,
});

describe("rox-ledger", () => {
	it("canAfford compares balance against cost", () => {
		expect(canAfford(100, 100)).toBe(true);
		expect(canAfford(100, 100.01)).toBe(false);
		expect(canAfford(0, 0)).toBe(true);
	});

	it("applyTopUp credits at 1 USDT = 100 Rox", () => {
		const { balanceAfter, entry } = applyTopUp(500, 5);
		expect(balanceAfter).toBe(1000);
		expect(entry).toEqual({ delta: 500, balanceAfter: 1000, reason: "topup" });
	});

	it("applyTopUp clamps negative amounts to zero", () => {
		const { balanceAfter, entry } = applyTopUp(500, -5);
		expect(balanceAfter).toBe(500);
		expect(entry.delta).toBe(0);
	});

	it("applyGrant credits a Rox amount", () => {
		const { balanceAfter, entry } = applyGrant(0, 250, "welcome");
		expect(balanceAfter).toBe(250);
		expect(entry).toEqual({
			delta: 250,
			balanceAfter: 250,
			reason: "grant",
			note: "welcome",
		});
	});

	it("debits a paid request the balance can cover", () => {
		const r = applyRequestCharge(300, paidCost(120), {
			modelId: "gpt-x",
			requestId: "req-1",
		});
		expect(r.charged).toBe(true);
		expect(r.insufficient).toBe(false);
		expect(r.balanceAfter).toBe(180);
		expect(r.entry).toEqual({
			delta: -120,
			balanceAfter: 180,
			reason: "request",
			modelId: "gpt-x",
			requestId: "req-1",
		});
	});

	it("free / zero-cost requests never debit (free by default)", () => {
		const free = applyRequestCharge(0, {
			inputRox: 0,
			outputRox: 0,
			totalRox: 0,
			isFree: true,
		});
		expect(free.charged).toBe(false);
		expect(free.balanceAfter).toBe(0);
		expect(free.entry).toBeNull();
		expect(free.insufficient).toBe(false);

		// A zero-cost paid result also doesn't debit or error.
		const zero = applyRequestCharge(0, paidCost(0));
		expect(zero.charged).toBe(false);
		expect(zero.entry).toBeNull();
	});

	it("reports insufficient balance without throwing or mutating", () => {
		const r = applyRequestCharge(50, paidCost(120), { modelId: "gpt-x" });
		expect(r.charged).toBe(false);
		expect(r.insufficient).toBe(true);
		expect(r.balanceAfter).toBe(50);
		expect(r.entry).toBeNull();
	});

	it("an exact-balance charge succeeds and lands on zero", () => {
		const r = applyRequestCharge(120, paidCost(120));
		expect(r.charged).toBe(true);
		expect(r.balanceAfter).toBe(0);
		expect(r.insufficient).toBe(false);
	});
});
