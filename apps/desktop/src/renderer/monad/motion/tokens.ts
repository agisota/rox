import type { Transition } from "framer-motion";

/**
 * MONAD spring vocabulary. Every motion in the system resolves to one of these
 * four springs so timing stays coherent across surfaces. Prefer these over
 * ad-hoc transition objects at call sites.
 */
export const springs = {
	/** Default UI spring — settles calmly, minimal overshoot. */
	soft: { type: "spring", stiffness: 210, damping: 30, mass: 0.9 },
	/** Fast and decisive — presses, toggles, active-indicator snaps. */
	snap: { type: "spring", stiffness: 520, damping: 36, mass: 0.8 },
	/** Slow and buoyant — large surfaces, hero entrances, drifting nodes. */
	loose: { type: "spring", stiffness: 120, damping: 22, mass: 1.1 },
	/** The transition edge — emphatic state change (S0 → T → S*). */
	signal: { type: "spring", stiffness: 360, damping: 24, mass: 0.7 },
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof springs;

/** Cubic-bezier eases for tween-based (non-spring) motion. */
export const ease = {
	standard: [0.4, 0, 0.2, 1] as [number, number, number, number],
	entrance: [0.16, 1, 0.3, 1] as [number, number, number, number],
	exit: [0.4, 0, 1, 1] as [number, number, number, number],
} as const;

export type EaseName = keyof typeof ease;

/** Tween durations in seconds. */
export const duration = {
	fast: 0.14,
	base: 0.22,
	slow: 0.36,
} as const;

export type DurationName = keyof typeof duration;

/** Zero-duration transition for reduced/disabled motion: jump straight to rest. */
export const instant = { duration: 0 } as const satisfies Transition;
