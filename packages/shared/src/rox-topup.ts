/**
 * Rox crypto on-ramp (dv.net top-up) — #34, slice 3.
 *
 * Pure settlement logic for turning a *confirmed* crypto payment into a Rox
 * balance credit. It sits on top of the ledger (`applyTopUp`) and pricing peg
 * (1 USDT = ROX_PER_USDT Rox) and owns three guarantees the on-ramp needs:
 *
 *   1. **Confirmed-only** — a payment is credited only once the provider reports
 *      it settled; `pending` / `failed` / `expired` never move the balance.
 *   2. **USDT-only** — we peg Rox to USDT; any other settlement asset is rejected
 *      rather than silently mispriced.
 *   3. **Idempotent** — crediting is keyed on the provider's charge id, so a
 *      replayed webhook or a double poll can't double-credit.
 *
 * The actual dv.net HTTP lives behind the injected {@link DvNetClient} seam, so
 * this module stays pure and fully unit-testable; the concrete client (in
 * host-service) holds the API key, talks to dv.net's real endpoints, and is the
 * only place the secret is read — it is passed in via the credential store and
 * never logged. Persistence of the produced ledger entry + the processed-id set
 * is the caller's responsibility (Drizzle), same as the rest of the ledger core.
 */

import { applyTopUp, type RoxLedgerEntry } from "./rox-ledger";
import { ROX_PER_USDT, usdToRox } from "./rox-pricing";

/** The asset we peg Rox to. dv.net settles stablecoin invoices in USDT. */
export const TOPUP_ASSET = "USDT" as const;

/** Default top-up button: $5 USDT == 500 Rox (matches the starting grant). */
export const DEFAULT_TOPUP_USDT = 5;

/** Lifecycle of a crypto charge as reported by the on-ramp. */
export type CryptoPaymentStatus =
	| "pending"
	| "confirmed"
	| "failed"
	| "expired";

/** A crypto payment/charge as reported by dv.net (provider-shape-agnostic). */
export interface CryptoPayment {
	/** Provider-unique charge/invoice id — the idempotency key. */
	id: string;
	/** Settlement asset symbol (we only credit {@link TOPUP_ASSET}). */
	asset: string;
	/** Settled amount in `asset` units. */
	amount: number;
	status: CryptoPaymentStatus;
}

/** A USDT→Rox preview for the top-up UI (no balance mutation). */
export interface TopUpQuote {
	usdt: number;
	rox: number;
}

/**
 * Injected dv.net seam. The concrete implementation (host-service) holds the
 * API key and maps these to dv.net's real REST endpoints; this module only ever
 * sees the normalized {@link CryptoPayment}.
 */
export interface DvNetClient {
	/** Fetch a charge by id, or null when the provider has no such charge. */
	getPayment(id: string): Promise<CryptoPayment | null>;
}

/** Why a settlement did not credit the balance. */
export type TopUpSkipReason =
	| "duplicate"
	| "not-confirmed"
	| "unsupported-asset"
	| "non-positive";

export type TopUpResult =
	| {
			credited: true;
			rox: number;
			balanceAfter: number;
			entry: RoxLedgerEntry;
	  }
	| { credited: false; reason: TopUpSkipReason; balanceAfter: number };

/** Preview the Rox a USDT amount buys, clamped to non-negative. */
export function quoteTopUp(usdt: number): TopUpQuote {
	const safeUsdt = Math.max(0, usdt);
	return { usdt: safeUsdt, rox: usdToRox(safeUsdt) };
}

/** True once a charge has settled and can be credited. */
export function isConfirmed(payment: CryptoPayment): boolean {
	return payment.status === "confirmed";
}

/**
 * Credit a *confirmed* payment to a balance, exactly once.
 *
 * Pure — it READS `processedIds` (the set of already-settled charge ids the
 * caller loaded from persistence) for the duplicate check but NEVER mutates it.
 * On `credited: true` the caller must persist the returned `entry` AND record
 * `payment.id` atomically, then reload the set before the next call. We do not
 * add the id here on purpose: mutating the in-memory set before the DB write
 * lands would, if that write fails, leave the set ahead of the ledger and make
 * a retry report `duplicate` — silently swallowing a top-up the user paid for.
 * Rejections never move the balance and report a {@link TopUpSkipReason}.
 */
export function creditConfirmedPayment(
	balance: number,
	payment: CryptoPayment,
	processedIds: Set<string>,
): TopUpResult {
	// Check confirmation before the idempotency key: this way "duplicate" can
	// only ever describe a payment that was already confirmed *and* credited. If
	// a caller bug ever seeded `processedIds` with a still-`pending` id, the
	// payment stays recoverable ("not-confirmed") instead of being permanently
	// stuck as "duplicate" — the user paid and must still be creditable.
	if (!isConfirmed(payment)) {
		return { credited: false, reason: "not-confirmed", balanceAfter: balance };
	}
	if (processedIds.has(payment.id)) {
		return { credited: false, reason: "duplicate", balanceAfter: balance };
	}
	if (payment.asset.toUpperCase() !== TOPUP_ASSET) {
		return {
			credited: false,
			reason: "unsupported-asset",
			balanceAfter: balance,
		};
	}
	// Reject NaN/±Infinity as well as 0/negative: a non-finite amount must never
	// reach applyTopUp, where it would corrupt the balance to NaN/Infinity.
	if (!Number.isFinite(payment.amount) || !(payment.amount > 0)) {
		return { credited: false, reason: "non-positive", balanceAfter: balance };
	}

	const { balanceAfter, entry } = applyTopUp(
		balance,
		payment.amount,
		`dv.net ${payment.id}`,
	);
	return {
		credited: true,
		rox: entry.delta,
		balanceAfter,
		entry,
	};
}

/**
 * Fetch a charge via the injected client and settle it. Returns
 * `{ credited: false, reason: "not-confirmed" }` when the provider has no such
 * charge yet (treated the same as an unsettled one — safe to re-poll).
 */
export async function settleTopUp(args: {
	client: DvNetClient;
	paymentId: string;
	balance: number;
	processedIds: Set<string>;
}): Promise<TopUpResult> {
	const { client, paymentId, balance, processedIds } = args;
	const payment = await client.getPayment(paymentId);
	if (!payment) {
		return { credited: false, reason: "not-confirmed", balanceAfter: balance };
	}
	return creditConfirmedPayment(balance, payment, processedIds);
}

/** Rox-per-USDT peg, re-exported for on-ramp UI copy. */
export { ROX_PER_USDT };
