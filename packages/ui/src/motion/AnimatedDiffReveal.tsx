import { motion } from "motion/react";
import type { ReactNode } from "react";
import { AnimatedHeight } from "./AnimatedHeight";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface AnimatedDiffRevealProps {
	children: ReactNode;
}

/**
 * Reveal wrapper for an expanded file-diff body (case 056 / PR-56). Composes the
 * PR-01 `AnimatedHeight` primitive (height `0 → auto` on mount) with an opacity
 * fade so the CodeMirror-based diff expands smoothly instead of hard-jumping in
 * when a Radix `CollapsibleContent` row opens.
 *
 * Decorative tier: when motion is disabled it returns the children unwrapped so
 * the diff appears instantly. Only the outer container is animated (height +
 * opacity) — no per-line / CodeMirror-row animation.
 */
export function AnimatedDiffReveal({ children }: AnimatedDiffRevealProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!shouldAnimate) {
		return <>{children}</>;
	}

	return (
		<AnimatedHeight>
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: motionDuration.fast, ease: ease.standard }}
			>
				{children}
			</motion.div>
		</AnimatedHeight>
	);
}
