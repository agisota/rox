import { cn } from "@rox/ui/utils";
import { motion } from "framer-motion";
import { useShouldAnimate } from "./useMotionPreference";

/**
 * Shared loading-skeleton primitive (case 014 / standard shimmer).
 *
 * Replaces the CSS `animate-pulse` of the base `@rox/ui` `Skeleton` with a
 * framer-motion gradient sweep (transform + opacity only, GPU-friendly). Being
 * decorative, it gates on `useShouldAnimate('decorative')` and falls back to the
 * exact static `@rox/ui` Skeleton look when motion is suppressed (reduced-motion
 * or `'off'`/`'essential'` preference).
 */
export function AnimatedSkeleton({ className, ...props }: React.ComponentProps<"div">) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!shouldAnimate) {
		// Mirror the canonical static @rox/ui Skeleton as the reduced-motion fallback.
		return (
			<div
				data-slot="skeleton"
				className={cn("bg-accent animate-pulse rounded-md", className)}
				{...props}
			/>
		);
	}

	return (
		<div
			data-slot="skeleton"
			className={cn("relative overflow-hidden bg-accent rounded-md", className)}
			{...props}
		>
			<motion.div
				aria-hidden
				className="absolute inset-0 will-change-transform"
				style={{
					background:
						"linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 8%, transparent), transparent)",
				}}
				initial={{ x: "-100%" }}
				animate={{ x: "100%" }}
				transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
			/>
		</div>
	);
}
