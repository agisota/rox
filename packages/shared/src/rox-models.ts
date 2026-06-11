/**
 * Rox model catalog types (billing-economy epic, be-02).
 *
 * The catalog mirrors models.dev: per-model public price (per-million tokens),
 * plus capability metadata (params / specs / tools / limits). These types are
 * the shared contract used by:
 *   - the `model_catalog` Drizzle table (jsonb column shapes), and
 *   - the models.dev sync client + the models tRPC router / UI.
 *
 * `ROX_R1` is our free-forever house model — it mirrors groq-compound-latest's
 * params/tools/limits but is priced at zero and flagged `isFree`.
 */

import {
	type ModelProviderFamily,
	quantizeRox,
	roxSellPriceUsdPerMillion,
	usdToRox,
} from "./rox-pricing";

/** Tunable generation params advertised by a model. */
export interface ModelParams {
	contextWindow?: number;
	maxOutputTokens?: number;
	temperature?: boolean;
	topP?: boolean;
	[key: string]: unknown;
}

/** Static capability/specs of a model (modalities, reasoning, dates). */
export interface ModelSpecs {
	modalities?: {
		input?: string[];
		output?: string[];
	};
	reasoning?: boolean;
	attachment?: boolean;
	knowledgeCutoff?: string;
	releaseDate?: string;
	[key: string]: unknown;
}

/** Tool-calling capabilities of a model. */
export interface ModelTools {
	toolCall?: boolean;
	supportedTools?: string[];
	[key: string]: unknown;
}

/** Rate / size limits for a model. `null` means "no documented limit". */
export interface ModelLimits {
	contextWindow?: number;
	maxOutputTokens?: number;
	requestsPerMinute?: number | null;
	tokensPerMinute?: number | null;
	[key: string]: unknown;
}

/** A fully-resolved catalog entry, as stored in `model_catalog`. */
export interface RoxModelCatalogEntry {
	provider: string;
	modelId: string;
	publicUsdPerMIn: number;
	publicUsdPerMOut: number;
	pricingFamily: ModelProviderFamily;
	isFree: boolean;
	params: ModelParams;
	specs: ModelSpecs;
	tools: ModelTools;
	limits: ModelLimits;
}

export const ROX_R1_MODEL_ID = "rox-r1";

/** The model id on models.dev that rox r1 mirrors. */
export const ROX_R1_MIRRORS = "groq-compound-latest";

/**
 * Rox R1 — our free-forever house model. Zero-priced, `isFree`, and mirrors the
 * params/tools/limits of groq-compound-latest (a tool-using compound model with
 * built-in web search + code execution).
 */
export const ROX_R1: RoxModelCatalogEntry = {
	provider: "rox",
	modelId: ROX_R1_MODEL_ID,
	publicUsdPerMIn: 0,
	publicUsdPerMOut: 0,
	pricingFamily: "other",
	isFree: true,
	params: {
		contextWindow: 131_072,
		maxOutputTokens: 8_192,
		temperature: true,
		topP: true,
	},
	specs: {
		modalities: { input: ["text"], output: ["text"] },
		reasoning: true,
		attachment: false,
	},
	tools: {
		toolCall: true,
		supportedTools: ["web_search", "code_interpreter", "browser"],
	},
	limits: {
		contextWindow: 131_072,
		maxOutputTokens: 8_192,
		requestsPerMinute: null,
		tokensPerMinute: null,
	},
};

/** True when a catalog entry never costs Rox (free model). */
export function isFreeModel(
	entry: Pick<RoxModelCatalogEntry, "isFree">,
): boolean {
	return entry.isFree === true;
}

/** Token usage of a single completed request. */
export interface RequestUsage {
	inputTokens: number;
	outputTokens: number;
}

/** Rox charge for a request, broken down by input vs output. */
export interface RoxRequestCost {
	inputRox: number;
	outputRox: number;
	totalRox: number;
	isFree: boolean;
}

/** Catalog fields needed to price a request (a full entry satisfies this). */
type PricingFields = Pick<
	RoxModelCatalogEntry,
	"publicUsdPerMIn" | "publicUsdPerMOut" | "pricingFamily" | "isFree"
>;

/**
 * Rox charge for one request, honoring the model's separate input/output
 * public prices, its provider divisor, and the free-model flag. This is the
 * primitive the per-request debit hook (#34) and the usage/cost cabinet
 * consume. Each leg is quantized to {@link ROX_SCALE} (the persisted ledger
 * precision) so the charge agrees with what the DB stores. Negative token
 * counts are clamped to 0 (usage is never negative); a non-finite token count
 * or catalog price collapses to a 0 charge rather than an unbounded debit.
 */
export function roxCostForRequest(
	usage: RequestUsage,
	entry: PricingFields,
): RoxRequestCost {
	if (isFreeModel(entry)) {
		return { inputRox: 0, outputRox: 0, totalRox: 0, isFree: true };
	}
	const inTokens = Math.max(0, usage.inputTokens);
	const outTokens = Math.max(0, usage.outputTokens);
	const inputRox = quantizeRox(
		usdToRox(
			(inTokens / 1_000_000) *
				roxSellPriceUsdPerMillion(entry.publicUsdPerMIn, entry.pricingFamily),
		),
	);
	const outputRox = quantizeRox(
		usdToRox(
			(outTokens / 1_000_000) *
				roxSellPriceUsdPerMillion(entry.publicUsdPerMOut, entry.pricingFamily),
		),
	);
	return {
		inputRox,
		outputRox,
		totalRox: quantizeRox(inputRox + outputRox),
		isFree: false,
	};
}
