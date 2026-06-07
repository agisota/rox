import { motion } from "framer-motion";
import { motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

interface DrawnCheckProps {
	className?: string;
	strokeWidth?: number;
}

/**
 * Animated check mark that stroke-draws itself on mount (essential tier).
 * Conveys connection success. Renders fully drawn instantly when motion is
 * disabled.
 */
export function DrawnCheck({ className, strokeWidth = 2.5 }: DrawnCheckProps) {
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
				initial={{
					pathLength: shouldAnimate ? 0 : 1,
					opacity: shouldAnimate ? 0 : 1,
				}}
				animate={{ pathLength: 1, opacity: 1 }}
				transition={
					shouldAnimate
						? {
								pathLength: { duration: motionDuration.base, ease: "easeOut" },
								opacity: { duration: motionDuration.fast },
							}
						: { duration: 0 }
				}
			/>
		</motion.svg>
	);
}
