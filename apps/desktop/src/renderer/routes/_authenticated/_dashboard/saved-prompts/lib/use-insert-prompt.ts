import { useCallback } from "react";

/**
 * Custom DOM event a live chat composer can listen for to receive an inserted
 * prompt, WITHOUT this surface importing the composer's controller (which lives
 * in chat context and is not mounted on the saved-prompts route). A composer
 * opts in by:
 *
 *   useEffect(() => {
 *     const onInsert = (e: Event) => {
 *       const { text } = (e as CustomEvent<InsertPromptDetail>).detail;
 *       promptInput.textInput.setInput(text);
 *       promptInput.textInput.focus();
 *     };
 *     window.addEventListener(INSERT_PROMPT_EVENT, onInsert);
 *     return () => window.removeEventListener(INSERT_PROMPT_EVENT, onInsert);
 *   }, []);
 *
 * If a composer marks itself active (see `markComposerActive`) the prompt is
 * delivered in place; otherwise there is no live composer to receive it and the
 * caller surfaces a hint to open a workspace chat.
 */
export const INSERT_PROMPT_EVENT = "rox:insert-prompt";

export interface InsertPromptDetail {
	text: string;
}

/**
 * A focused composer registers its presence here so the inserter knows whether
 * an in-place insertion target exists on the current route. Kept as a tiny
 * module-level counter (refcount) to tolerate multiple panes mounting/unmounting.
 */
let activeComposerCount = 0;

/** Composers call this on focus/blur (or mount/unmount) to advertise a target. */
export function markComposerActive(active: boolean): void {
	activeComposerCount = Math.max(0, activeComposerCount + (active ? 1 : -1));
}

function hasActiveComposer(): boolean {
	return activeComposerCount > 0;
}

export interface InsertOutcome {
	/**
	 * "in-place" = delivered to a live composer; "no-target" = no composer was
	 * mounted on the current route, so nothing received the prompt.
	 */
	mode: "in-place" | "no-target";
}

/**
 * Returns an `insert(text)` function that delivers a (already hydrated) prompt
 * to the focused composer when one exists via the `INSERT_PROMPT_EVENT` seam.
 * When no composer is active there is no destination, so it reports
 * `"no-target"` and the caller surfaces a hint to open a workspace chat.
 */
export function useInsertPrompt() {
	const insert = useCallback((text: string): InsertOutcome => {
		if (hasActiveComposer()) {
			const detail: InsertPromptDetail = { text };
			window.dispatchEvent(
				new CustomEvent<InsertPromptDetail>(INSERT_PROMPT_EVENT, {
					detail,
				}),
			);
			return { mode: "in-place" };
		}
		return { mode: "no-target" };
	}, []);

	return { insert };
}
