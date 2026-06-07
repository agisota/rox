import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import "../../tokens.css";

export type MonadAppearance = "dark" | "light";

interface MonadThemeContextValue {
	appearance: MonadAppearance;
	setAppearance: (appearance: MonadAppearance) => void;
	toggleAppearance: () => void;
}

const MonadThemeContext = createContext<MonadThemeContextValue | null>(null);

export function useMonadTheme(): MonadThemeContextValue {
	const ctx = useContext(MonadThemeContext);
	if (!ctx) {
		throw new Error("useMonadTheme must be used within a MonadThemeProvider");
	}
	return ctx;
}

export interface MonadThemeProviderProps {
	children: ReactNode;
	defaultAppearance?: MonadAppearance;
	className?: string;
	/** Paint the blueprint grid canvas on the root. Defaults to true. */
	blueprint?: boolean;
}

/**
 * Establishes a MONAD token scope by rendering a `[data-monad-root]` container.
 * All MONAD tokens live under this attribute (see tokens.css), so the provider
 * never touches the product's `:root` or its theme store. Nest a `FontProvider`
 * inside to drive the font theme.
 */
export function MonadThemeProvider({
	children,
	defaultAppearance = "dark",
	className,
	blueprint = true,
}: MonadThemeProviderProps) {
	const [appearance, setAppearance] =
		useState<MonadAppearance>(defaultAppearance);

	const toggleAppearance = useCallback(
		() => setAppearance((current) => (current === "dark" ? "light" : "dark")),
		[],
	);

	const value = useMemo<MonadThemeContextValue>(
		() => ({ appearance, setAppearance, toggleAppearance }),
		[appearance, toggleAppearance],
	);

	const rootClassName =
		[blueprint ? "monad-blueprint" : "", className].filter(Boolean).join(" ") ||
		undefined;

	return (
		<MonadThemeContext.Provider value={value}>
			<div
				data-monad-root=""
				data-monad-appearance={appearance}
				className={rootClassName}
			>
				{children}
			</div>
		</MonadThemeContext.Provider>
	);
}
