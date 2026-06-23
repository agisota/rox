import { motion } from "motion/react";
import { motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

interface DrawCheckProps {
	checked: boolean;
	className?: string;
	strokeWidth?: number;
}

/**
 * Stroke-draw checkmark that animates `pathLength` when `checked` toggles at
 * runtime — distinct from DrawnCheck (which draws once on mount). Used by the
 * diff-header "Viewed" control (case 078, essential tier) so the check appears
 * to draw itself when a file is marked viewed. Renders the final state instantly
 * when motion is disabled.
 */
export function DrawCheck({
	checked,
	className,
	strokeWidth = 2.5,
}: DrawCheckProps) {
	const shouldAnimate = useShouldAnimate("essential");
	return (
		<motion.svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<motion.path
				d="M5 13l4 4L19 7"
				initial={{ pathLength: 0 }}
				animate={{ pathLength: checked ? 1 : 0 }}
				transition={
					shouldAnimate
						? { pathLength: { duration: motionDuration.fast, ease: "easeOut" } }
						: { duration: 0 }
				}
			/>
		</motion.svg>
	);
}
