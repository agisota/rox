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

	it("clamps non-finite top-up / grant amounts to zero (no balance corruption)", () => {
		for (const amount of [Number.NaN, Number.POSITIVE_INFINITY]) {
			const top = applyTopUp(500, amount);
			expect(top.balanceAfter).toBe(500);
			expect(top.entry.delta).toBe(0);
			const grant = applyGrant(500, amount);
			expect(grant.balanceAfter).toBe(500);
			expect(grant.entry.delta).toBe(0);
		}
	});

	it("treats a non-finite request cost as free rather than an unbounded debit", () => {
		const r = applyRequestCharge(100, paidCost(Number.POSITIVE_INFINITY));
		expect(r.charged).toBe(false);
		expect(r.cost).toBe(0);
		expect(r.balanceAfter).toBe(100);
		expect(r.entry).toBeNull();
	});

	it("quantizes debits and balances to the persisted ledger precision (6dp)", () => {
		// 0.1 + 0.2 drifts to 0.30000000000000004 in raw float; the ledger must
		// store exactly what numeric(20,6) would, so deltas reconcile.
		const r = applyRequestCharge(1, paidCost(0.1 + 0.2));
		expect(r.charged).toBe(true);
		expect(r.cost).toBe(0.3);
		expect(r.balanceAfter).toBe(0.7);
		expect(r.entry?.delta).toBe(-0.3);
		// A sub-quantum charge rounds to 0 and is treated as free.
		const dust = applyRequestCharge(1, paidCost(1e-9));
		expect(dust.charged).toBe(false);
		expect(dust.balanceAfter).toBe(1);
	});

	it("fails loud on a non-finite balance instead of silently zeroing it", () => {
		// A corrupted persisted balance is an invariant violation, not untrusted
		// input — surface it rather than letting quantizeRox collapse it to 0.
		for (const balance of [Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => applyTopUp(balance, 5)).toThrow(RangeError);
			expect(() => applyGrant(balance, 5)).toThrow(RangeError);
			expect(() => applyRequestCharge(balance, paidCost(10))).toThrow(
				RangeError,
			);
		}
	});
});
