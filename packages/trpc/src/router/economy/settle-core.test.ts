import { describe, expect, test } from "bun:test";
import type { PricingFields } from "@rox/shared/rox-models";

import {
	type EconomySettlePort,
	type SettleRequestResult,
	settleRequestWith,
} from "./settle-core";

const FREE_MODEL: PricingFields = {
	publicUsdPerMIn: 0,
	publicUsdPerMOut: 0,
	pricingFamily: "openai",
	isFree: true,
};

// A non-free model with high prices so a small token count still costs > 0 Rox.
const PAID_MODEL: PricingFields = {
	publicUsdPerMIn: 1000,
	publicUsdPerMOut: 2000,
	pricingFamily: "openai",
	isFree: false,
};

/**
 * In-memory stub of the persistence port. Records the rows each phase would
 * write and hands back a generated usageRequestId so we can assert it is
 * back-filled into the ledger row.
 */
function makePort(opts: { startingBalance: number; pricing: PricingFields }): {
	port: EconomySettlePort;
	calls: {
		usage: unknown[];
		ledger: Array<{ kind: string; deltaRox: string; usageRequestId: string }>;
		balance: string[];
	};
} {
	const calls = {
		usage: [] as unknown[],
		ledger: [] as Array<{
			kind: string;
			deltaRox: string;
			usageRequestId: string;
		}>,
		balance: [] as string[],
	};
	const port: EconomySettlePort = {
		async loadPricing() {
			return opts.pricing;
		},
		async runInTransaction(fn) {
			return fn({
				async ensureBalance() {
					return opts.startingBalance;
				},
				async insertUsage(row) {
					calls.usage.push(row);
					return "usage-row-id-1";
				},
				async insertLedger(row) {
					calls.ledger.push({
						kind: row.kind,
						deltaRox: row.deltaRox,
						usageRequestId: row.usageRequestId ?? "",
					});
					return "ledger-row-id-1";
				},
				async updateBalance(newBalanceRox) {
					calls.balance.push(newBalanceRox);
				},
			});
		},
	};
	return { port, calls };
}

describe("settleRequestWith", () => {
	const baseArgs = {
		userId: "user-1",
		organizationId: null,
		chatSessionId: null,
		modelId: "rox-r1",
		usage: { inputTokens: 1000, outputTokens: 1000 },
	};

	test("a free request inserts only usage — no ledger, no balance write", async () => {
		const { port, calls } = makePort({
			startingBalance: 500,
			pricing: FREE_MODEL,
		});
		const result: SettleRequestResult = await settleRequestWith(port, baseArgs);

		expect(calls.usage).toHaveLength(1);
		expect(calls.ledger).toHaveLength(0);
		expect(calls.balance).toHaveLength(0);
		expect(result.charged).toBe(false);
		expect(result.roxCost).toBe(0);
	});

	test("a paid, affordable request inserts usage + ledger(request_charge) + balance", async () => {
		const { port, calls } = makePort({
			startingBalance: 100_000_000,
			pricing: PAID_MODEL,
		});
		const result = await settleRequestWith(port, baseArgs);

		expect(calls.usage).toHaveLength(1);
		expect(calls.ledger).toHaveLength(1);
		expect(calls.balance).toHaveLength(1);
		expect(calls.ledger[0]?.kind).toBe("request_charge");
		expect(Number(calls.ledger[0]?.deltaRox)).toBeLessThan(0);
		expect(result.charged).toBe(true);
		expect(result.roxCost).toBeGreaterThan(0);
	});

	test("the generated usageRequestId is back-filled into the ledger row", async () => {
		const { port, calls } = makePort({
			startingBalance: 100_000_000,
			pricing: PAID_MODEL,
		});
		await settleRequestWith(port, baseArgs);

		expect(calls.ledger[0]?.usageRequestId).toBe("usage-row-id-1");
	});

	test("a paid request the balance cannot cover records usage but does not debit", async () => {
		const { port, calls } = makePort({
			startingBalance: 0,
			pricing: PAID_MODEL,
		});
		const result = await settleRequestWith(port, baseArgs);

		expect(calls.usage).toHaveLength(1);
		expect(calls.ledger).toHaveLength(0);
		expect(calls.balance).toHaveLength(0);
		expect(result.charged).toBe(false);
		expect(result.allowed).toBe(false);
	});
});
