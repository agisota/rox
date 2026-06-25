import type { Transition, Variants } from "motion/react";

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

/**
 * Focus / Zen mode chrome density — case 056 / PR-56 (#649). Shell-level zen
 * collapses the side rails and dims the surrounding chrome so the canvas reads
 * as the sole focus. These are the shared geometry/opacity tokens every host
 * (desktop lead, web, mobile) animates toward; the on/off state itself lives in
 * the platform-neutral `@rox/shared/zen-mode` store.
 *
 * `chromeDim` is the opacity the non-canvas chrome (top bar, rails, status)
 * settles to while zen is active; `chromeRest` is its normal value. Drive a
 * `motion` element's `animate={{ opacity }}` between them, gated on
 * `useShouldAnimate('decorative')` — reduced-motion callers snap instantly by
 * setting the target without a transition.
 */
export const zenDensity = {
	/** Chrome opacity while zen mode is active. */
	chromeDim: 0.4,
	/** Chrome opacity at rest (zen inactive). */
	chromeRest: 1,
} as const;

/**
 * Shared collapse scene for the zen toggle — case 056 / PR-56 (#649). Reuses
 * the `panel` spring (the same geometry language as the sidebar collapse in
 * case 005) so the rail width morph and the chrome dim feel like one motion.
 * Decorative tier: gate call sites on `useShouldAnimate('decorative')` and pass
 * `false`/`undefined` for an instant reduced-motion fallback.
 */
export const zenSceneTransition: Transition = motionSpring.panel;

/**
 * View-transition panel scene tokens — case 054 / PR-54 (#648). A single,
 * platform-neutral geometry language for the right-panel open/close/replace
 * scenes consumed by F03/F30 (panel), F05 (region reflow) and F56 (zen). The
 * scene descriptor itself lives in `PanelScene.ts`; these tokens are the
 * concrete numbers each surface animates toward.
 *
 * `enterOffset`/`exitOffset` are the slide distance (px) the panel travels in
 * from / out to its trailing edge — used for the framer-motion `AnimatePresence`
 * fallback (web/desktop) and as the Reanimated slide-over translation (mobile).
 * `replaceFade` is the brief cross-dim a replaced panel dips to before the next
 * one settles. Reuses {@link motionSpring.panel} so the morph matches the
 * sidebar collapse / zen scene geometry.
 */
export const panelSceneMotion = {
	/** Slide distance (px) for the entering panel (from the trailing edge). */
	enterOffset: 24,
	/** Slide distance (px) for the exiting panel (toward the trailing edge). */
	exitOffset: 24,
	/** Opacity a replaced panel dips to mid-swap before the next settles. */
	replaceFade: 0.6,
	/** Spring driving the open/close/replace morph. */
	spring: motionSpring.panel,
} as const;

/** CSS `view-transition-name` namespace for the right-panel VT scenes (case 054). */
export const PANEL_SCENE_VT_NAME = "rox-panel-scene" as const;
