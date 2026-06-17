/**
 * Glass DOM helper for web (custom-loading-screens epic).
 *
 * Mirrors the desktop `applyGlass` conceptually: it drives the shared
 * `--surface-opacity` / `--backdrop-blur` CSS variables and the `.glass`
 * document-root class that `@rox/ui/globals.css` reacts to. No new CSS is
 * needed on web — toggling these is enough to enable the glass look.
 */

import {
	type AppearanceSettings,
	clampWindowOpacity,
} from "@rox/shared/appearance";

/** Backdrop blur radius (px) applied when glass is enabled on web. */
const BACKDROP_BLUR_PX = 24;

/**
 * Apply glass settings to the document root: toggles the `.glass` class and
 * sets the opacity/blur CSS variables when enabled, removing them otherwise.
 * SSR-safe (no-op without a `document`) and safe to call on every change.
 */
export function applyGlass(settings: AppearanceSettings): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;

	if (!settings.glassEnabled) {
		root.classList.remove("glass");
		root.style.removeProperty("--surface-opacity");
		root.style.removeProperty("--backdrop-blur");
		return;
	}

	root.classList.add("glass");
	root.style.setProperty(
		"--surface-opacity",
		String(clampWindowOpacity(settings.windowOpacity)),
	);
	root.style.setProperty("--backdrop-blur", `${BACKDROP_BLUR_PX}px`);
}
