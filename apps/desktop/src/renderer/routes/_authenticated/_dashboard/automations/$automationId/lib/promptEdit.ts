/**
 * Conversational "edit via chat" seam for automation prompts.
 *
 * The user describes a change in natural language; this turns the current
 * prompt + that instruction into a new prompt draft. It is the single place
 * the chat composer talks to, so swapping the local transform for a real
 * server/agent round-trip is a one-function change.
 *
 * TODO(server): replace `composeLocally` with a tRPC call to the automation
 * agent/LLM path (e.g. `automation.editPrompt`) once that procedure exists.
 * The procedure should accept `{ id, currentPrompt, instruction }` and return
 * `{ prompt, note }`. The renderer contract below is intentionally identical
 * so the call site does not change when the server seam lands.
 */

export interface AutomationPromptEditRequest {
	/** Automation being edited (forwarded to the server seam when wired). */
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
	 * `true` when produced by the local fallback (no server agent wired yet).
	 * The UI surfaces this so the change is never mistaken for a model edit.
	 */
	local: boolean;
}

const DIRECTIVE_HEADING = "## Правки (через чат)";

/**
 * Deterministic local composition used until the server agent path is wired.
 *
 * Strategy, in order:
 * 1. Empty current prompt → the instruction becomes the prompt body.
 * 2. Instruction of the form `замени X на Y` / `replace X with Y` → literal
 *    substitution across the prompt (case-insensitive, all occurrences).
 * 3. Otherwise → append the instruction as a tracked directive under a
 *    "Правки (через чат)" heading so successive edits accumulate readably.
 *
 * This keeps every edit real and persisted (no fake "API unavailable" state)
 * while remaining trivially replaceable by the server seam above.
 */
function composeLocally(
	currentPrompt: string,
	instruction: string,
): { prompt: string; note: string } {
	const trimmedInstruction = instruction.trim();
	const trimmedPrompt = currentPrompt.trim();

	if (!trimmedPrompt) {
		return {
			prompt: trimmedInstruction,
			note: "Промпт создан из вашего описания.",
		};
	}

	const replace = parseReplaceDirective(trimmedInstruction);
	if (replace) {
		const next = literalReplaceAll(currentPrompt, replace.from, replace.to);
		if (next !== currentPrompt) {
			return {
				prompt: next,
				note: `Заменено «${replace.from}» → «${replace.to}».`,
			};
		}
		return {
			prompt: currentPrompt,
			note: `«${replace.from}» не найдено — промпт без изменений.`,
		};
	}

	const next = appendDirective(currentPrompt, trimmedInstruction);
	return {
		prompt: next,
		note: "Правка добавлена в промпт.",
	};
}

function parseReplaceDirective(
	instruction: string,
): { from: string; to: string } | null {
	// Russian: «замени A на B», «заменить A на B»
	const ru = instruction.match(/^замени(?:ть)?\s+(.+?)\s+на\s+(.+)$/i);
	if (ru?.[1] && ru[2]) {
		return { from: stripQuotes(ru[1]), to: stripQuotes(ru[2]) };
	}
	// English: «replace A with B»
	const en = instruction.match(/^replace\s+(.+?)\s+with\s+(.+)$/i);
	if (en?.[1] && en[2]) {
		return { from: stripQuotes(en[1]), to: stripQuotes(en[2]) };
	}
	return null;
}

function stripQuotes(value: string): string {
	return value.trim().replace(/^[«"'`]+|[»"'`]+$/g, "");
}

function literalReplaceAll(source: string, from: string, to: string): string {
	if (!from) return source;
	return source.split(from).join(to);
}

function appendDirective(currentPrompt: string, instruction: string): string {
	const bullet = `- ${instruction}`;
	const headingIndex = currentPrompt.indexOf(DIRECTIVE_HEADING);
	if (headingIndex === -1) {
		const separator = currentPrompt.endsWith("\n") ? "\n" : "\n\n";
		return `${currentPrompt}${separator}${DIRECTIVE_HEADING}\n${bullet}\n`;
	}
	const trimmedEnd = currentPrompt.replace(/\s+$/, "");
	return `${trimmedEnd}\n${bullet}\n`;
}

/**
 * Public entry point the chat composer calls. Routes to the server agent when
 * available, otherwise the deterministic local fallback.
 */
export async function requestAutomationPromptEdit(
	request: AutomationPromptEditRequest,
): Promise<AutomationPromptEditResult> {
	// TODO(server): when `automation.editPrompt` exists, call it here and return
	// `{ prompt, note, local: false }`. Until then, compose locally so the
	// affordance is fully functional and every edit is persisted + versioned.
	const { prompt, note } = composeLocally(
		request.currentPrompt,
		request.instruction,
	);
	return { prompt, note, local: true };
}
