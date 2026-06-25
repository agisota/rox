/**
 * Native window-chrome theme-color derivation (Hermes-borrow F09).
 *
 * The browser status bar / PWA title bar (web + mobile) and the desktop glass
 * titlebar should track the *resolved* theme at runtime — not a static value.
 * The shared decision here is "which CSS custom property feeds the chrome
 * color", expressed as an ordered preference list:
 *
 *   1. the active workspace accent (F25 `--workspace-accent`) when present, so
 *      switching workspace re-tints the OS chrome in lock-step;
 *   2. the resolved surface `--background` (F08 theme/skin) otherwise.
 *
 * Injection differs per platform (meta tag on web, glass var on desktop, native
 * StatusBar on mobile RN) but every platform consumes the same ordered list, so
 * the "what color" decision lives here once. Reading the *computed* value of the
 * chosen variable (rather than the raw `oklch(...)` token) is left to each
 * platform's reader, because only the platform can resolve a var to a concrete,
 * meta-safe color string.
 */

/**
 * CSS custom properties that can feed the native chrome color, in priority
 * order. The first variable that resolves to a non-empty computed color wins;
 * consumers fall through to the next when a variable is unset (e.g. F25 not yet
 * active, so `--workspace-accent` is absent and `--background` is used).
 */
export const CHROME_COLOR_VAR_PRIORITY = [
	"--workspace-accent",
	"--background",
] as const;

/** A CSS custom property name eligible to source the chrome color. */
export type ChromeColorVar = (typeof CHROME_COLOR_VAR_PRIORITY)[number];

/**
 * Resolve a chrome color from a variable reader, following
 * {@link CHROME_COLOR_VAR_PRIORITY}.
 *
 * `readVar` returns the *computed* value of a CSS variable (already resolved to
 * a concrete color by the platform), or `null`/empty when the variable is
 * unset. The first non-empty result is returned trimmed; `null` means no source
 * variable resolved, so the caller should keep its current chrome color.
 *
 * Pure and reader-injectable so the derivation is testable without a DOM.
 */
export function resolveChromeColor(
	readVar: (name: ChromeColorVar) => string | null | undefined,
): string | null {
	for (const name of CHROME_COLOR_VAR_PRIORITY) {
		const value = readVar(name)?.trim();
		if (value) return value;
	}
	return null;
}
