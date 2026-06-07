import { motion } from "framer-motion";
import { useMotionPreference } from "../../motion/useMotionPreference";

export interface EventParticleProps {
	/** SVG path the particle follows (CSS `offset-path`). */
	path?: string;
	/** Run the loop. Defaults to true. */
	active?: boolean;
	size?: number;
	color?: string;
	/** Seconds per traversal. Defaults to 1.6. */
	duration?: number;
	className?: string;
}

/**
 * A single event travelling along a motion path (CSS `offset-path`). Loops
 * while `active` and motion is unreduced; otherwise it rests at the path
 * origin so the resting state stays visible. Idles off when not needed.
 *
 * Lands on: event flow between runtime frames, trace transport.
 */
export function EventParticle({
	path = "path('M 0 4 L 96 4')",
	active = true,
	size = 6,
	color = "var(--monad-transition)",
	duration = 1.6,
	className,
}: EventParticleProps) {
	const { reduced } = useMotionPreference();
	const animate = active && !reduced;

	return (
		<motion.span
			className={className}
			aria-hidden
			style={{
				display: "block",
				width: size,
				height: size,
				borderRadius: "9999px",
				background: color,
				boxShadow: `0 0 6px ${color}`,
				offsetPath: path,
				offsetDistance: "0%",
			}}
			animate={{ offsetDistance: animate ? "100%" : "0%" }}
			transition={
				animate
					? { duration, ease: "linear", repeat: Number.POSITIVE_INFINITY }
					: { duration: 0 }
			}
		/>
	);
}
