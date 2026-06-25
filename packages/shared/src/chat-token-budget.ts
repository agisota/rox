/**
 * Cross-platform token-budget estimation for the chat composer's context HUD.
 *
 * The renderer shows "использовано N / окно модели" so a user can see how full
 * the selected model's context window is as a thread grows. We have no live
 * tokenizer in the client and the host snapshot does not carry per-message
 * usage, so we estimate consumed tokens from the raw text of the thread using
 * the widely-used ~4-characters-per-token heuristic. The logic is pure and
 * platform-agnostic (no DOM, no Node) so web/mobile/desktop clients share one
 * implementation; the renderer pairs the result with `tokenlens`/model
 * metadata for the maximum window.
 */

/**
 * Average characters per token. Tracks the common OpenAI/Anthropic rule of
 * thumb (~4 chars/token for English-leaning text); it intentionally errs
 * slightly conservative so the HUD never understates fullness.
 */
export const CHARS_PER_TOKEN = 4;

/** A thread fragment whose text contributes to the running token estimate. */
export interface ChatTokenFragment {
	/** Free-text content (user/assistant/tool text). Empty/undefined ignored. */
	text?: string | null;
}

/**
 * Estimate the number of tokens consumed by the given text using the
 * characters-per-token heuristic. Non-finite/negative lengths clamp to 0.
 */
export function estimateTokensFromText(text: string): number {
	const length = text.length;
	if (!Number.isFinite(length) || length <= 0) return 0;
	return Math.ceil(length / CHARS_PER_TOKEN);
}

/**
 * Estimate the tokens consumed by an entire thread. Concatenates fragment text
 * (joined by spaces, matching how the model would see turn boundaries) and runs
 * the per-text heuristic once so a long conversation grows the estimate
 * monotonically as turns accrue.
 */
export function estimateThreadTokens(
	fragments: readonly ChatTokenFragment[],
): number {
	const joined = fragments
		.map((fragment) => fragment.text ?? "")
		.filter((text) => text.length > 0)
		.join(" ");
	return estimateTokensFromText(joined);
}

/** Resolved budget for the context HUD. */
export interface ChatTokenBudget {
	/** Estimated tokens consumed by the current thread. */
	usedTokens: number;
	/** Model context-window size in tokens. */
	maxTokens: number;
	/** Fraction 0..1 of the window consumed (0 when the window is unknown). */
	usedFraction: number;
}

/**
 * Combine an estimated used-token count with a model context window into the
 * shape the HUD renders. `usedFraction` is clamped to [0, 1] so a thread that
 * overflows the (heuristic) window still reads as full rather than >100%.
 */
export function resolveChatTokenBudget(args: {
	usedTokens: number;
	maxTokens: number;
}): ChatTokenBudget {
	const usedTokens = Math.max(0, Math.floor(args.usedTokens));
	const maxTokens = Math.max(0, Math.floor(args.maxTokens));
	const usedFraction =
		maxTokens > 0 ? Math.min(1, Math.max(0, usedTokens / maxTokens)) : 0;
	return { usedTokens, maxTokens, usedFraction };
}
