/**
 * Rox economy pricing core (#34).
 *
 * Economic rules (as specified by product):
 *  - Every user starts with $5 USDT == 500 Rox, i.e. 1 USDT = 100 Rox.
 *  - Per-request charging derives our Rox sell price from a model's public
 *    per-million-token API price (source: models.dev) divided by a
 *    provider-specific divisor, then converted USD -> Rox.
 *
 * This module is the pure, tested core. Top-up (dv.net), balance ledger,
 * the models.dev catalog import, and the usage/trace dashboards are separate
 * slices that consume these primitives.
 */

export const ROX_PER_USDT = 100;
export const STARTING_BALANCE_USDT = 5;
export const STARTING_BALANCE_ROX = STARTING_BALANCE_USDT * ROX_PER_USDT; // 500

export type ModelProviderFamily =
	| "xai"
	| "openai"
	| "anthropic"
	| "google"
	| "other";

/**
 * Auditable provenance for a per-provider pricing divisor.
 *
 * The divisor itself is a **margin lever**, not a derived rate: we take a
 * model's public per-million list price (source: models.dev / OpenRouter) and
 * divide by `divisor` to get our USD sell price, then peg USD→Rox via
 * {@link ROX_PER_USDT}. Because these came verbatim from the product owner's
 * spec (issue #34, 2026-06-07) and are not anchored to a measured cost basis,
 * they MUST be treated as tunable config and revisited on `reviewCadence` —
 * never hardcoded inline at a call site.
 */
export interface RoxDivisorConfig {
	/** Public-list-price ÷ this = our USD sell price. */
	divisor: number;
	/** Where the value came from + what it's calibrated against. */
	source: string;
	/** How often to re-check it against current list prices. */
	reviewCadence: "weekly" | "monthly" | "quarterly";
	/** ISO date (YYYY-MM-DD) the value was last set or reviewed. */
	lastReviewed: string;
}

const DIVISOR_SOURCE =
	"issue #34 spec (2026-06-07) — target-margin lever over models.dev/OpenRouter list price + 1 USDT=100 Rox peg; placeholder pending cost-basis calibration";

/**
 * Single source of truth for the provider divisors, with provenance so a future
 * recalibration can audit *why* each number is what it is. {@link ROX_PRICE_DIVISORS}
 * is derived from this — consumers keep reading the flat map.
 *
 * xAI (grok) / OpenAI (incl. pro): ÷7.5; Claude (opus/sonnet): ÷5.25;
 * Gemini: ÷12.25; everything else (deepseek/cohere/kimi/mistral/minimax/…): ÷25.
 */
export const ROX_PRICE_DIVISOR_CONFIG: Record<
	ModelProviderFamily,
	RoxDivisorConfig
> = {
	xai: {
		divisor: 7.5,
		source: DIVISOR_SOURCE,
		reviewCadence: "monthly",
		lastReviewed: "2026-06-07",
	},
	openai: {
		divisor: 7.5,
		source: DIVISOR_SOURCE,
		reviewCadence: "monthly",
		lastReviewed: "2026-06-07",
	},
	anthropic: {
		divisor: 5.25,
		source: DIVISOR_SOURCE,
		reviewCadence: "monthly",
		lastReviewed: "2026-06-07",
	},
	google: {
		divisor: 12.25,
		source: DIVISOR_SOURCE,
		reviewCadence: "monthly",
		lastReviewed: "2026-06-07",
	},
	other: {
		divisor: 25,
		source: DIVISOR_SOURCE,
		reviewCadence: "monthly",
		lastReviewed: "2026-06-07",
	},
};

/**
 * Flat family→divisor map derived from {@link ROX_PRICE_DIVISOR_CONFIG}. This is
 * the hot-path lookup used by the pricing functions below.
 */
export const ROX_PRICE_DIVISORS: Record<ModelProviderFamily, number> =
	Object.fromEntries(
		Object.entries(ROX_PRICE_DIVISOR_CONFIG).map(([family, config]) => [
			family,
			config.divisor,
		]),
	) as Record<ModelProviderFamily, number>;

/** Map a models.dev provider id or model id to a pricing family. */
export function resolveProviderFamily(
	providerOrModel: string,
): ModelProviderFamily {
	const s = providerOrModel.toLowerCase();
	if (s.includes("grok") || s.includes("x-ai") || s.includes("xai")) {
		return "xai";
	}
	if (
		s.includes("openai") ||
		s.includes("gpt") ||
		/\bo[134]\b/.test(s) ||
		s.includes("o1-") ||
		s.includes("o3-")
	) {
		return "openai";
	}
	if (s.includes("claude") || s.includes("anthropic")) {
		return "anthropic";
	}
	if (s.includes("gemini") || s.includes("google")) {
		return "google";
	}
	return "other";
}

export function usdToRox(usd: number): number {
	return usd * ROX_PER_USDT;
}

export function roxToUsd(rox: number): number {
	return rox / ROX_PER_USDT;
}

/**
 * Decimal places the ledger persists Rox amounts at — matches the
 * `numeric(20, 6)` columns in `packages/db` (`balance_rox` / `delta_rox` /
 * `rox_cost`). Every value that becomes a ledger amount MUST be quantized to
 * this scale so the in-JS math agrees bit-for-bit with what Postgres stores;
 * otherwise `sum(deltas) !== balanceAfter` and the ledger stops reconciling.
 */
export const ROX_SCALE = 6;
const ROX_QUANTUM = 10 ** ROX_SCALE;

/**
 * Round a Rox amount to {@link ROX_SCALE} decimals. Non-finite inputs
 * (NaN / ±Infinity, e.g. from a malformed price or token count) collapse to 0
 * — the safe direction for money: never debit or credit an unbounded amount.
 */
export function quantizeRox(rox: number): number {
	if (!Number.isFinite(rox)) return 0;
	// `+ 0` normalises the `-0` that `Math.round` can yield for tiny negatives.
	return Math.round(rox * ROX_QUANTUM) / ROX_QUANTUM + 0;
}

/** Our USD sell price per million tokens, from the public models.dev price. */
export function roxSellPriceUsdPerMillion(
	publicUsdPerMillion: number,
	family: ModelProviderFamily,
): number {
	return publicUsdPerMillion / ROX_PRICE_DIVISORS[family];
}

/** Our Rox sell price per million tokens. */
export function roxPricePerMillion(
	publicUsdPerMillion: number,
	providerOrModel: string,
): number {
	const family = resolveProviderFamily(providerOrModel);
	return usdToRox(roxSellPriceUsdPerMillion(publicUsdPerMillion, family));
}

/** Rox cost for a specific token count given the public per-million price. */
export function roxCostForTokens(
	tokens: number,
	publicUsdPerMillion: number,
	providerOrModel: string,
): number {
	return (
		(tokens / 1_000_000) *
		roxPricePerMillion(publicUsdPerMillion, providerOrModel)
	);
}
