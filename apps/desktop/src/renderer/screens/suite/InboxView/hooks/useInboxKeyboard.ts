import { useHotkeys } from "react-hotkeys-hook";

/**
 * Inbox-Zero keyboard triage for the unified inbox, via `react-hotkeys-hook`
 * (the same v5 pattern the mail surface uses). Bindings are disabled inside
 * form fields except the explicit Esc path, so typing in the composer/search
 * never fires navigation.
 *
 *   j / ↓     next row             k / ↑   previous row
 *   Enter / o open                 Esc     close reader
 *   e         archive              s       snooze (open preset popover)
 *   #         done                 u       toggle unread
 *   r         reply (focus composer)       /  focus search
 *   g i       go to "Все"
 */
export interface InboxKeyboardHandlers {
	onNext: () => void;
	onPrev: () => void;
	onOpen: () => void;
	onClose: () => void;
	onArchive: () => void;
	onSnooze: () => void;
	onDone: () => void;
	onToggleUnread: () => void;
	onReply: () => void;
	onSearch: () => void;
	onGoAll: () => void;
}

export function useInboxKeyboard(
	handlers: InboxKeyboardHandlers,
	enabled: boolean,
): void {
	const opts = { enabled, preventDefault: true } as const;

	useHotkeys("j, down", handlers.onNext, opts, [handlers.onNext]);
	useHotkeys("k, up", handlers.onPrev, opts, [handlers.onPrev]);
	useHotkeys("enter, o", handlers.onOpen, opts, [handlers.onOpen]);
	useHotkeys("e", handlers.onArchive, opts, [handlers.onArchive]);
	useHotkeys("s", handlers.onSnooze, opts, [handlers.onSnooze]);
	useHotkeys("shift+3", handlers.onDone, opts, [handlers.onDone]);
	useHotkeys("u", handlers.onToggleUnread, opts, [handlers.onToggleUnread]);
	useHotkeys("r", handlers.onReply, opts, [handlers.onReply]);
	useHotkeys("slash", handlers.onSearch, opts, [handlers.onSearch]);
	useHotkeys("g>i", handlers.onGoAll, opts, [handlers.onGoAll]);

	// Esc closes the reader even from a focused field (composer/search).
	useHotkeys("escape", handlers.onClose, { ...opts, enableOnFormTags: true }, [
		handlers.onClose,
	]);
}
