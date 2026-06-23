import { animate } from "motion/react";
import { motionDuration } from "./tokens";
import { shouldAnimate } from "./useMotionPreference";

/**
 * Color formats framer-motion's color mixer can interpolate between when both
 * endpoints share the format. Theme palettes mix oklch (light) and hex/rgba
 * (dark fallbacks), so cross-format pairs are hard-set instead of tweened.
 */
function colorFormat(value: string): string | null {
	const v = value.trim().toLowerCase();
	if (v.startsWith("#")) return "hex";
	if (v.startsWith("rgb")) return "rgb";
	if (v.startsWith("hsl")) return "hsl";
	if (v.startsWith("oklch")) return "oklch";
	return null;
}

/** Whether a from→to pair can be cleanly tweened by framer-motion. */
function isMixable(from: string, to: string): boolean {
	const f = colorFormat(from);
	return f !== null && f === colorFormat(to);
}

/**
 * Host-supplied theme integration. The kit owns the generic CSS-variable tween;
 * the app owns its palette shape, so it injects the palette→CSS-var map and a
 * hard-set applier. This keeps `@rox/ui` free of any app theme module.
 */
export interface AnimateThemeChangeOptions<C> {
	/** Maps each present palette key to the CSS custom property it drives. */
	colorToCssVar: { [K in keyof C]?: string };
	/** Hard-sets every palette color at once (the no-animation path). */
	applyColors: (colors: C) => void;
}

/**
 * Animate a theme switch by tweening the root element's CSS custom properties
 * with framer-motion's imperative `animate()`.
 *
 * Driven from the host's theme apply path (plain state, not a React render) — so
 * this uses the NON-hook {@link shouldAnimate} accessor rather than
 * `useShouldAnimate`. Theme color is a decorative transition: under reduced
 * motion (or `'off'`/`'essential'`) and on first paint (`prevColors === null`)
 * it hard-sets the next colors once, with no flash and no animation.
 *
 * `C` is the host's palette type (each value a CSS color string, optionally
 * absent); the host supplies its key→var map and applier via
 * {@link AnimateThemeChangeOptions}.
 *
 * Only the document-root UI variables are touched here; xterm/CodeMirror/terminal
 * theming is applied elsewhere and is intentionally left as a hard cut.
 */
export function animateThemeChange<C extends Partial<Record<keyof C, string>>>(
	prevColors: C | null,
	nextColors: C,
	options: AnimateThemeChangeOptions<C>,
): void {
	const { colorToCssVar, applyColors } = options;

	// No previous palette (first paint / hydration) or motion disabled → hard set.
	if (prevColors === null || !shouldAnimate("decorative")) {
		applyColors(nextColors);
		return;
	}

	const root = document.documentElement;

	// Seed the start of the tween from the previously-applied palette.
	applyColors(prevColors);

	const target: Record<string, string> = {};

	for (const key of Object.keys(colorToCssVar) as Array<keyof C>) {
		const cssVar = colorToCssVar[key];
		// Map coverage need not be exhaustive — skip any unmapped key.
		if (!cssVar) continue;
		const from = prevColors[key];
		const to = nextColors[key];

		// Unchanged or missing endpoint → nothing to do.
		if (!to || from === to) {
			if (to) root.style.setProperty(cssVar, to);
			continue;
		}

		if (from && isMixable(from, to)) {
			target[cssVar] = to;
		} else {
			// Not cleanly mixable (e.g. hex↔oklch) → hard set this single var
			// rather than poisoning the whole batch.
			root.style.setProperty(cssVar, to);
		}
	}

	if (Object.keys(target).length === 0) {
		return;
	}

	try {
		animate(root, target, {
			duration: motionDuration.base,
			ease: "easeOut",
		});
	} catch {
		// Defensive: if the mixer rejects a pair at runtime, fall back to a hard
		// set of the remaining animated vars so the theme still fully applies.
		applyColors(nextColors);
	}
}
