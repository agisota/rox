/**
 * Shared UI color model (F08 — Theme × Skin two-axis).
 *
 * This is the single source of truth for the *skin* axis: the named palette of
 * UI chrome colors that a Zed-derived skin supplies. It is intentionally
 * platform-neutral — every value is a CSS color string (hex / rgb / oklch) so
 * the web applies it to CSS custom properties, the desktop reuses it verbatim,
 * and the mobile adapter maps it into React Native style structs.
 *
 * Previously this type lived only in the desktop app
 * (`apps/desktop/src/shared/themes/types.ts`). It was lifted here so the Theme
 * type and skin model exist once and are shared across web + desktop + mobile.
 * The desktop `Theme` (which also carries terminal/editor palettes) now builds
 * on top of this `UIColors` shape rather than redefining it.
 */
export interface UIColors {
	// Core backgrounds
	background: string;
	foreground: string;

	// Card/Panel backgrounds
	card: string;
	cardForeground: string;

	// Popover/Dropdown
	popover: string;
	popoverForeground: string;

	// Primary actions (buttons, links)
	primary: string;
	primaryForeground: string;

	// Secondary elements
	secondary: string;
	secondaryForeground: string;

	// Muted/subtle elements
	muted: string;
	mutedForeground: string;

	// Accent highlights
	accent: string;
	accentForeground: string;

	// Tertiary (panel toolbars)
	tertiary: string;
	tertiaryActive: string;

	// Destructive actions
	destructive: string;
	destructiveForeground: string;

	// Borders and inputs
	border: string;
	input: string;
	ring: string;

	// Sidebar specific
	sidebar: string;
	sidebarForeground: string;
	sidebarPrimary: string;
	sidebarPrimaryForeground: string;
	sidebarAccent: string;
	sidebarAccentForeground: string;
	sidebarBorder: string;
	sidebarRing: string;

	// Chart/data visualization colors
	chart1: string;
	chart2: string;
	chart3: string;
	chart4: string;
	chart5: string;

	// Search highlight colors (CSS Custom Highlight API)
	highlightMatch: string;
	highlightActive: string;

	// Brand highlight (e.g. PRO badge). Theme-defining color used for accents
	// that should pop against muted UI chrome. Optional so existing stored
	// skins without this token still typecheck — globals.css supplies a
	// fallback value.
	highlight?: string;
	highlightForeground?: string;
}

/**
 * Maps each UI color key to the CSS custom property it drives on the document
 * root. Shared by the web skin applier and the desktop theme store so a skin is
 * applied identically on both platforms.
 */
export const UI_COLOR_TO_CSS_VAR: Record<keyof UIColors, string> = {
	background: "--background",
	foreground: "--foreground",
	card: "--card",
	cardForeground: "--card-foreground",
	popover: "--popover",
	popoverForeground: "--popover-foreground",
	primary: "--primary",
	primaryForeground: "--primary-foreground",
	secondary: "--secondary",
	secondaryForeground: "--secondary-foreground",
	muted: "--muted",
	mutedForeground: "--muted-foreground",
	accent: "--accent",
	accentForeground: "--accent-foreground",
	tertiary: "--tertiary",
	tertiaryActive: "--tertiary-active",
	destructive: "--destructive",
	destructiveForeground: "--destructive-foreground",
	border: "--border",
	input: "--input",
	ring: "--ring",
	sidebar: "--sidebar",
	sidebarForeground: "--sidebar-foreground",
	sidebarPrimary: "--sidebar-primary",
	sidebarPrimaryForeground: "--sidebar-primary-foreground",
	sidebarAccent: "--sidebar-accent",
	sidebarAccentForeground: "--sidebar-accent-foreground",
	sidebarBorder: "--sidebar-border",
	sidebarRing: "--sidebar-ring",
	chart1: "--chart-1",
	chart2: "--chart-2",
	chart3: "--chart-3",
	chart4: "--chart-4",
	chart5: "--chart-5",
	highlightMatch: "--highlight-match",
	highlightActive: "--highlight-active",
	highlight: "--highlight",
	highlightForeground: "--highlight-foreground",
};

/**
 * Apply UI colors to CSS variables on the document root.
 *
 * Used both as the hard-set path of {@link animateThemeChange} and directly on
 * first paint. Only writes keys that are present so a partial skin (no
 * highlight, say) falls through to the globals.css default.
 */
export function applyUIColors(colors: UIColors): void {
	const root = document.documentElement;

	for (const [key, cssVar] of Object.entries(UI_COLOR_TO_CSS_VAR)) {
		const value = colors[key as keyof UIColors];
		if (value) {
			root.style.setProperty(cssVar, value);
		}
	}
}

/**
 * Update the dark/light mode class on the document root.
 *
 * This is the *theme* axis (orthogonal to the skin). `next-themes` already owns
 * this on web; the desktop theme store calls it directly.
 */
export function updateThemeClass(type: "dark" | "light"): void {
	const html = document.documentElement;
	if (type === "dark") {
		html.classList.add("dark");
		html.classList.remove("light");
	} else {
		html.classList.add("light");
		html.classList.remove("dark");
	}
}

/**
 * Remove all skin CSS variables, resetting the document root to the stylesheet
 * defaults (the `:root` / `.dark` blocks in globals.css).
 */
export function clearThemeVariables(): void {
	const root = document.documentElement;
	for (const cssVar of Object.values(UI_COLOR_TO_CSS_VAR)) {
		root.style.removeProperty(cssVar);
	}
}
