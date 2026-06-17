import { motion } from "motion/react";
import { motionDuration, motionSpring } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface CompletionBurstProps {
	/** Size of the dot/check in pixels. Defaults to 8 (matches status dot size-2). */
	size?: number;
	className?: string;
	/** Called when the burst animation completes. */
	onAnimationComplete?: () => void;
}

/**
 * One-shot celebratory burst for agent completion (status → "review").
 * Renders a scale+opacity pop of a green dot plus a brief expanding ring.
 * Decorative tier — renders a static green dot when reduced motion is on.
 */
export function CompletionBurst({
	size = 8,
	className,
	onAnimationComplete,
}: CompletionBurstProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!shouldAnimate) {
		return (
			<span
				className={className}
				style={{
					display: "inline-block",
					width: size,
					height: size,
					borderRadius: "50%",
					backgroundColor: "rgb(34 197 94)",
				}}
			/>
		);
	}

	return (
		<span
			className={className}
			style={{
				position: "relative",
				display: "inline-flex",
				width: size,
				height: size,
			}}
		>
			{/* Expanding ring */}
			<motion.span
				style={{
					position: "absolute",
					inset: 0,
					borderRadius: "50%",
					backgroundColor: "rgb(34 197 94)",
				}}
				initial={{ scale: 1, opacity: 0.6 }}
				animate={{ scale: 2.4, opacity: 0 }}
				transition={{
					duration: motionDuration.slow,
					ease: "easeOut",
				}}
			/>
			{/* Dot pop */}
			<motion.span
				style={{
					position: "relative",
					display: "inline-block",
					width: size,
					height: size,
					borderRadius: "50%",
					backgroundColor: "rgb(34 197 94)",
				}}
				initial={{ scale: 0.5, opacity: 0 }}
				animate={{ scale: [0.5, 1.3, 1], opacity: [0, 1, 1] }}
				transition={{
					duration: motionDuration.base,
					...motionSpring.snappy,
				}}
				onAnimationComplete={onAnimationComplete}
			/>
		</span>
	);
}
