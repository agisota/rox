import type { ThinkingLevel } from "@rox/ui/ai-elements/thinking-toggle";
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
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
	devtools(
		persist(
			(set) => ({
				selectedModelId: null,
				thinkingLevel: "off" as ThinkingLevel,
				defaultWorkspaceSurface: "chat" as DefaultWorkspaceSurface,

				setSelectedModelId: (modelId) => {
					set({ selectedModelId: modelId });
				},

				setThinkingLevel: (thinkingLevel) => {
					set({ thinkingLevel });
				},

				setDefaultWorkspaceSurface: (defaultWorkspaceSurface) => {
					set({ defaultWorkspaceSurface });
				},
			}),
			{
				name: "chat-preferences",
			},
		),
		{ name: "ChatPreferencesStore" },
	),
);
