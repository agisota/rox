/**
 * localStorage persistence for web appearance settings (variant 2a: local-only,
 * no DB/Electric). Reads are tolerant of partial/old payloads — unknown keys are
 * ignored and missing keys fall back to {@link DEFAULT_APPEARANCE_SETTINGS}.
 */

import {
	APPEARANCE_STORAGE_KEY,
	type AppearanceSettings,
	clampWindowOpacity,
	DEFAULT_APPEARANCE_SETTINGS,
} from "@rox/shared/appearance";

// Re-export so existing consumers keep importing the key from this module while
// the F06 first-paint script and this reader share one source of truth.
export { APPEARANCE_STORAGE_KEY };
const MIN_ROTATE_SECONDS = 5;

/** Coerce an unknown persisted blob into valid {@link AppearanceSettings}. */
function normalize(raw: unknown): AppearanceSettings {
	if (typeof raw !== "object" || raw === null) {
		return DEFAULT_APPEARANCE_SETTINGS;
	}
	const value = raw as Partial<AppearanceSettings>;
	return {
		glassEnabled:
			typeof value.glassEnabled === "boolean"
				? value.glassEnabled
				: DEFAULT_APPEARANCE_SETTINGS.glassEnabled,
		windowOpacity:
			typeof value.windowOpacity === "number" &&
			Number.isFinite(value.windowOpacity)
				? clampWindowOpacity(value.windowOpacity)
				: DEFAULT_APPEARANCE_SETTINGS.windowOpacity,
		wallpaperId:
			typeof value.wallpaperId === "string" || value.wallpaperId === null
				? value.wallpaperId
				: DEFAULT_APPEARANCE_SETTINGS.wallpaperId,
		wallpaperAutoRotate:
			typeof value.wallpaperAutoRotate === "boolean"
				? value.wallpaperAutoRotate
				: DEFAULT_APPEARANCE_SETTINGS.wallpaperAutoRotate,
		wallpaperRotateSeconds:
			typeof value.wallpaperRotateSeconds === "number" &&
			Number.isFinite(value.wallpaperRotateSeconds)
				? Math.max(MIN_ROTATE_SECONDS, value.wallpaperRotateSeconds)
				: DEFAULT_APPEARANCE_SETTINGS.wallpaperRotateSeconds,
		quoteLoaderEnabled:
			typeof value.quoteLoaderEnabled === "boolean"
				? value.quoteLoaderEnabled
				: DEFAULT_APPEARANCE_SETTINGS.quoteLoaderEnabled,
	};
}

/**
 * Read persisted appearance settings from localStorage. Returns the defaults on
 * the server (no `window`), when nothing is stored, or when the blob is invalid.
 */
export function readAppearanceSettings(): AppearanceSettings {
	if (typeof window === "undefined") return DEFAULT_APPEARANCE_SETTINGS;
	try {
		const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
		if (!stored) return DEFAULT_APPEARANCE_SETTINGS;
		return normalize(JSON.parse(stored));
	} catch {
		return DEFAULT_APPEARANCE_SETTINGS;
	}
}

/** Persist appearance settings to localStorage; no-op on the server or on error. */
export function writeAppearanceSettings(settings: AppearanceSettings): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			APPEARANCE_STORAGE_KEY,
			JSON.stringify(settings),
		);
	} catch {
		// Ignore quota / privacy-mode failures — settings stay in-memory only.
	}
}
