import type { Transition } from "motion/react";

/**
 * "Motion Frame" spring + duration tokens — the cross-app shared motion
 * vocabulary consumed by the `@rox/ui/motion` primitives and (later) the
 * circuit diagram kit.
 *
 * Scope: intentionally small and diagram-oriented. The desktop app keeps its
 * own app-chrome motion tokens in `apps/desktop/src/renderer/motion/tokens.ts`;
 * this shared layer neither replaces nor migrates those.
 */

/** Reusable spring presets, keyed by intent. */
export const springs = {
	/** Canonical State-First snap (Series contract: stiffness 280 / damping 30). */
	snap: { type: "spring", stiffness: 280, damping: 30 },
	/** Gentle entrance for reveals. */
	gentle: { type: "spring", stiffness: 220, damping: 28 },
	/** Snappy pop for verified / target-reached pulses. */
	pop: { type: "spring", stiffness: 480, damping: 24 },
} satisfies Record<string, Transition>;

/** Tween durations, in seconds. */
export const durations = {
	fast: 0.18,
	base: 0.32,
	slow: 0.6,
} as const;
