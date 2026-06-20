/**
 * Pushes the currently active tab id onto the front of a workspace's
 * tab-history stack, deduplicating any prior occurrence of that id.
 *
 * When there is no active tab id, the stack is returned unchanged.
 *
 * This is the pure form of the logic that was previously copy-pasted across
 * every store action that opens/activates a new tab (addTab, addChatTab,
 * addTabWithMultiplePanes, addFileViewerPane, openCommentPane, addBrowserTab,
 * reopenClosedTab).
 */
export const pushActiveToHistory = (
	stack: string[],
	currentActiveId: string | null | undefined,
): string[] =>
	currentActiveId
		? [currentActiveId, ...stack.filter((id) => id !== currentActiveId)]
		: stack;
