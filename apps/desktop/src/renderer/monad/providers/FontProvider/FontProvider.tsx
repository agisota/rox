import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type MonadFont = "blueprint" | "brutalist" | "terminal";

interface MonadFontStore {
	font: MonadFont;
	setFont: (font: MonadFont) => void;
}

/** Persisted MONAD font theme. Controllable from Settings later. */
export const useMonadFontStore = create<MonadFontStore>()(
	devtools(
		persist(
			(set) => ({ font: "blueprint", setFont: (font) => set({ font }) }),
			{ name: "monad-font-theme" },
		),
		{ name: "MonadFontTheme" },
	),
);

interface MonadFontContextValue {
	font: MonadFont;
	setFont: (font: MonadFont) => void;
}

const MonadFontContext = createContext<MonadFontContextValue | null>(null);

export function useMonadFont(): MonadFontContextValue {
	const ctx = useContext(MonadFontContext);
	if (!ctx) {
		throw new Error("useMonadFont must be used within a FontProvider");
	}
	return ctx;
}

export interface FontProviderProps {
	children: ReactNode;
	/** Element to carry `data-font`. Defaults to the document root. */
	target?: HTMLElement | null;
}

/**
 * Sets `data-font` on the document root (the value only ever affects
 * `[data-monad-root]` subtrees via tokens.css) and exposes the current font
 * theme through context. Restores the previous attribute on unmount.
 */
export function FontProvider({ children, target }: FontProviderProps) {
	const font = useMonadFontStore((s) => s.font);
	const setFont = useMonadFontStore((s) => s.setFont);

	useEffect(() => {
		const el = target ?? document.documentElement;
		const previous = el.getAttribute("data-font");
		el.setAttribute("data-font", font);
		return () => {
			if (previous === null) {
				el.removeAttribute("data-font");
			} else {
				el.setAttribute("data-font", previous);
			}
		};
	}, [font, target]);

	const value = useMemo<MonadFontContextValue>(
		() => ({ font, setFont }),
		[font, setFont],
	);

	return (
		<MonadFontContext.Provider value={value}>
			{children}
		</MonadFontContext.Provider>
	);
}
