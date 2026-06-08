"use client";

import { type HTMLMotionProps, motion } from "motion/react";
import { springs } from "../springs";
import { useShouldAnimate } from "../useShouldAnimate";

export interface RevealProps extends HTMLMotionProps<"div"> {
	/** Slide distance in px before settling (default 8). */
	distance?: number;
	/** Delay before the reveal starts, in seconds. */
	delay?: number;
}

/**
 * Fade + slide a block into place the first time it scrolls into view. Honors
 * reduced motion: renders in its final position instantly when motion is off.
 */
export function Reveal({
	distance = 8,
	delay = 0,
	children,
	...props
}: RevealProps) {
	const shouldAnimate = useShouldAnimate();
	return (
		<motion.div
			initial={shouldAnimate ? { opacity: 0, y: distance } : false}
			whileInView={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
			viewport={{ once: true, margin: "-10% 0px" }}
			transition={shouldAnimate ? { ...springs.gentle, delay } : undefined}
			{...props}
		>
			{children}
		</motion.div>
	);
}
