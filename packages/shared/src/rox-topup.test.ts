import { describe, expect, it } from "bun:test";
import {
	type CryptoPayment,
	creditConfirmedPayment,
	DEFAULT_TOPUP_USDT,
	type DvNetClient,
	quoteTopUp,
	settleTopUp,
	TOPUP_ASSET,
} from "./rox-topup";

function confirmed(overrides: Partial<CryptoPayment> = {}): CryptoPayment {
	return {
		id: "chg_1",
		asset: TOPUP_ASSET,
		amount: 5,
		status: "confirmed",
		...overrides,
	};
}

describe("rox-topup", () => {
	it("quotes USDT->Rox at the 1 USDT = 100 Rox peg, clamped non-negative", () => {
		expect(quoteTopUp(DEFAULT_TOPUP_USDT)).toEqual({ usdt: 5, rox: 500 });
		expect(quoteTopUp(0)).toEqual({ usdt: 0, rox: 0 });
		expect(quoteTopUp(-10)).toEqual({ usdt: 0, rox: 0 });
	});

	it("credits a confirmed USDT payment exactly once", () => {
		const processed = new Set<string>();
		const result = creditConfirmedPayment(
			100,
			confirmed({ amount: 5 }),
			processed,
		);
		expect(result.credited).toBe(true);
		if (result.credited) {
			expect(result.rox).toBe(500);
			expect(result.balanceAfter).toBe(600);
			expect(result.entry.reason).toBe("topup");
			expect(result.entry.note).toBe("dv.net chg_1");
		}
		expect(processed.has("chg_1")).toBe(true);
	});

	it("is idempotent — a replayed charge id never double-credits", () => {
		const processed = new Set<string>();
		const first = creditConfirmedPayment(100, confirmed(), processed);
		expect(first.credited).toBe(true);
		const replay = creditConfirmedPayment(
			first.credited ? first.balanceAfter : 100,
			confirmed(),
			processed,
		);
		expect(replay.credited).toBe(false);
		if (!replay.credited) expect(replay.reason).toBe("duplicate");
		// Balance is untouched by the duplicate.
		expect(replay.balanceAfter).toBe(600);
	});

	it("never credits unsettled or failed charges", () => {
		const processed = new Set<string>();
		for (const status of ["pending", "failed", "expired"] as const) {
			const r = creditConfirmedPayment(100, confirmed({ status }), processed);
			expect(r.credited).toBe(false);
			if (!r.credited) expect(r.reason).toBe("not-confirmed");
			expect(r.balanceAfter).toBe(100);
		}
		// Nothing was marked processed, so a later confirmation still credits.
		expect(processed.size).toBe(0);
	});

	it("rejects non-USDT settlement assets rather than mispricing them", () => {
		const r = creditConfirmedPayment(
			100,
			confirmed({ asset: "BTC" }),
			new Set(),
		);
		expect(r.credited).toBe(false);
		if (!r.credited) expect(r.reason).toBe("unsupported-asset");
	});

	it("accepts a lowercase asset symbol (usdt)", () => {
		const r = creditConfirmedPayment(
			0,
			confirmed({ asset: "usdt" }),
			new Set(),
		);
		expect(r.credited).toBe(true);
	});

	it("rejects non-positive amounts", () => {
		const processed = new Set<string>();
		expect(
			creditConfirmedPayment(100, confirmed({ amount: 0 }), processed).credited,
		).toBe(false);
		expect(
			creditConfirmedPayment(100, confirmed({ amount: -5 }), processed)
				.credited,
		).toBe(false);
	});

	it("settles through an injected dv.net client", async () => {
		const client: DvNetClient = {
			getPayment: async (id) =>
				id === "chg_ok" ? confirmed({ id, amount: 10 }) : null,
		};
		const processed = new Set<string>();

		const ok = await settleTopUp({
			client,
			paymentId: "chg_ok",
			balance: 0,
			processedIds: processed,
		});
		expect(ok.credited).toBe(true);
		if (ok.credited) expect(ok.balanceAfter).toBe(1000);

		// Unknown charge id is treated as not-yet-confirmed (safe to re-poll).
		const missing = await settleTopUp({
			client,
			paymentId: "chg_missing",
			balance: 0,
			processedIds: processed,
		});
		expect(missing.credited).toBe(false);
		if (!missing.credited) expect(missing.reason).toBe("not-confirmed");
	});
});
