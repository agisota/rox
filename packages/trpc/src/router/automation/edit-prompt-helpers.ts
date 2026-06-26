/**
 * Pure result-shaping helpers for `automation.editPrompt`.
 *
 * These map a {@link ChatCompletionResult} from the server LLM seam
 * (`runQuickChatCompletion`) onto the procedure's typed return. They are split
 * out from `automation.ts` (which imports the live `db`/network surface) so the
 * shaping logic — fence stripping, trimming, and the local-fallback contract —
 * is unit-testable without touching the network.
 */

import type { ChatCompletionResult } from "../chat/utils/chat-completion";

/** Typed return of the `editPrompt` procedure. */
export interface EditPromptResult {
	/** The regenerated prompt to show + persist (caller persists via setPrompt). */
	prompt: string;
	/** Short RU status line for the composer. */
	note: string;
	/**
	 * `false` when the model produced the prompt; `true` when the server LLM is
	 * not configured for this caller and the renderer must run its deterministic
	 * local transform instead. Never a stub — a documented degraded path.
	 */
	local: boolean;
}

const FENCE_RE = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/;

/**
 * Strip a single surrounding Markdown code fence (```lang … ``` or ``` … ```)
 * if the whole reply is wrapped in one, then trim. Models occasionally wrap a
 * rewritten prompt in fences despite being told not to; leave un-fenced text
 * untouched apart from trimming.
 */
export function stripCodeFence(reply: string): string {
	const match = reply.match(FENCE_RE);
	if (match?.[1] !== undefined) {
		return match[1].trim();
	}
	return reply.trim();
}

/**
 * Map a `runQuickChatCompletion` result to the `editPrompt` return.
 *
 * - `ok` with non-empty content → the unfenced, trimmed model reply, `local: false`.
 * - `ok` with empty/whitespace content → local fallback (degrade rather than
 *   persist an empty prompt).
 * - `needs-user-key` / `not-configured` → `{ prompt: currentPrompt, note: "",
 *   local: true }` so the renderer applies its deterministic local transform.
 */
export function shapeEditPromptResult(
	result: ChatCompletionResult,
	currentPrompt: string,
): EditPromptResult {
	if (result.status === "ok") {
		const prompt = stripCodeFence(result.reply);
		if (prompt.length > 0) {
			return {
				prompt,
				note: "Промпт перегенерирован моделью.",
				local: false,
			};
		}
	}
	return { prompt: currentPrompt, note: "", local: true };
}
