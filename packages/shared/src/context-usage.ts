/**
 * Cross-platform context-usage selector (Hermes-borrow F42).
 *
 * The composer context-usage ring (`@rox/ui/ai-elements/context`) needs two
 * numbers: how many tokens the live conversation currently occupies
 * (`usedTokens`) and the model's context window (`maxTokens`). Neither is
 * surfaced by the chat harness snapshot, so every surface — desktop, web, and
 * mobile — derives them here from the displayed message text and the selected
 * model id. Keeping the logic in `@rox/shared` (pure, serializable, no React /
 * DOM / Node deps) guarantees web/mobile/desktop compute identical values from
 * the same inputs, per the F42 "one core" requirement.
 *
 * The token count is a deterministic estimate, not a billed figure: the harness
 * does not return per-message usage, and an exact tokenizer would pull a
 * model-specific dependency into every client. A chars/`CHARS_PER_TOKEN`
 * heuristic (the widely-used ~4-chars-per-token rule) is good enough to drive a
 * "how full is the window" ring and stays stable across platforms.
 */

/** Average characters per token for the estimation heuristic. */
const CHARS_PER_TOKEN = 4;

const TOKENS_PER_K = 1000;

/**
 * Default context window (tokens) for model ids absent from the catalog,
 * including custom OpenAI-compatible endpoints. Mirrors the desktop model-picker
 * heuristic default so all surfaces agree.
 */
const DEFAULT_CONTEXT_WINDOW_TOKENS = 128 * TOKENS_PER_K;

/**
 * Canonical model id → context window (tokens). Keyed by the bare model id
 * (provider prefix stripped, lowercased). Values mirror the desktop model-picker
 * capability catalog so the ring, the picker, and any other surface report the
 * same window. Unknown ids fall back to {@link inferContextWindowTokens}.
 */
const CONTEXT_WINDOW_CATALOG: Record<string, number> = {
	// Rox house model.
	r1: 256 * TOKENS_PER_K,
	"rox-r1": 256 * TOKENS_PER_K,
	// Anthropic.
	"claude-opus-4-8": 200 * TOKENS_PER_K,
	"claude-opus-4-7": 200 * TOKENS_PER_K,
	"claude-fable-5": 200 * TOKENS_PER_K,
	"claude-sonnet-4-6": 200 * TOKENS_PER_K,
	"claude-haiku-4-5": 200 * TOKENS_PER_K,
	// OpenAI.
	"gpt-5.5": 400 * TOKENS_PER_K,
	"gpt-5.4": 400 * TOKENS_PER_K,
	"gpt-5.3-codex": 400 * TOKENS_PER_K,
	// Groq.
	"llama-3.3-70b-versatile": 128 * TOKENS_PER_K,
	// Google.
	"gemini-2.5-pro": 1000 * TOKENS_PER_K,
	"gemini-2.5-flash": 1000 * TOKENS_PER_K,
	// DeepSeek.
	"deepseek-chat": 128 * TOKENS_PER_K,
	"deepseek-reasoner": 128 * TOKENS_PER_K,
};

/**
 * Strip a leading `openai/`, `anthropic/`, … provider prefix and lowercase, so
 * catalog lookups and heuristics work on the bare model id regardless of how the
 * caller spells it.
 */
export function normalizeModelId(modelId: string): string {
	const trimmed = modelId.trim().toLowerCase();
	const slashIndex = trimmed.indexOf("/");
	return slashIndex === -1 ? trimmed : trimmed.slice(slashIndex + 1);
}

/**
 * Best-effort context window for ids absent from the catalog, by common naming
 * conventions. Mirrors the desktop model-picker heuristic so a custom-endpoint
 * model still gets a sensible window.
 */
function inferContextWindowTokens(modelId: string): number {
	const id = normalizeModelId(modelId);
	const mentions = (...needles: string[]): boolean =>
		needles.some((needle) => id.includes(needle));

	if (mentions("1m", "gemini")) return 1000 * TOKENS_PER_K;
	if (mentions("gpt-5")) return 400 * TOKENS_PER_K;
	if (mentions("200k", "claude")) return 200 * TOKENS_PER_K;
	if (mentions("256k", "r1")) return 256 * TOKENS_PER_K;
	return DEFAULT_CONTEXT_WINDOW_TOKENS;
}

/**
 * Resolve a model's context window in tokens (catalog first, then heuristic).
 * Returns {@link DEFAULT_CONTEXT_WINDOW_TOKENS} for an empty/blank id.
 */
export function resolveModelContextWindow(
	modelId: string | null | undefined,
): number {
	if (!modelId || !modelId.trim()) return DEFAULT_CONTEXT_WINDOW_TOKENS;
	const normalized = normalizeModelId(modelId);
	return (
		CONTEXT_WINDOW_CATALOG[normalized] ?? inferContextWindowTokens(modelId)
	);
}

/**
 * Estimate the token count of a single text fragment. Deterministic, platform
 * neutral, and monotonic in length so the ring grows smoothly as the
 * conversation does.
 */
export function estimateTokensFromText(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate the tokens currently occupying the context window from the displayed
 * conversation text. Callers pass the plain-text content of every message part
 * (each surface extracts text from its own message shape); the order and
 * grouping don't matter to the estimate.
 */
export function estimateUsedTokens(texts: readonly string[]): number {
	let total = 0;
	for (const text of texts) {
		total += estimateTokensFromText(text);
	}
	return total;
}

/**
 * A serializable message-content part as carried by the chat surfaces. Both the
 * harness snapshot (desktop) and the AI-SDK UI messages (web) expose text on one
 * of these keys; tool calls/results contribute no conversational text and are
 * skipped. Kept structural (not tied to a concrete union) so every surface can
 * pass its own parts without an adapter.
 */
export interface ContextTextPart {
	type?: string;
	text?: unknown;
	thinking?: unknown;
	content?: unknown;
}

/**
 * Pull the plain-text fragments out of a list of message-content parts for the
 * usage estimate. Accepts raw strings or `{ text | thinking | content }` parts;
 * anything without a string payload (tool calls, attachments) is ignored.
 */
export function extractTextsFromParts(
	parts: readonly (ContextTextPart | string)[],
): string[] {
	const texts: string[] = [];
	for (const part of parts) {
		if (typeof part === "string") {
			if (part) texts.push(part);
			continue;
		}
		if (!part || typeof part !== "object") continue;
		const value = part.text ?? part.thinking ?? part.content;
		if (typeof value === "string" && value) texts.push(value);
	}
	return texts;
}

/** A fully-resolved context-usage reading for the ring. */
export interface ContextUsage {
	/** Estimated tokens currently in the context window. */
	usedTokens: number;
	/** The selected model's context window in tokens. */
	maxTokens: number;
}

/**
 * Build the {@link ContextUsage} the ring consumes from displayed message texts
 * and the selected model id. Single entry point so desktop/web/mobile share one
 * computation.
 */
export function selectContextUsage(
	texts: readonly string[],
	modelId: string | null | undefined,
): ContextUsage {
	return {
		usedTokens: estimateUsedTokens(texts),
		maxTokens: resolveModelContextWindow(modelId),
	};
}
