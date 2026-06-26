import { useCallback } from "react";
import {
	selectChatWorklogOpen,
	useActivityWorklogCollapseStore,
} from "./store";

/**
 * F39 — Per-chat Activity worklog collapse controller.
 *
 * Returns the effective open state for `chatId` (per-chat override falling back
 * to the persisted global default) plus a setter that records a per-chat
 * override. Because the state lives in a persisted store, the timeline's
 * collapse survives re-render and chat switch.
 */
export function useActivityWorklogCollapse(chatId: string): {
	open: boolean;
	setOpen: (open: boolean) => void;
} {
	const open = useActivityWorklogCollapseStore((state) =>
		selectChatWorklogOpen(state, chatId),
	);
	const setChatOpen = useActivityWorklogCollapseStore(
		(state) => state.setChatOpen,
	);
	const setOpen = useCallback(
		(next: boolean) => setChatOpen(chatId, next),
		[chatId, setChatOpen],
	);
	return { open, setOpen };
}
