import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useQuickChatDraftStore } from "renderer/stores/quick-chat-draft";

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
 * delivered in place; otherwise we fall back to the proven Quick-Chat staging
 * handoff so the action is never dead.
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
	/** "in-place" = delivered to a live composer; "staged" = Quick-Chat fallback. */
	mode: "in-place" | "staged";
}

/**
 * Returns an `insert(text)` function that delivers a (already hydrated) prompt
 * to the focused composer when one exists, else stages it for Quick Chat and
 * navigates there. Generalizes today's Quick-Chat-only handoff to any composer
 * that adopts the `INSERT_PROMPT_EVENT` seam.
 */
export function useInsertPrompt() {
	const navigate = useNavigate();
	const stagePrompt = useQuickChatDraftStore((state) => state.stagePrompt);

	const insert = useCallback(
		(text: string): InsertOutcome => {
			if (hasActiveComposer()) {
				const detail: InsertPromptDetail = { text };
				window.dispatchEvent(
					new CustomEvent<InsertPromptDetail>(INSERT_PROMPT_EVENT, {
						detail,
					}),
				);
				return { mode: "in-place" };
			}
			stagePrompt(text);
			void navigate({ to: "/quick-chat" });
			return { mode: "staged" };
		},
		[navigate, stagePrompt],
	);

	return { insert };
}
