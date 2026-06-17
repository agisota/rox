/**
 * One-shot initializer for the wallpaper store (custom-loading-screens epic).
 *
 * Mount this once near the app root. It hydrates the store from the persisted
 * appState exactly once so the rotation timer starts immediately, independent
 * of which screen happens to render the {@link useCurrentWallpaper} background.
 */

import { useEffect } from "react";
import { useWallpaperStore } from "./store";

let hydrateInFlight: Promise<void> | null = null;

/** Hydrate the global wallpaper store a single time on mount. */
export function useInitWallpaperStore(): void {
	useEffect(() => {
		const state = useWallpaperStore.getState();
		if (state.isHydrated || hydrateInFlight) return;
		hydrateInFlight = state.hydrate().finally(() => {
			hydrateInFlight = null;
		});
	}, []);
}
