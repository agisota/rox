/**
 * Global wallpaper store (custom-loading-screens epic).
 *
 * Owns the active wallpaper id plus the auto-rotation timer. The timer lives in
 * the store — never in a component — so navigation, React StrictMode double
 * mounts, and HMR never reset the background or restart the interval. The pure
 * {@link import("@rox/ui/wallpaper-layer").WallpaperLayer} simply renders the
 * resolved {@link Wallpaper} this store exposes.
 *
 * Persistence is owned by the main-process `appState` (via the
 * `window.getAppearance` / `window.setAppearance` tRPC procedures). This store
 * hydrates from there on init and re-reads after settings changes; it does not
 * persist itself, which keeps a single source of truth.
 */

import {
	getWallpaper,
	pickNext,
	WALLPAPERS,
	type Wallpaper,
} from "@rox/shared/appearance";
import { logger } from "renderer/lib/logger";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { create } from "zustand";

interface WallpaperState {
	/** Active wallpaper id, or null when no wallpaper background is shown. */
	wallpaperId: string | null;
	/** Whether the wallpaper advances on a timer. */
	autoRotate: boolean;
	/** Rotation interval in seconds when {@link autoRotate} is on. */
	rotateSeconds: number;
	/** True once the initial hydration from appState has completed. */
	isHydrated: boolean;

	/** Replace the appearance-driven fields and (re)start/stop the timer. */
	applySettings: (settings: {
		wallpaperId: string | null;
		wallpaperAutoRotate: boolean;
		wallpaperRotateSeconds: number;
	}) => void;
	/** Advance to a different wallpaper, never repeating the current one. */
	rotate: () => void;
	/** Hydrate from persisted appState. Idempotent; safe to call once at boot. */
	hydrate: () => Promise<void>;
}

/** Module-scoped interval handle so it survives store-consumer remounts. */
let rotationTimer: ReturnType<typeof setInterval> | null = null;

function stopTimer(): void {
	if (rotationTimer !== null) {
		clearInterval(rotationTimer);
		rotationTimer = null;
	}
}

export const useWallpaperStore = create<WallpaperState>((set, get) => {
	/**
	 * Reconcile the rotation timer with the current state. Runs the timer only
	 * when a wallpaper is selected, auto-rotate is on, and there is more than one
	 * candidate to rotate between.
	 */
	const syncTimer = (): void => {
		stopTimer();
		const { wallpaperId, autoRotate, rotateSeconds } = get();
		if (!wallpaperId || !autoRotate || WALLPAPERS.length <= 1) return;
		const intervalMs = Math.max(5, rotateSeconds) * 1000;
		rotationTimer = setInterval(() => {
			get().rotate();
		}, intervalMs);
	};

	return {
		wallpaperId: null,
		autoRotate: true,
		rotateSeconds: 120,
		isHydrated: false,

		applySettings: (settings) => {
			set({
				wallpaperId: settings.wallpaperId,
				autoRotate: settings.wallpaperAutoRotate,
				rotateSeconds: settings.wallpaperRotateSeconds,
			});
			syncTimer();
		},

		rotate: () => {
			const next = pickNext(WALLPAPERS, get().wallpaperId);
			if (next) set({ wallpaperId: next.id });
		},

		hydrate: async () => {
			try {
				const appearance =
					await electronTrpcClient.window.getAppearance.query();
				if (appearance) {
					set({
						wallpaperId: appearance.wallpaperId,
						autoRotate: appearance.wallpaperAutoRotate,
						rotateSeconds: appearance.wallpaperRotateSeconds,
						isHydrated: true,
					});
				} else {
					set({ isHydrated: true });
				}
			} catch (error) {
				logger.warn("[wallpaper] Failed to hydrate from appState:", error);
				set({ isHydrated: true });
			}
			syncTimer();
		},
	};
});

/**
 * Resolve the active {@link Wallpaper} object, or null when no wallpaper is set
 * (or the persisted id is stale / no longer in the pack).
 */
export function useCurrentWallpaper(): Wallpaper | null {
	const wallpaperId = useWallpaperStore((s) => s.wallpaperId);
	return getWallpaper(wallpaperId) ?? null;
}
