import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * F39 — Persisted collapse state for the Activity worklog timeline.
 *
 * The timeline is *persistent* (it never auto-collapses post-stream), so its
 * open/closed state must survive re-render AND chat switch. We persist a
 * per-chat override map plus a single global default (mirroring the
 * `usePermissionModePreference` pattern so this surface fix stays
 * self-contained). When a chat has no explicit override it falls back to the
 * global default; toggling a chat records an override for just that chat.
 */
interface ActivityWorklogCollapseState {
	/** Global default open state for chats without an explicit override. */
	defaultOpen: boolean;
	/** Per-chat open overrides, keyed by chat/session id. */
	openByChatId: Record<string, boolean>;
	setDefaultOpen: (open: boolean) => void;
	setChatOpen: (chatId: string, open: boolean) => void;
}

export const useActivityWorklogCollapseStore =
	create<ActivityWorklogCollapseState>()(
		devtools(
			persist(
				(set) => ({
					defaultOpen: false,
					openByChatId: {},
					setDefaultOpen: (defaultOpen) => {
						set({ defaultOpen });
					},
					setChatOpen: (chatId, open) => {
						set((state) => ({
							openByChatId: { ...state.openByChatId, [chatId]: open },
						}));
					},
				}),
				{ name: "rox-chat-activity-worklog-collapse" },
			),
			{ name: "ActivityWorklogCollapseStore" },
		),
	);

/** Resolves the effective open state for a chat (override → global default). */
export function selectChatWorklogOpen(
	state: ActivityWorklogCollapseState,
	chatId: string,
): boolean {
	return state.openByChatId[chatId] ?? state.defaultOpen;
}
