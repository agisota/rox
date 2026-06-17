/**
 * One-shot initializer for the wallpaper store (custom-loading-screens epic).
 *
 * Mount this once near the app root. It hydrates the store from the persisted
 * appState exactly once so the rotation timer starts immediately, independent
 * of which screen happens to render the {@link useCurrentWallpaper} background.
 */

import { useEffect } from "react";
import { useWallpaperStore } from "./store";

/** Hydrate the global wallpaper store a single time on mount. */
export function useInitWallpaperStore(): void {
	useEffect(() => {
		// Guard against React StrictMode's double-invoke: only hydrate once.
		if (useWallpaperStore.getState().isHydrated) return;
		void useWallpaperStore.getState().hydrate();
	}, []);
}
