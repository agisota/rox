import type { Transition, Variants } from "framer-motion";

/**
 * Motion design tokens for the Rox desktop app.
 *
 * Append-only, cross-area serialization lane: later cases add presets here
 * (e.g. `motionSpring.panel`, `shellBootVariants`, `motionShake`). Never remove
 * or repurpose an existing token.
 */

/** Tween durations, in seconds. */
export const motionDuration = {
	fast: 0.12,
	base: 0.2,
	slow: 0.32,
} as const;

/** Reusable spring presets. */
export const motionSpring = {
	soft: { type: "spring", stiffness: 320, damping: 32 },
	snappy: { type: "spring", stiffness: 520, damping: 36 },
	/** Panel geometry (sidebar open/collapse/double-click) — case 005 / PR-05. */
	panel: { type: "spring", stiffness: 300, damping: 32 },
	/** Scale-pop for toggled glyphs (favorite/pin star) — case 022 / PR-22. */
	pop: { type: "spring", stiffness: 520, damping: 24 },
	/**
	 * Sidebar collapse/expand morph (width 52↔280px + label crossfade) — case
	 * 025 / PR-25. Tuned a touch snappier than `panel` so the icon-rail labels
	 * settle quickly without overshooting the contracting width.
	 */
	sidebarCollapse: { type: "spring", stiffness: 360, damping: 34 },
	/** Smooth list re-sort / position layout shifts — case 022 / PR-22. */
	layout: { type: "spring", stiffness: 360, damping: 34 },
	/** Gentle reveal for sticky footer bands (approval/question overlays) — case 074. */
	gentle: { type: "spring", stiffness: 280, damping: 26 },
	/** Scale-pop for tab badge count changes (review/changes tab badges) — case 086. */
	badge: { type: "spring", stiffness: 520, damping: 24 },
	/** Bouncy spring-in for error/empty state cards — case 106. */
	bouncy: { type: "spring", stiffness: 500, damping: 24 },
} satisfies Record<string, Transition>;

/** Cubic-bezier easing curves. */
export const ease = {
	standard: [0.2, 0, 0, 1],
	emphasized: [0.3, 0, 0, 1],
} as const;

/**
 * First-mount entrance for the dashboard shell (case 002 / PR-02). A parent
 * `container` staggers its children; the shell's top-bar/content `column` fades
 * up while the `sidebar` fades in from the left. Decorative tier — call sites
 * gate on `useShouldAnimate('decorative')`. Cases 003/005/025 build on this
 * rather than re-deriving the entrance.
 */
export const shellBootVariants = {
	container: {
		hidden: {},
		show: {
			transition: {
				staggerChildren: motionDuration.fast,
				delayChildren: 0.02,
			},
		},
	},
	column: {
		hidden: { opacity: 0, y: 6 },
		show: {
			opacity: 1,
			y: 0,
			transition: { duration: motionDuration.base, ease: ease.standard },
		},
	},
	sidebar: {
		hidden: { opacity: 0, x: -8 },
		show: {
			opacity: 1,
			x: 0,
			transition: { duration: motionDuration.base, ease: ease.standard },
		},
	},
} satisfies Record<string, Variants>;

/**
 * Error shake for form submission failures — case 069. Apply as `variants` on
 * a `motion.form` / `motion.div` and toggle `animate` between "rest" and
 * "shake". Essential tier — conveys a meaningful error state.
 */
export const shakeVariants: Variants = {
	rest: { x: 0 },
	shake: { x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.4 } },
};

/**
 * One-shot shake animation for error signals (terminal exit errors, run
 * failures) — case 098. Pass directly to `controls.start(motionShake)`.
 * Transform only; decorative tier.
 */
export const motionShake = {
	x: [0, -4, 4, -3, 3, -1, 0],
	transition: { duration: 0.4, ease: ease.standard },
};
