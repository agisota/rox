"use client";

/**
 * AppearanceProvider — local-only (variant 2a) appearance state for web.
 *
 * Owns the {@link AppearanceSettings} object (persisted to `localStorage`), the
 * glass DOM application, and the wallpaper rotation timer. The timer and the
 * resolved current wallpaper live here — never in {@link WallpaperLayer} — so
 * navigation / StrictMode remounts never reset the background.
 *
 * Hydration-safe: SSR and the first client render use the default settings; the
 * persisted blob is loaded and DOM side-effects applied inside effects.
 */

import {
	type AppearanceSettings,
	DEFAULT_APPEARANCE_SETTINGS,
	getWallpaper,
	pickNext,
	WALLPAPERS,
	type Wallpaper,
} from "@rox/shared/appearance";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { applyGlass } from "./applyGlass";
import { applyThemeColor } from "./applyThemeColor";
import { readAppearanceSettings, writeAppearanceSettings } from "./storage";

interface AppearanceContextValue {
	/** Current appearance settings. */
	settings: AppearanceSettings;
	/** Replace the settings (full object or updater); persists to localStorage. */
	setSettings: (
		next:
			| AppearanceSettings
			| ((prev: AppearanceSettings) => AppearanceSettings),
	) => void;
	/** Resolved current wallpaper (respects rotation), or null when off. */
	currentWallpaper: Wallpaper | null;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/** Provide local appearance settings + the resolved current wallpaper. */
export function AppearanceProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [settings, setSettingsState] = useState<AppearanceSettings>(
		DEFAULT_APPEARANCE_SETTINGS,
	);
	// Wallpaper currently displayed by the rotation timer. Starts from the
	// configured wallpaperId; the timer advances it independently.
	const [rotatedWallpaperId, setRotatedWallpaperId] = useState<string | null>(
		null,
	);

	// Load persisted settings after mount (avoids hydration mismatch).
	useEffect(() => {
		const stored = readAppearanceSettings();
		setSettingsState(stored);
		setRotatedWallpaperId(stored.wallpaperId);
	}, []);

	const setSettings = useCallback<AppearanceContextValue["setSettings"]>(
		(next) => {
			setSettingsState((prev) => {
				const resolved = typeof next === "function" ? next(prev) : next;
				writeAppearanceSettings(resolved);
				return resolved;
			});
		},
		[],
	);

	// Keep the rotation cursor in sync when the configured wallpaper changes.
	useEffect(() => {
		setRotatedWallpaperId(settings.wallpaperId);
	}, [settings.wallpaperId]);

	// Apply glass DOM side-effects whenever the relevant settings change.
	useEffect(() => {
		applyGlass(settings);
	}, [settings]);

	// Sync the native chrome <meta theme-color> with the resolved theme (F09).
	// A single MutationObserver on the root drives every update: theme/skin flips
	// (F08 root `class`), workspace-accent changes (F25 `--workspace-accent` on
	// `style`), and glass tweaks (`applyGlass` above also mutates root
	// `class`/`style`) all toggle the watched attributes, so the meta tag tracks
	// them in lock-step. Runs once on mount for the initial paint.
	useEffect(() => {
		applyThemeColor();
		const observer = new MutationObserver(() => applyThemeColor());
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style", "data-theme"],
		});
		return () => observer.disconnect();
	}, []);

	// Wallpaper rotation timer (owned here, not in the component). Advances the
	// displayed wallpaper every `wallpaperRotateSeconds` while auto-rotate is on.
	const rotatedIdRef = useRef(rotatedWallpaperId);
	rotatedIdRef.current = rotatedWallpaperId;
	useEffect(() => {
		if (
			!settings.wallpaperAutoRotate ||
			settings.wallpaperId === null ||
			WALLPAPERS.length < 2
		) {
			return;
		}
		const intervalMs = Math.max(5, settings.wallpaperRotateSeconds) * 1000;
		const timer = window.setInterval(() => {
			const next = pickNext(WALLPAPERS, rotatedIdRef.current);
			if (next) setRotatedWallpaperId(next.id);
		}, intervalMs);
		return () => window.clearInterval(timer);
	}, [
		settings.wallpaperAutoRotate,
		settings.wallpaperId,
		settings.wallpaperRotateSeconds,
	]);

	const currentWallpaper = useMemo<Wallpaper | null>(() => {
		if (settings.wallpaperId === null) return null;
		return getWallpaper(rotatedWallpaperId) ?? null;
	}, [settings.wallpaperId, rotatedWallpaperId]);

	const value = useMemo<AppearanceContextValue>(
		() => ({ settings, setSettings, currentWallpaper }),
		[settings, setSettings, currentWallpaper],
	);

	return (
		<AppearanceContext.Provider value={value}>
			{children}
		</AppearanceContext.Provider>
	);
}

/** Access the appearance context. Throws if used outside {@link AppearanceProvider}. */
export function useAppearance(): AppearanceContextValue {
	const context = useContext(AppearanceContext);
	if (context === null) {
		throw new Error("useAppearance must be used within an AppearanceProvider");
	}
	return context;
}
