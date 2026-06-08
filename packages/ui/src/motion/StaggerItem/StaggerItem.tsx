"use client";

import { type HTMLMotionProps, motion, type Variants } from "motion/react";
import { durations } from "../springs";
import { useShouldAnimate } from "../useShouldAnimate";

function getItemVariants(shouldAnimate: boolean): Variants {
	if (!shouldAnimate) {
		return {
			hidden: { opacity: 1, y: 0 },
			show: { opacity: 1, y: 0, transition: { duration: 0 } },
		};
	}
	return {
		hidden: { opacity: 0, y: 8 },
		show: { opacity: 1, y: 0, transition: { duration: durations.base } },
	};
}

/**
 * A single staggered child. Place inside {@link Stagger}; it inherits the
 * parent's in-view trigger through Motion variants, so it needs no props of its
 * own. Honors reduced motion: renders in place with no transition when motion
 * is disabled.
 */
export function StaggerItem({ children, ...props }: HTMLMotionProps<"div">) {
	const shouldAnimate = useShouldAnimate();
	return (
		<motion.div variants={getItemVariants(shouldAnimate)} {...props}>
			{children}
		</motion.div>
	);
}
