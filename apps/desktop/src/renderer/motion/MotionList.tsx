import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import type { ReactNode } from "react";
import { useShouldAnimate } from "./useMotionPreference";

/** Stagger container variants — orchestrates child entrance. */
export const listContainerVariants: Variants = {
	hidden: {},
	visible: {
		transition: { staggerChildren: 0.04 },
	},
};

/** Stagger item variants — opacity + y entrance for each child. */
export const listItemVariants: Variants = {
	hidden: { opacity: 0, y: 8 },
	visible: { opacity: 1, y: 0 },
};

export interface MotionListProps {
	children: ReactNode;
	className?: string;
}

/**
 * Stagger container. Renders a plain `<div>` when motion is disabled so the
 * list appears instantly in its final state.
 */
export function MotionList({ children, className }: MotionListProps) {
	const shouldAnimate = useShouldAnimate("essential");

	if (!shouldAnimate) {
		return <div className={className}>{children}</div>;
	}

	return (
		<motion.div
			className={className}
			variants={listContainerVariants}
			initial="hidden"
			animate="visible"
		>
			{children}
		</motion.div>
	);
}

export interface MotionListItemProps {
	children: ReactNode;
	className?: string;
}

/**
 * Stagger item. Pair with {@link MotionList}. Falls back to a plain `<div>`
 * when motion is disabled.
 */
export function MotionListItem({ children, className }: MotionListItemProps) {
	const shouldAnimate = useShouldAnimate("essential");

	if (!shouldAnimate) {
		return <div className={className}>{children}</div>;
	}

	return (
		<motion.div className={className} variants={listItemVariants}>
			{children}
		</motion.div>
	);
}
