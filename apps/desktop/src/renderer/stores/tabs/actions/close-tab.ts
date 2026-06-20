import type { TabsState } from "../types";

/**
 * Finds the next best tab to activate when closing a tab.
 * Priority order:
 * 1. Most recently used tab from history stack
 * 2. Next/previous tab by position
 * 3. Any remaining tab in the workspace
 */
export const findNextTab = (
	state: TabsState,
	tabIdToClose: string,
): string | null => {
	const tabToClose = state.tabs.find((t) => t.id === tabIdToClose);
	if (!tabToClose) return null;

	const workspaceId = tabToClose.workspaceId;
	const workspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId && t.id !== tabIdToClose,
	);

	if (workspaceTabs.length === 0) return null;

	// Try history first
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	for (const historyTabId of historyStack) {
		if (historyTabId === tabIdToClose) continue;
		if (workspaceTabs.some((t) => t.id === historyTabId)) {
			return historyTabId;
		}
	}

	// Try position-based (next, then previous)
	const allWorkspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId,
	);
	const currentIndex = allWorkspaceTabs.findIndex((t) => t.id === tabIdToClose);

	if (currentIndex !== -1) {
		const nextIndex = currentIndex + 1;
		const prevIndex = currentIndex - 1;

		if (
			nextIndex < allWorkspaceTabs.length &&
			allWorkspaceTabs[nextIndex].id !== tabIdToClose
		) {
			return allWorkspaceTabs[nextIndex].id;
		}
		if (prevIndex >= 0 && allWorkspaceTabs[prevIndex].id !== tabIdToClose) {
			return allWorkspaceTabs[prevIndex].id;
		}
	}

	// Fallback to first available
	return workspaceTabs[0]?.id || null;
};

export const deriveTabName = (
	panes: Record<string, { tabId: string; name: string }>,
	tabId: string,
): string => {
	const tabPanes = Object.values(panes).filter((p) => p.tabId === tabId);
	if (tabPanes.length === 1) return tabPanes[0].name;
	return `Multiple panes (${tabPanes.length})`;
};

export type TabsMoveStateUpdate = Pick<
	TabsState,
	"tabs" | "panes" | "activeTabIds" | "focusedPaneIds" | "tabHistoryStacks"
>;

export const withDerivedTabNames = (
	state: TabsMoveStateUpdate,
	tabIds: Iterable<string | undefined>,
): TabsMoveStateUpdate => {
	const affectedTabIds = new Set<string>();
	for (const tabId of tabIds) {
		if (tabId) {
			affectedTabIds.add(tabId);
		}
	}

	if (affectedTabIds.size === 0) {
		return state;
	}

	return {
		...state,
		tabs: state.tabs.map((tab) =>
			affectedTabIds.has(tab.id)
				? { ...tab, name: deriveTabName(state.panes, tab.id) }
				: tab,
		),
	};
};
