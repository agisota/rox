import { cn } from "@rox/ui/utils";
import { motion } from "motion/react";
import { useShouldAnimate } from "./useMotionPreference";

export interface SpinnerRingProps {
	className?: string;
	/**
	 * When `false`, render a static partial ring with no infinite rotate.
	 * Defaults to `true`.
	 */
	active?: boolean;
}

/**
 * Presentational progress/spinner ring. An SVG circle with a ~25% gap that
 * rotates infinitely while in-flight. Stroke uses `currentColor` so it inherits
 * the surrounding text color. Self-gates on the `decorative` tier and renders a
 * static partial ring when motion is suppressed or `active` is `false`.
 */
export function SpinnerRing({ className, active = true }: SpinnerRingProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	const spinning = shouldAnimate && active;

	return (
		<motion.svg
			viewBox="0 0 16 16"
			fill="none"
			className={cn("pointer-events-none", className)}
			aria-hidden="true"
			animate={spinning ? { rotate: 360 } : false}
			transition={
				spinning
					? { repeat: Infinity, ease: "linear", duration: 0.8 }
					: undefined
			}
		>
			<circle
				cx="8"
				cy="8"
				r="6"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray="28 10"
				opacity="0.7"
			/>
		</motion.svg>
	);
}
