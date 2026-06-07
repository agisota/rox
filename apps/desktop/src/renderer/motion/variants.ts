import type { Transition, Variants } from "framer-motion";

import { ease, motionDuration } from "./tokens";

/**
 * Shared list-entrance variants (case 012 / PR-08). A parent container reveals
 * its children with a gentle top-level stagger; each item fades up into place.
 * Built from the case-001 motion tokens so timing stays consistent with the
 * rest of the shell. Reusable across list-stagger cases — call sites gate the
 * entrance behind `useShouldAnimate` and short-circuit `initial` to `false`
 * when motion is disabled.
 */
export const staggerContainer: Variants = {
	hidden: {},
	visible: {
		transition: {
			staggerChildren: 0.04,
			delayChildren: 0.02,
		},
	},
};

export const staggerItem: Variants = {
	hidden: { opacity: 0, y: 6 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: motionDuration.base, ease: ease.standard },
	},
};

/**
 * Port discovery badge entrance/exit (case 101).
 * Slide-in from left + fade + scale pop for newly-detected port cards.
 * Use with `AnimatePresence initial={false}` in the parent port group.
 * Essential tier — conveys presence of a newly forwarded port.
 */
export const portBadgeEnter: Variants = {
	initial: { opacity: 0, x: -8, scale: 0.96 },
	animate: { opacity: 1, x: 0, scale: 1 },
	exit: { opacity: 0, scale: 0.9, transition: { duration: motionDuration.fast } },
};

/** Spring for the port-number one-shot scale pop on badge mount (case 101). */
export const portNumberSpring: Transition = {
	type: "spring",
	stiffness: 520,
	damping: 26,
};

/** One-shot scale pulse `animate` target for the open-in-browser button on first appearance (case 101). */
export const openButtonPulse = { scale: [1, 1.18, 1] };
