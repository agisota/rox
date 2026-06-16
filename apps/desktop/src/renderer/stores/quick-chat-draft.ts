import { create } from "zustand";

interface QuickChatDraftState {
	/** Prompt text staged from another surface (e.g. "Сохранённые промпты"). */
	pendingPrompt: string | null;
	/** Stage a prompt to be picked up by the Quick Chat composer. */
	stagePrompt: (prompt: string) => void;
	/** Consume the staged prompt, clearing it. Returns the prompt or null. */
	consumePrompt: () => string | null;
	/** Clear any staged prompt without consuming it. */
	clear: () => void;
}

/**
 * Cross-route handoff for a single prompt the user wants to drop into the
 * Quick Chat composer. The "Сохранённые промпты" view stages a prompt then
 * navigates to Quick Chat, which consumes it on mount.
 */
export const useQuickChatDraftStore = create<QuickChatDraftState>(
	(set, get) => ({
		pendingPrompt: null,
		stagePrompt: (prompt) => set({ pendingPrompt: prompt }),
		consumePrompt: () => {
			const { pendingPrompt } = get();
			if (pendingPrompt !== null) {
				set({ pendingPrompt: null });
			}
			return pendingPrompt;
		},
		clear: () => set({ pendingPrompt: null }),
	}),
);
