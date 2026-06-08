"use client";

import { type HTMLMotionProps, motion } from "motion/react";
import { useShouldAnimate } from "../useShouldAnimate";

export interface StaggerProps extends HTMLMotionProps<"div"> {
	/** Seconds between each child's entrance (default 0.06). */
	gap?: number;
}

/**
 * Container that staggers the entrance of its {@link StaggerItem} children when
 * it scrolls into view. No-ops under reduced motion.
 */
export function Stagger({ gap = 0.06, children, ...props }: StaggerProps) {
	const shouldAnimate = useShouldAnimate();
	return (
		<motion.div
			initial={shouldAnimate ? "hidden" : false}
			whileInView={shouldAnimate ? "show" : undefined}
			viewport={{ once: true, margin: "-10% 0px" }}
			variants={{
				hidden: {},
				show: { transition: { staggerChildren: gap } },
			}}
			{...props}
		>
			{children}
		</motion.div>
	);
}
