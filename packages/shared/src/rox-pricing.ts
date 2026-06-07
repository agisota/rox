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
 * Divisor applied to the public models.dev price to get our USD sell price.
 * xAI (grok) and OpenAI (incl. pro): ÷7.5; Claude (opus/sonnet): ÷5.25;
 * Gemini: ÷12.25; everything else (deepseek/cohere/kimi/mistral/minimax/…): ÷25.
 */
export const ROX_PRICE_DIVISORS: Record<ModelProviderFamily, number> = {
	xai: 7.5,
	openai: 7.5,
	anthropic: 5.25,
	google: 12.25,
	other: 25,
};

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
