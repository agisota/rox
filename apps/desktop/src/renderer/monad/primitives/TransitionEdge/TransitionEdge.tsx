import { motion } from "framer-motion";
import { ease } from "../../motion/tokens";
import { useMotionPreference } from "../../motion/useMotionPreference";

export interface TransitionEdgeProps {
	/** Animate a signal travelling along the edge. */
	active?: boolean;
	/** Pixel length of the edge. Defaults to 96. */
	length?: number;
	/** Colour token. Defaults to the orange transition colour. */
	color?: string;
	className?: string;
}

/**
 * A directed edge between two StateNodes. The line draws in on mount; while
 * `active`, an orange signal particle travels along it (S0 → T → S*). Under
 * reduced motion the edge is drawn at rest with no travelling particle.
 *
 * Lands on: tab-bar progression, run pipeline.
 */
export function TransitionEdge({
	active = false,
	length = 96,
	color = "var(--monad-transition)",
	className,
}: TransitionEdgeProps) {
	const { reduced } = useMotionPreference();
	const height = 16;
	const midY = height / 2;
	const endX = length - 6;

	return (
		<svg
			className={className}
			width={length}
			height={height}
			viewBox={`0 0 ${length} ${height}`}
			fill="none"
			aria-hidden
		>
			<title>transition edge</title>
			<motion.line
				x1={2}
				y1={midY}
				x2={endX}
				y2={midY}
				stroke={color}
				strokeWidth={1.5}
				strokeLinecap="round"
				initial={reduced ? false : { pathLength: 0, opacity: 0.4 }}
				animate={{ pathLength: 1, opacity: 1 }}
				transition={{ duration: 0.5, ease: ease.entrance }}
			/>
			<path
				d={`M${endX - 5},${midY - 4} L${endX},${midY} L${endX - 5},${midY + 4}`}
				stroke={color}
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>
			{active && !reduced && (
				<motion.circle
					cy={midY}
					r={3}
					fill={color}
					initial={{ cx: 4 }}
					animate={{ cx: endX }}
					transition={{
						duration: 1.1,
						ease: "easeInOut",
						repeat: Number.POSITIVE_INFINITY,
						repeatDelay: 0.3,
					}}
					style={{ filter: `drop-shadow(0 0 4px ${color})` }}
				/>
			)}
		</svg>
	);
}
