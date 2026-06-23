import { cn } from "@rox/ui/utils";
import { AnimatePresence, motion } from "motion/react";
import { motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

/**
 * Left-to-right sweep bar indicating active/in-progress state (e.g. terminal
 * connecting). Decorative tier — renders nothing when motion is disabled.
 * Overlay is `pointer-events-none` so it never intercepts clicks, DnD, or focus.
 */
export function SweepIndicator({
	active,
	className,
}: {
	active: boolean;
	className?: string;
}) {
	const shouldAnimate = useShouldAnimate("decorative");
	return (
		<AnimatePresence>
			{active && (
				<motion.div
					className={cn(
						"pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden",
						className,
					)}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
				>
					<motion.div
						className="h-full w-1/3 bg-primary/70"
						animate={shouldAnimate ? { x: ["-100%", "300%"] } : { x: "0%" }}
						transition={
							shouldAnimate
								? {
										duration: motionDuration.slow,
										ease: "easeInOut",
										repeat: Infinity,
									}
								: { duration: 0 }
						}
						style={{ willChange: "transform" }}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
