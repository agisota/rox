import { create } from "zustand";
import type { SettingItemId } from "../settings-search";

/**
 * Command-palette → Settings deep-link plumbing (#592).
 *
 * The command palette can jump straight to one specific setting (not just a
 * section). It records the target {@link SettingItemId} here and navigates to
 * the owning section route; the destination page then scrolls the matching card
 * into view and flashes it once via `@rox/ui/motion` so the eye lands on the
 * right control. The target is one-shot: it is consumed (cleared) as soon as the
 * arrival flash starts so a later in-page render or a back/forward navigation
 * doesn't re-trigger it.
 *
 * Logic lives in this plain zustand store (no renderer JSX) so it stays portable
 * and unit-testable; the cross-platform desktop/web settings surfaces share it.
 */

/** Stable DOM id for a setting's deep-link anchor element. */
export function settingItemAnchorId(itemId: SettingItemId): string {
	return `setting-item-${itemId}`;
}

interface SettingsDeepLinkState {
	/** The setting the command palette asked to reveal, or null when idle. */
	pendingItemId: SettingItemId | null;
	/** Record a deep-link target (called from the command-palette action). */
	requestDeepLink: (itemId: SettingItemId) => void;
	/**
	 * Consume the pending target if it matches `itemId`, returning true so the
	 * caller knows to run its one-shot arrival flash. No-op (returns false) when
	 * there is no pending target or it points at a different item.
	 */
	consumeDeepLink: (itemId: SettingItemId) => boolean;
	/** Clear any pending target without flashing (e.g. on unmount/cleanup). */
	clearDeepLink: () => void;
}

export const useSettingsDeepLinkStore = create<SettingsDeepLinkState>(
	(set, get) => ({
		pendingItemId: null,
		requestDeepLink: (itemId) => set({ pendingItemId: itemId }),
		consumeDeepLink: (itemId) => {
			if (get().pendingItemId !== itemId) return false;
			set({ pendingItemId: null });
			return true;
		},
		clearDeepLink: () => set({ pendingItemId: null }),
	}),
);

/** Imperative accessor for non-React call sites (command `run` handlers). */
export function requestSettingsDeepLink(itemId: SettingItemId): void {
	useSettingsDeepLinkStore.getState().requestDeepLink(itemId);
}
