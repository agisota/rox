import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Children, isValidElement, type ReactNode } from "react";
import { springs } from "../tokens";
import { useMotionPreference } from "../useMotionPreference";

const containerVariants: Variants = {
	show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants: Variants = {
	hidden: { opacity: 0, y: 8 },
	show: { opacity: 1, y: 0, transition: springs.soft },
	exit: { opacity: 0, y: -8, transition: { duration: 0.16 } },
};

export interface MotionListProps {
	/**
	 * Each child MUST be a keyed React element (e.g. `<Row key={id} />`).
	 * Identity — and therefore enter/exit/reflow — follows those keys. Raw
	 * string/number children are not list items and are intentionally skipped.
	 */
	children: ReactNode;
	className?: string;
	itemClassName?: string;
}

/**
 * A staggered, reflowing list. Children enter with a transform-only stagger,
 * reflow with `layout` when the set changes, and exit via `AnimatePresence`.
 * Under disabled motion every item is rendered at rest with no wrappers'
 * animation. Keep lists modest — do not wrap huge virtualized collections.
 *
 * Used for: chat message list (PR-06), changes list, presets.
 */
export function MotionList({
	children,
	className,
	itemClassName,
}: MotionListProps) {
	const { disabled } = useMotionPreference();
	const items = Children.toArray(children).filter(isValidElement);

	if (disabled) {
		return (
			<div className={className}>
				{items.map((child) => (
					<div key={child.key} className={itemClassName}>
						{child}
					</div>
				))}
			</div>
		);
	}

	return (
		<motion.div
			className={className}
			variants={containerVariants}
			initial="hidden"
			animate="show"
		>
			<AnimatePresence>
				{items.map((child) => (
					<motion.div
						key={child.key}
						className={itemClassName}
						variants={itemVariants}
						exit="exit"
						layout
					>
						{child}
					</motion.div>
				))}
			</AnimatePresence>
		</motion.div>
	);
}
