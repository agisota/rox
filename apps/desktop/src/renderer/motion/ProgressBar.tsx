import { motion } from "framer-motion";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

interface ProgressBarProps {
	className?: string;
}

/**
 * Indeterminate animated progress bar using scaleX sweep (case 109).
 * Gated on Full animation preference; renders a static partial bar otherwise.
 */
export function ProgressBar({ className }: ProgressBarProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	return (
		<div
			className={`relative h-1 w-full overflow-hidden rounded-full bg-muted ${className ?? ""}`}
		>
			{shouldAnimate ? (
				<motion.div
					className="absolute inset-0 bg-primary"
					style={{ transformOrigin: "left", willChange: "transform" }}
					animate={{ scaleX: [0.15, 0.65, 0.95] }}
					transition={{
						duration: motionDuration.slow,
						ease: ease.standard as [number, number, number, number],
						repeat: Infinity,
						repeatType: "reverse",
					}}
				/>
			) : (
				<div className="absolute inset-0 w-3/5 bg-primary" />
			)}
		</div>
	);
}
