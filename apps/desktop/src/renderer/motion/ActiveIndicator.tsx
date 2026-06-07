import { cn } from "@rox/ui/utils";
import { motion } from "framer-motion";
import { motionSpring } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface ActiveIndicatorProps {
	/**
	 * Shared layout id. Render this component for the currently-active item only;
	 * framer glides the single indicator between mount positions.
	 */
	layoutId: string;
	className?: string;
}

/**
 * Shared-`layoutId` active indicator (e.g. a tab underline or sidebar rail).
 * Glides between active items via framer's layout animation; renders a static
 * positioned element when motion is disabled.
 */
export function ActiveIndicator({ layoutId, className }: ActiveIndicatorProps) {
	const shouldAnimate = useShouldAnimate("essential");
	const baseClassName = cn("pointer-events-none absolute inset-0", className);

	if (!shouldAnimate) {
		return <span className={baseClassName} />;
	}

	return <motion.span layoutId={layoutId} className={baseClassName} transition={motionSpring.snappy} />;
}
