"use client";

/**
 * SkinProvider — the *skin* axis of the F08 Theme × Skin two-axis model on web.
 *
 * Orthogonal to `next-themes` (which owns the Theme axis: System/Dark/Light via
 * the `.dark` class). This provider owns the named-skin selection: it persists
 * the chosen skin id to localStorage and applies the skin's CSS-var overrides to
 * the document root via the shared `@rox/ui/theme` appliers, writing `data-skin`
 * and crossfading from the previous skin.
 *
 * The crossfade runs through `applySkin` → `animateThemeChange`, which is
 * reduced-motion aware (the imperative `shouldAnimate` twin of
 * `useShouldAnimate`): on first paint and under reduced motion it hard-sets with
 * no flash. The first applied skin uses `prevSkin = null`, so initial paint is a
 * flash-free hard set that matches the pre-hydration `data-skin` (F06).
 */

import { SKIN_STORAGE_KEY } from "@rox/shared/constants";
import {
	applySkin,
	DEFAULT_SKIN_ID,
	getSkin,
	SKINS,
	type Skin,
} from "@rox/ui/theme";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

interface SkinContextValue {
	/** Active skin id (also written to the root `data-skin`). */
	skinId: string;
	/** All selectable skins for the picker. */
	skins: Skin[];
	/** Switch to a skin by id; persists + crossfades. */
	setSkin: (id: string) => void;
}

const SkinContext = createContext<SkinContextValue | null>(null);

function readStoredSkinId(): string {
	if (typeof window === "undefined") return DEFAULT_SKIN_ID;
	try {
		return window.localStorage.getItem(SKIN_STORAGE_KEY) ?? DEFAULT_SKIN_ID;
	} catch {
		return DEFAULT_SKIN_ID;
	}
}

export function SkinProvider({ children }: { children: React.ReactNode }) {
	// SSR / first client render use the default; the persisted id is loaded in an
	// effect to avoid a hydration mismatch (the pre-hydration script already set
	// the correct `data-skin`, so there is no flash).
	const [skinId, setSkinId] = useState<string>(DEFAULT_SKIN_ID);
	const prevSkinRef = useRef<Skin | null>(null);

	useEffect(() => {
		const stored = readStoredSkinId();
		const skin = getSkin(stored);
		applySkin(prevSkinRef.current, skin);
		prevSkinRef.current = skin;
		setSkinId(skin.id);
	}, []);

	const setSkin = useCallback((id: string) => {
		const skin = getSkin(id);
		applySkin(prevSkinRef.current, skin);
		prevSkinRef.current = skin;
		setSkinId(skin.id);
		try {
			window.localStorage.setItem(SKIN_STORAGE_KEY, skin.id);
		} catch {
			// localStorage may be unavailable (private mode) — skin still applied.
		}
	}, []);

	return (
		<SkinContext.Provider value={{ skinId, skins: SKINS, setSkin }}>
			{children}
		</SkinContext.Provider>
	);
}

/** Access the active skin + setter. Throws outside a {@link SkinProvider}. */
export function useSkin(): SkinContextValue {
	const ctx = useContext(SkinContext);
	if (!ctx) {
		throw new Error("useSkin must be used within a SkinProvider");
	}
	return ctx;
}
