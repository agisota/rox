import {
	skinToNavTokens,
	skinToStyleTokens,
} from "@rox/ui/theme/mobile-adapter";
import { DEFAULT_SKIN_ID, getSkin } from "@rox/ui/theme/skins";
import {
	DarkTheme,
	DefaultTheme,
	type Theme,
} from "expo-router/react-navigation";

export const THEME = {
	light: {
		background: "hsl(0 0% 100%)",
		foreground: "hsl(240 10% 3.9%)",
		card: "hsl(0 0% 100%)",
		cardForeground: "hsl(240 10% 3.9%)",
		popover: "hsl(0 0% 100%)",
		popoverForeground: "hsl(240 10% 3.9%)",
		primary: "hsl(240 5.9% 10%)",
		primaryForeground: "hsl(0 0% 98%)",
		secondary: "hsl(240 4.8% 95.9%)",
		secondaryForeground: "hsl(240 5.9% 10%)",
		muted: "hsl(240 4.8% 95.9%)",
		mutedForeground: "hsl(240 3.8% 46.1%)",
		accent: "hsl(240 4.8% 95.9%)",
		accentForeground: "hsl(240 5.9% 10%)",
		destructive: "hsl(0 84.2% 60.2%)",
		border: "hsl(240 5.9% 90%)",
		input: "hsl(240 5.9% 90%)",
		ring: "hsl(240 5.9% 10%)",
		radius: "0.5rem",
	},
	dark: {
		background: "hsl(240 10% 3.9%)",
		foreground: "hsl(0 0% 98%)",
		card: "hsl(240 10% 3.9%)",
		cardForeground: "hsl(0 0% 98%)",
		popover: "hsl(240 10% 3.9%)",
		popoverForeground: "hsl(0 0% 98%)",
		primary: "hsl(0 0% 98%)",
		primaryForeground: "hsl(240 5.9% 10%)",
		secondary: "hsl(240 3.7% 15.9%)",
		secondaryForeground: "hsl(0 0% 98%)",
		muted: "hsl(240 3.7% 15.9%)",
		mutedForeground: "hsl(240 5% 64.9%)",
		accent: "hsl(240 3.7% 15.9%)",
		accentForeground: "hsl(0 0% 98%)",
		destructive: "hsl(0 62.8% 30.6%)",
		border: "hsl(240 3.7% 15.9%)",
		input: "hsl(240 3.7% 15.9%)",
		ring: "hsl(240 4.9% 83.9%)",
		radius: "0.5rem",
	},
};

export const NAV_THEME: Record<"light" | "dark", Theme> = {
	light: {
		...DefaultTheme,
		colors: {
			...DefaultTheme.colors,
			background: THEME.light.background,
			border: THEME.light.border,
			card: THEME.light.card,
			notification: THEME.light.destructive,
			primary: THEME.light.primary,
			text: THEME.light.foreground,
		},
	},
	dark: {
		...DarkTheme,
		colors: {
			...DarkTheme.colors,
			background: THEME.dark.background,
			border: THEME.dark.border,
			card: THEME.dark.card,
			notification: THEME.dark.destructive,
			primary: THEME.dark.primary,
			text: THEME.dark.foreground,
		},
	},
};

/**
 * Native status-bar icon contrast derived from the active theme (Hermes-borrow
 * F09).
 *
 * The mobile equivalent of the web `<meta name="theme-color">` / desktop glass
 * accent: the OS status bar should track the *same* resolved theme. Under Expo
 * SDK 56 the status bar is edge-to-edge (transparent strip; the screen's own
 * theme-driven background shows through), so only the icon `style` is set here —
 * `light` icons over the dark surface, `dark` over a light one. Derived (not
 * hardcoded at the call site) so a future light theme / workspace accent flips
 * the contrast in lock-step by selecting the matching scheme.
 */
export const STATUS_BAR_THEME: Record<
	"light" | "dark",
	{ style: "light" | "dark" }
> = {
	light: { style: "dark" },
	dark: { style: "light" },
};

/**
 * F08 mobile skin adapter — layer a shared `@rox/ui/theme` skin over the base
 * RN ramp.
 *
 * The Theme × Skin model lives once in `@rox/ui`; RN can't read CSS variables,
 * so {@link skinToStyleTokens} resolves the skin to a plain token map that we
 * merge over `THEME[mode]`. Omitted skin tokens fall through to the base ramp,
 * exactly like the web skin layers over globals.css. `default` is a no-op merge.
 */
export function resolveSkinnedTheme(
	mode: "light" | "dark",
	skinId: string = DEFAULT_SKIN_ID,
): (typeof THEME)["light"] {
	const tokens = skinToStyleTokens(getSkin(skinId));
	return { ...THEME[mode], ...tokens };
}

/** Navigation theme for a mode + skin (skin accent/background layered in). */
export function resolveSkinnedNavTheme(
	mode: "light" | "dark",
	skinId: string = DEFAULT_SKIN_ID,
): Theme {
	const base = NAV_THEME[mode];
	const overrides = skinToNavTokens(getSkin(skinId));
	return { ...base, colors: { ...base.colors, ...overrides } };
}
