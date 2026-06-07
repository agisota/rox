import { cn } from "@rox/ui/utils";
import { motion } from "framer-motion";
import { AnimatedSkeleton } from "./AnimatedSkeleton";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

/**
 * Reusable shimmer skeleton bar — case 076.
 * Thin convenience wrapper over AnimatedSkeleton with an explicit export name.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return <AnimatedSkeleton className={cn("rounded-sm", className)} {...props} />;
}

const DIFF_ROW_WIDTHS = ["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5", "w-7/12"] as const;

/**
 * DiffSkeleton — composite placeholder mimicking the diff file-list layout:
 * one wider header bar followed by ~6 staggered code-row bars of varying widths.
 *
 * Reduced-motion: AnimatedSkeleton suppresses its shimmer loop; the stagger
 * entrance is also skipped so all bars appear instantly.
 */
export function DiffSkeleton({ className }: { className?: string }) {
	const shouldAnimate = useShouldAnimate("decorative");

	return (
		<div className={cn("flex h-full w-full flex-col gap-2 p-3", className)}>
			{/* File header bar */}
			<AnimatedSkeleton className="h-6 w-full" />
			{/* Code-row placeholders */}
			{DIFF_ROW_WIDTHS.map((w, i) =>
				shouldAnimate ? (
					<motion.div
						key={i}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{
							duration: motionDuration.base,
							ease: ease.standard,
							delay: i * 0.05,
						}}
					>
						<AnimatedSkeleton className={cn("h-4", w)} />
					</motion.div>
				) : (
					<AnimatedSkeleton key={i} className={cn("h-4", w)} />
				),
			)}
		</div>
	);
}
