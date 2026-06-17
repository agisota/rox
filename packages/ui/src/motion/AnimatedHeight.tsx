import { cn } from "@rox/ui/utils";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface AnimatedHeightProps {
	children: ReactNode;
	className?: string;
	/**
	 * Whether the content is expanded. Animates height `auto ↔ 0` with an
	 * opacity collapse. Defaults to `true` (mount reveal).
	 */
	open?: boolean;
}

/**
 * Animates its content's height between `auto` and `0` (with an opacity
 * collapse). Snaps to the final state instantly when motion is disabled.
 */
export function AnimatedHeight({
	children,
	className,
	open = true,
}: AnimatedHeightProps) {
	const shouldAnimate = useShouldAnimate("essential");

	if (!shouldAnimate) {
		if (!open) {
			return null;
		}
		return <div className={className}>{children}</div>;
	}

	return (
		<motion.div
			className={cn("overflow-hidden", className)}
			initial={false}
			animate={
				open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }
			}
			transition={{ duration: motionDuration.base }}
		>
			{children}
		</motion.div>
	);
}
