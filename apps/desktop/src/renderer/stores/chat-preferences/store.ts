import type { ThinkingLevel } from "@rox/ui/ai-elements/thinking-toggle";
import {
	type CollapsibleGroupKey,
	type GroupCollapseState,
	toggleGroupCollapsed,
} from "@rox/ui/session-row";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * The surface a workspace lands on by default when it is created or opened.
 * "chat" is the product default across every entry point; "terminal" is an
 * opt-out for users who prefer to land in a shell.
 */
export type DefaultWorkspaceSurface = "chat" | "terminal";

interface ChatPreferencesState {
	selectedModelId: string | null;
	setSelectedModelId: (modelId: string | null) => void;
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
	defaultWorkspaceSurface: DefaultWorkspaceSurface;
	setDefaultWorkspaceSurface: (surface: DefaultWorkspaceSurface) => void;
	/**
	 * Per-user collapsed chat-history groups (F18). Stores only the collapsed
	 * keys, so the default — every group expanded — stays implicit. Persisted via
	 * this store so the sidebar's grouping survives reloads.
	 */
	collapsedSessionGroups: GroupCollapseState;
	toggleSessionGroupCollapsed: (key: CollapsibleGroupKey) => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
	devtools(
		persist(
			(set) => ({
				selectedModelId: null,
				thinkingLevel: "off" as ThinkingLevel,
				defaultWorkspaceSurface: "chat" as DefaultWorkspaceSurface,
				collapsedSessionGroups: [] as GroupCollapseState,

				setSelectedModelId: (modelId) => {
					set({ selectedModelId: modelId });
				},

				setThinkingLevel: (thinkingLevel) => {
					set({ thinkingLevel });
				},

				setDefaultWorkspaceSurface: (defaultWorkspaceSurface) => {
					set({ defaultWorkspaceSurface });
				},

				toggleSessionGroupCollapsed: (key) => {
					set((state) => ({
						collapsedSessionGroups: toggleGroupCollapsed(
							state.collapsedSessionGroups,
							key,
						),
					}));
				},
			}),
			{
				name: "chat-preferences",
			},
		),
		{ name: "ChatPreferencesStore" },
	),
);
