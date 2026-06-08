"use client";

import { motion } from "motion/react";
import { useShouldAnimate } from "../useShouldAnimate";

export interface SignalTravelProps {
	/** SVG path `d` the signal travels along. */
	path: string;
	/** Radius of the signal dot (default 5). */
	radius?: number;
	/** Fill color (defaults to `currentColor`). */
	color?: string;
	/** Seconds for one traversal (default 2). */
	duration?: number;
	className?: string;
}

/**
 * A pulse that travels along an SVG path — the State-First "signal moving from
 * S₀ to S\*" mechanic. Render inside an `<svg>`. Uses CSS `offset-path`; under
 * reduced motion it rests at the path end instead of looping.
 *
 * Note: `offset-path` needs a reasonably modern browser (Chrome/Edge ≥ 79,
 * Safari ≥ 16). Minimum browser support is an open decision in the plan.
 */
export function SignalTravel({
	path,
	radius = 5,
	color = "currentColor",
	duration = 2,
	className,
}: SignalTravelProps) {
	const shouldAnimate = useShouldAnimate();
	return (
		<motion.circle
			r={radius}
			fill={color}
			className={className}
			style={{ offsetPath: `path("${path}")` }}
			initial={{ offsetDistance: "0%", opacity: 0 }}
			animate={
				shouldAnimate
					? { offsetDistance: "100%", opacity: [0, 1, 1, 0] }
					: { offsetDistance: "100%", opacity: 0 }
			}
			transition={
				shouldAnimate
					? {
							duration,
							ease: "easeInOut",
							repeat: Number.POSITIVE_INFINITY,
							repeatDelay: 0.6,
						}
					: { duration: 0 }
			}
		/>
	);
}
