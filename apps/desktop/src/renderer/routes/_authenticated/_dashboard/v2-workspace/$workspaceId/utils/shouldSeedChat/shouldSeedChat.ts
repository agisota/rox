import type { WorkspaceState } from "@rox/panes";
import type { PaneViewerData } from "../../types";

/**
 * Whether to seed a chat tab when entering a workspace.
 * True only for a known-but-empty layout (no tabs). A null/undefined layout
 * means "not hydrated yet" → never seed (anti-race guarantee, paired with the
 * isLayoutHydrated gate in page.tsx).
 */
export function shouldSeedChat(
	persistedLayout: WorkspaceState<PaneViewerData> | null | undefined,
): boolean {
	if (!persistedLayout) return false;
	return persistedLayout.tabs.length === 0;
}
