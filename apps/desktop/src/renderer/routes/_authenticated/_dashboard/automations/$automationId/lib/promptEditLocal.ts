/**
 * Deterministic, dependency-free local transform for automation prompt edits.
 *
 * This is the typed degraded path for "Изменить через чат": when the server LLM
 * (`automation.editPrompt`) reports it is not configured for the caller, or the
 * call fails, `requestAutomationPromptEdit` (in `promptEdit.ts`) falls back to
 * {@link composeLocally} here. It is NOT a stub — every edit is real and gets
 * persisted by the caller via `setPrompt`.
 *
 * Kept in its own module (no `@trpc/client` / network imports) so the pure
 * transform is unit-testable under `bun test` without resolving the API client.
 */

export const DIRECTIVE_HEADING = "## Правки (через чат)";

/**
 * Deterministic local composition.
 *
 * Strategy, in order:
 * 1. Empty current prompt → the instruction becomes the prompt body.
 * 2. Instruction of the form `замени X на Y` / `replace X with Y` → literal
 *    substitution across the prompt (all occurrences).
 * 3. Otherwise → append the instruction as a tracked directive under a
 *    "Правки (через чат)" heading so successive edits accumulate readably.
 */
export function composeLocally(
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

export function parseReplaceDirective(
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
