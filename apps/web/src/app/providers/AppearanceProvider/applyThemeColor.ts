/**
 * Dynamic `<meta name="theme-color">` driver for web (Hermes-borrow F09).
 *
 * The static `themeColor` in `layout.tsx` can't track the resolved theme/skin or
 * the active workspace accent. This helper reads the *computed* chrome-source
 * variable (shared priority: F25 `--workspace-accent`, then F08 `--background`)
 * and writes it to the live `<meta>` tag, so mobile Safari/Chrome status bars and
 * the PWA (F50) standalone title bar flip in lock-step with theme/skin/workspace
 * changes.
 *
 * Reading the *computed* value (vs. the raw `oklch(...)` token) is deliberate:
 * `getComputedStyle` resolves the variable to a concrete color string the OS
 * chrome can parse, regardless of how `--background` is authored. SSR-safe
 * (no-op without a `document`) and safe to call on every appearance change.
 */

import {
	type ChromeColorVar,
	resolveChromeColor,
} from "@rox/shared/appearance";

/** Meta tag name owned by this driver. */
const THEME_COLOR_META = 'meta[name="theme-color"]';

/**
 * Read a CSS custom property's *computed* color off the document root. Resolves
 * a raw token (e.g. `oklch(...)`) via `getComputedStyle`; returns the trimmed
 * value, or `null` when the variable is unset. We resolve through a throwaway
 * element's `color` so the browser normalizes any color space to a concrete,
 * meta-safe string even for variables that are only declared, never painted.
 */
function readComputedVar(name: ChromeColorVar): string | null {
	const root = document.documentElement;
	const raw = getComputedStyle(root).getPropertyValue(name).trim();
	if (!raw) return null;

	// Normalize the (possibly oklch) token into a concrete rendered color so the
	// OS chrome always receives something it can parse.
	const probe = document.createElement("span");
	probe.style.color = raw;
	probe.style.display = "none";
	root.appendChild(probe);
	const resolved = getComputedStyle(probe).color.trim();
	root.removeChild(probe);
	return resolved || raw;
}

/** Ensure the `<meta name="theme-color">` element exists, creating it if needed. */
function ensureThemeColorMeta(): HTMLMetaElement {
	const existing = document.querySelector<HTMLMetaElement>(THEME_COLOR_META);
	if (existing) return existing;
	const meta = document.createElement("meta");
	meta.name = "theme-color";
	document.head.appendChild(meta);
	return meta;
}

/**
 * Sync the native chrome `<meta name="theme-color">` to the resolved theme.
 * No-op on the server; keeps the current color when no source variable resolves.
 */
export function applyThemeColor(): void {
	if (typeof document === "undefined") return;
	const color = resolveChromeColor(readComputedVar);
	if (!color) return;
	ensureThemeColorMeta().content = color;
}
