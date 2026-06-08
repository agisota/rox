"use client";

import { type HTMLMotionProps, motion, type Variants } from "motion/react";
import { durations } from "../springs";

const itemVariants: Variants = {
	hidden: { opacity: 0, y: 8 },
	show: { opacity: 1, y: 0, transition: { duration: durations.base } },
};

/**
 * A single staggered child. Place inside {@link Stagger}; it inherits the
 * parent's in-view trigger through Motion variants, so it needs no props of its
 * own.
 */
export function StaggerItem({ children, ...props }: HTMLMotionProps<"div">) {
	return (
		<motion.div variants={itemVariants} {...props}>
			{children}
		</motion.div>
	);
}
