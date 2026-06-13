"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { TYPEFACE_THEMES, type TypefaceTheme } from "../tokens";

function isTypefaceTheme(value: unknown): value is TypefaceTheme {
	return TYPEFACE_THEMES.includes(value as TypefaceTheme);
}

export interface TypefaceThemeContextValue {
	theme: TypefaceTheme;
	setTheme: (theme: TypefaceTheme) => void;
}

export const TypefaceThemeContext =
	createContext<TypefaceThemeContextValue | null>(null);

const FALLBACK: TypefaceThemeContextValue = {
	theme: "docs",
	setTheme: () => {},
};

/** Read the active typeface theme; safe outside a provider (docs, no-op set). */
export function useTypefaceTheme(): TypefaceThemeContextValue {
	return useContext(TypefaceThemeContext) ?? FALLBACK;
}

export interface TypefaceThemeProviderProps {
	children: ReactNode;
	className?: string;
	defaultTheme?: TypefaceTheme;
	/** localStorage key; set `persist={false}` to keep the choice in memory. */
	storageKey?: string;
	persist?: boolean;
}

/**
 * Scopes a typeface theme to a subtree: renders a wrapper carrying
 * `data-typeface`, which flips the `--frame-font-*` stacks declared in
 * `globals.css`. Persistence mirrors MotionFrameProvider — storage reads and
 * writes are try/catch-guarded and hydration happens once on mount.
 */
export function TypefaceThemeProvider({
	children,
	className,
	defaultTheme = "docs",
	storageKey = "rox-typeface-theme",
	persist = true,
}: TypefaceThemeProviderProps) {
	const [theme, setThemeState] = useState<TypefaceTheme>(defaultTheme);
	const hasHydrated = useRef(false);

	useEffect(() => {
		if (!persist || typeof window === "undefined" || hasHydrated.current) {
			return;
		}
		hasHydrated.current = true;
		try {
			const stored = window.localStorage.getItem(storageKey);
			if (isTypefaceTheme(stored)) {
				setThemeState(stored);
			}
		} catch {
			// Storage unavailable — keep the default theme.
		}
	}, [persist, storageKey]);

	const setTheme = useCallback(
		(next: TypefaceTheme) => {
			setThemeState(next);
			if (persist && typeof window !== "undefined") {
				try {
					window.localStorage.setItem(storageKey, next);
				} catch {
					// Storage unavailable — the choice still applies in memory.
				}
			}
		},
		[persist, storageKey],
	);

	const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

	return (
		<TypefaceThemeContext.Provider value={value}>
			<div className={className} data-typeface={theme}>
				{children}
			</div>
		</TypefaceThemeContext.Provider>
	);
}
