import { usePromptInputController } from "@rox/ui/ai-elements/prompt-input";
import { useCallback, useEffect } from "react";

/**
 * Custom DOM event a live chat composer listens for to receive an inserted
 * prompt, WITHOUT the saved-prompts surface importing the composer's controller
 * (which lives in chat context and is not mounted on the saved-prompts route).
 *
 * A composer opts in by calling {@link useComposerInsertTarget} once inside the
 * `<PromptInput>` context — that hook both advertises an active target (so the
 * inserter knows an in-place destination exists) and subscribes to this event.
 *
 * If a composer marks itself active the prompt is delivered in place; otherwise
 * there is no live composer to receive it and the caller surfaces a hint to open
 * a workspace chat (copy-to-clipboard fallback).
 */
export const INSERT_PROMPT_EVENT = "rox:insert-prompt";

export interface InsertPromptDetail {
	/** Fully rendered prompt text (tokens already substituted, `{cursor}` removed). */
	text: string;
	/**
	 * Caret offset within `text` where `{cursor}` was, or null if absent. Carried
	 * through the seam so a composer can place the caret inside the inserted text
	 * once its editor supports offset-based selection. Composers that only support
	 * append/focus may ignore it.
	 */
	cursor?: number | null;
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

export function hasActiveComposer(): boolean {
	return activeComposerCount > 0;
}

/** Test-only: reset the module-level refcount between cases. */
export function __resetComposerCountForTests(): void {
	activeComposerCount = 0;
}

/**
 * Pure append rule shared by the receiver: a new prompt is appended to the
 * existing draft (separated by a newline) so it never clobbers in-progress text;
 * inserting into an empty draft yields the prompt verbatim.
 */
export function appendInsertedText(current: string, text: string): string {
	return current.length > 0 ? `${current}\n${text}` : text;
}

export interface InsertOutcome {
	/**
	 * "in-place" = delivered to a live composer; "no-target" = no composer was
	 * mounted on the current route, so nothing received the prompt.
	 */
	mode: "in-place" | "no-target";
}

export interface InsertPayload {
	text: string;
	cursor?: number | null;
}

/**
 * Returns an `insert(payload)` function that delivers a (already hydrated) prompt
 * to the focused composer when one exists via the `INSERT_PROMPT_EVENT` seam.
 * When no composer is active there is no destination, so it reports
 * `"no-target"` and the caller surfaces a hint to open a workspace chat.
 *
 * Accepts a bare string for the common no-cursor case as well as the structured
 * `{ text, cursor }` payload produced by the variable-fill path.
 */
export function dispatchInsert(payload: string | InsertPayload): InsertOutcome {
	if (!hasActiveComposer()) {
		return { mode: "no-target" };
	}
	const detail: InsertPromptDetail =
		typeof payload === "string"
			? { text: payload }
			: { text: payload.text, cursor: payload.cursor ?? null };
	globalThis.dispatchEvent(
		new CustomEvent<InsertPromptDetail>(INSERT_PROMPT_EVENT, { detail }),
	);
	return { mode: "in-place" };
}

export function useInsertPrompt() {
	const insert = useCallback(
		(payload: string | InsertPayload): InsertOutcome => dispatchInsert(payload),
		[],
	);

	return { insert };
}

/**
 * Receiver side of the insert seam. Call once from a live chat composer rendered
 * inside a `<PromptInput>` provider. It:
 *   1. Registers the composer as an active insertion target for its lifetime, so
 *      `useInsertPrompt().insert(...)` resolves to "in-place" while it is mounted.
 *   2. Listens for `INSERT_PROMPT_EVENT` and appends the delivered prompt to the
 *      current composer value, then focuses the editor.
 *
 * The refcount in {@link markComposerActive} naturally routes a dispatched event
 * to every mounted composer; the most recently focused/visible one is the one a
 * user sees receive the text. Multiple composers appending is harmless because a
 * non-visible pane's editor is simply off-screen.
 */
export function useComposerInsertTarget(): void {
	const { textInput } = usePromptInputController();

	useEffect(() => {
		markComposerActive(true);
		const onInsert = (event: Event) => {
			const { text } = (event as CustomEvent<InsertPromptDetail>).detail;
			textInput.setInput(appendInsertedText(textInput.value, text));
			textInput.focus();
		};
		globalThis.addEventListener(INSERT_PROMPT_EVENT, onInsert);
		return () => {
			globalThis.removeEventListener(INSERT_PROMPT_EVENT, onInsert);
			markComposerActive(false);
		};
	}, [textInput]);
}
