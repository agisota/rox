/**
 * Conversational "edit via chat" seam for automation prompts.
 *
 * The user describes a change in natural language; this turns the current
 * prompt + that instruction into a new prompt draft. It is the single place
 * the chat composer talks to.
 *
 * Path: the server LLM runs first via `automation.editPrompt` (the Rox house
 * model rewrites the prompt). When that procedure reports the model is not
 * configured for this caller (`local: true`), or the call fails for any reason
 * (network/gateway), we degrade to the deterministic local transform below.
 * That fallback is a documented typed degraded path (`local: true`), not a
 * stub — every edit is real and persisted by the caller via `setPrompt`.
 */

import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { logger } from "renderer/lib/logger";
import { composeLocally } from "./promptEditLocal";

export interface AutomationPromptEditRequest {
	/** Automation being edited (forwarded to the server seam). */
	automationId: string;
	/** The prompt as it currently stands in the editor. */
	currentPrompt: string;
	/** Free-text instruction the user typed into the chat composer. */
	instruction: string;
}

export interface AutomationPromptEditResult {
	/** The regenerated prompt to persist + show in the editor. */
	prompt: string;
	/** Short RU status line describing what changed, shown in the composer. */
	note: string;
	/**
	 * `true` when produced by the local fallback (server LLM not configured for
	 * this caller, or the call failed). The UI surfaces this so the change is
	 * never mistaken for a model edit.
	 */
	local: boolean;
}

/**
 * Public entry point the chat composer calls. Runs the server LLM first
 * (`automation.editPrompt`); on a `local` server result or any error, falls
 * back to the deterministic local transform so the affordance never hard-fails.
 */
export async function requestAutomationPromptEdit(
	request: AutomationPromptEditRequest,
): Promise<AutomationPromptEditResult> {
	try {
		const res = await apiTrpcClient.automation.editPrompt.mutate({
			id: request.automationId,
			currentPrompt: request.currentPrompt,
			instruction: request.instruction,
		});
		if (res.local === false) {
			return { prompt: res.prompt, note: res.note, local: false };
		}
		// Server is not configured for this caller — fall through to local.
	} catch (error) {
		logger.warn(
			"automation.editPrompt failed; falling back to local transform",
			error,
		);
	}

	const { prompt, note } = composeLocally(
		request.currentPrompt,
		request.instruction,
	);
	return { prompt, note, local: true };
}
