import { motion } from "motion/react";
import { useShouldAnimate } from "./useMotionPreference";

const PARTICLES = Array.from({ length: 10 }, (_, i) => i);

/** One-shot radial particle burst celebrating a successful workspace run. */
export function RunCelebration({ play }: { play: boolean }) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!shouldAnimate || !play) return null;

	return (
		<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
			{PARTICLES.map((i) => {
				const angle = (i / PARTICLES.length) * Math.PI * 2;
				return (
					<motion.span
						key={i}
						className="absolute size-1 rounded-full bg-emerald-400"
						initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
						animate={{
							opacity: [0, 1, 0],
							x: Math.cos(angle) * 60,
							y: Math.sin(angle) * 60,
							scale: [0.4, 1, 0.6],
						}}
						transition={{ duration: 0.7, ease: "easeOut", delay: i * 0.012 }}
					/>
				);
			})}
		</div>
	);
}
