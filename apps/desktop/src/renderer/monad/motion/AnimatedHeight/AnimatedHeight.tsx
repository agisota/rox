import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { instant, springs } from "../tokens";
import { useMotionPreference } from "../useMotionPreference";

export interface AnimatedHeightProps {
	/** When false, collapses to height 0. Defaults to true. */
	open?: boolean;
	children: ReactNode;
	className?: string;
}

/**
 * Animates a region open/closed using Framer's native `height: auto`
 * measurement — no manual ResizeObserver, no first-paint flash (`initial`
 * is `false`, so the resting state is shown immediately). Content size
 * changes while open reflow instantly; only the open/close toggle animates.
 *
 * Used for: changes-tree folders (PR-10), presets bar (PR-12), diff sections.
 */
export function AnimatedHeight({
	open = true,
	children,
	className,
}: AnimatedHeightProps) {
	const { disabled } = useMotionPreference();

	return (
		<motion.div
			className={className}
			style={{ overflow: "hidden" }}
			initial={false}
			animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
			transition={disabled ? instant : springs.soft}
		>
			{children}
		</motion.div>
	);
}
