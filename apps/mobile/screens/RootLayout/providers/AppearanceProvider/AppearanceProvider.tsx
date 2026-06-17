import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	type AppearanceSettings,
	clampWindowOpacity,
	DEFAULT_APPEARANCE_SETTINGS,
	pickNext,
	WALLPAPERS,
} from "@rox/shared/appearance";
import type { ReactNode } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

/** AsyncStorage key under which appearance settings are persisted (local-only). */
const STORAGE_KEY = "rox.appearance.settings";
/** Lower bound for the rotation interval — mirrors web `storage.ts`. */
const MIN_ROTATE_SECONDS = 5;

/** Value exposed by {@link AppearanceProvider}. */
interface AppearanceContextValue {
	/** Current appearance settings (defaults until hydration completes). */
	settings: AppearanceSettings;
	/** Whether persisted settings have finished loading from AsyncStorage. */
	isHydrated: boolean;
	/**
	 * Merge a partial update into the settings and persist it. Owns no UI; the
	 * wallpaper rotation timer lives in this provider so it survives navigation.
	 */
	updateSettings: (patch: Partial<AppearanceSettings>) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * Coerce an unknown persisted value into a complete {@link AppearanceSettings}.
 *
 * Missing or malformed fields fall back to {@link DEFAULT_APPEARANCE_SETTINGS}
 * so older persisted blobs migrate forward by gaining defaults.
 */
function normalizeSettings(raw: unknown): AppearanceSettings {
	if (typeof raw !== "object" || raw === null) {
		return DEFAULT_APPEARANCE_SETTINGS;
	}
	const value = raw as Partial<Record<keyof AppearanceSettings, unknown>>;
	const d = DEFAULT_APPEARANCE_SETTINGS;
	return {
		glassEnabled:
			typeof value.glassEnabled === "boolean"
				? value.glassEnabled
				: d.glassEnabled,
		windowOpacity:
			typeof value.windowOpacity === "number" &&
			Number.isFinite(value.windowOpacity)
				? clampWindowOpacity(value.windowOpacity)
				: d.windowOpacity,
		wallpaperId:
			typeof value.wallpaperId === "string" || value.wallpaperId === null
				? value.wallpaperId
				: d.wallpaperId,
		wallpaperAutoRotate:
			typeof value.wallpaperAutoRotate === "boolean"
				? value.wallpaperAutoRotate
				: d.wallpaperAutoRotate,
		wallpaperRotateSeconds:
			typeof value.wallpaperRotateSeconds === "number" &&
			Number.isFinite(value.wallpaperRotateSeconds)
				? Math.max(MIN_ROTATE_SECONDS, value.wallpaperRotateSeconds)
				: d.wallpaperRotateSeconds,
		quoteLoaderEnabled:
			typeof value.quoteLoaderEnabled === "boolean"
				? value.quoteLoaderEnabled
				: d.quoteLoaderEnabled,
	};
}

/**
 * Local-only appearance settings provider for the mobile app.
 *
 * Holds {@link AppearanceSettings} in React state, persists them with
 * AsyncStorage, and owns the wallpaper auto-rotation interval. The timer lives
 * here (not inside the background component) so rotation survives navigation and
 * component remounts. When `wallpaperAutoRotate` is on and a wallpaper is
 * selected, it advances `wallpaperId` via `pickNext(WALLPAPERS, currentId)`
 * every `wallpaperRotateSeconds`.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = useState<AppearanceSettings>(
		DEFAULT_APPEARANCE_SETTINGS,
	);
	const [isHydrated, setIsHydrated] = useState(false);

	// Hydrate persisted settings once on mount.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const stored = await AsyncStorage.getItem(STORAGE_KEY);
				if (!cancelled && stored !== null) {
					setSettings(normalizeSettings(JSON.parse(stored)));
				}
			} catch {
				// Corrupt/unavailable storage: keep defaults.
			} finally {
				if (!cancelled) setIsHydrated(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const updateSettings = useCallback((patch: Partial<AppearanceSettings>) => {
		setSettings((prev) => {
			const next = { ...prev, ...patch };
			void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
				// Best-effort persistence; in-memory state still updates.
			});
			return next;
		});
	}, []);

	// Wallpaper auto-rotation timer. Lives in the provider so it is independent of
	// which screen is mounted. Re-created whenever the rotation inputs change;
	// the current id is read from a ref so each tick advances from the latest
	// value without re-arming the interval on every step.
	const wallpaperIdRef = useRef(settings.wallpaperId);
	wallpaperIdRef.current = settings.wallpaperId;
	const hasWallpaper = settings.wallpaperId !== null;
	useEffect(() => {
		if (!settings.wallpaperAutoRotate || !hasWallpaper) {
			return;
		}
		const intervalMs = Math.max(5, settings.wallpaperRotateSeconds) * 1000;
		const timer = setInterval(() => {
			const next = pickNext(WALLPAPERS, wallpaperIdRef.current);
			if (next) updateSettings({ wallpaperId: next.id });
		}, intervalMs);
		return () => clearInterval(timer);
	}, [
		settings.wallpaperAutoRotate,
		settings.wallpaperRotateSeconds,
		hasWallpaper,
		updateSettings,
	]);

	const value = useMemo<AppearanceContextValue>(
		() => ({ settings, isHydrated, updateSettings }),
		[settings, isHydrated, updateSettings],
	);

	return (
		<AppearanceContext.Provider value={value}>
			{children}
		</AppearanceContext.Provider>
	);
}

/** Access appearance settings + updater. Must be used within AppearanceProvider. */
export function useAppearance(): AppearanceContextValue {
	const context = useContext(AppearanceContext);
	if (context === null) {
		throw new Error("useAppearance must be used within AppearanceProvider");
	}
	return context;
}
