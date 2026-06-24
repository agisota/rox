import { useHotkeys } from "react-hotkeys-hook";

export interface MailKeyboardHandlers {
	/** Move selection down the list (j / ↓). */
	onNext: () => void;
	/** Move selection up the list (k / ↑). */
	onPrev: () => void;
	/** Open / focus the highlighted thread (Enter / o). */
	onOpen: () => void;
	/** Collapse the reader back to the list (u / Esc). */
	onBack: () => void;
	/** Start an inline reply (r). */
	onReply: () => void;
	/** Reply to everyone (a). */
	onReplyAll: () => void;
	/** Archive the open/selected thread (e). */
	onArchive: () => void;
	/** Trash the open/selected thread (# / Delete). */
	onTrash: () => void;
	/** Focus the search box (/). */
	onSearch: () => void;
	/** Start a brand-new message (c). */
	onCompose: () => void;
}

/**
 * Gmail-style keyboard navigation for the mail surface, via `react-hotkeys-hook`.
 *
 * Bindings (active only while `enabled`, and disabled inside form fields except
 * the explicit Esc/⌘↵ paths the composer owns):
 *   j / ↓     next thread        k / ↑   previous thread
 *   Enter / o open                u / Esc back to list
 *   r         reply              a       reply-all
 *   e         archive            # / Del trash
 *   /         focus search       c       compose new
 *
 * `enableOnFormTags` is left OFF so typing in the composer/search never triggers
 * navigation; `/` and the global actions are bound at the document level so they
 * still work when focus is on a list row (a button, not a form tag).
 */
export function useMailKeyboard(
	handlers: MailKeyboardHandlers,
	enabled: boolean,
): void {
	const opts = { enabled, preventDefault: true } as const;

	useHotkeys("j, down", handlers.onNext, opts, [handlers.onNext]);
	useHotkeys("k, up", handlers.onPrev, opts, [handlers.onPrev]);
	useHotkeys("enter, o", handlers.onOpen, opts, [handlers.onOpen]);
	useHotkeys("u", handlers.onBack, opts, [handlers.onBack]);
	useHotkeys("r", handlers.onReply, opts, [handlers.onReply]);
	useHotkeys("a", handlers.onReplyAll, opts, [handlers.onReplyAll]);
	useHotkeys("e", handlers.onArchive, opts, [handlers.onArchive]);
	useHotkeys("shift+3, delete, backspace", handlers.onTrash, opts, [
		handlers.onTrash,
	]);
	useHotkeys("c", handlers.onCompose, opts, [handlers.onCompose]);
	useHotkeys("slash", handlers.onSearch, opts, [handlers.onSearch]);

	// Esc returns to the list even from a focused field (e.g. closing the
	// composer), so it opts INTO form tags explicitly.
	useHotkeys("escape", handlers.onBack, { ...opts, enableOnFormTags: true }, [
		handlers.onBack,
	]);
}
