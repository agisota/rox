import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { springs } from "../../motion/tokens";
import { useMotionPreference } from "../../motion/useMotionPreference";
import { statusColor } from "../status";

export interface TargetAttractorProps {
	/** Goal reached / verified — centre turns green and settles. */
	reached?: boolean;
	size?: number;
	label?: ReactNode;
	className?: string;
}

/**
 * A target with concentric rings. Until `reached`, an attractor ring contracts
 * toward the centre on a loop; once reached, the centre settles green
 * (verified). Under reduced motion the loop is dropped and the resting target
 * stays visible.
 *
 * Lands on: empty-state goal, run "done"/verified (PR-05, PR-12).
 */
export function TargetAttractor({
	reached = false,
	size = 56,
	label,
	className,
}: TargetAttractorProps) {
	const { reduced } = useMotionPreference();
	const color = reached ? statusColor.verified : statusColor.transition;
	const center = size / 2;

	return (
		<span
			className={className}
			style={{
				display: "inline-flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 6,
				fontFamily: "var(--monad-font)",
			}}
		>
			<svg
				width={size}
				height={size}
				viewBox={`0 0 ${size} ${size}`}
				fill="none"
				aria-hidden
			>
				<title>target</title>
				<circle
					cx={center}
					cy={center}
					r={size * 0.42}
					stroke={color}
					strokeOpacity={0.3}
					strokeWidth={1}
				/>
				<circle
					cx={center}
					cy={center}
					r={size * 0.28}
					stroke={color}
					strokeOpacity={0.5}
					strokeWidth={1}
				/>
				{!reduced && !reached && (
					<motion.circle
						cx={center}
						cy={center}
						stroke={color}
						strokeWidth={1.5}
						initial={{ r: size * 0.42, opacity: 0.5 }}
						animate={{ r: size * 0.12, opacity: 0 }}
						transition={{
							duration: 1.6,
							ease: "easeOut",
							repeat: Number.POSITIVE_INFINITY,
						}}
					/>
				)}
				<motion.circle
					cx={center}
					cy={center}
					fill={color}
					animate={{ r: reached ? size * 0.16 : size * 0.1 }}
					transition={springs.snap}
					style={{ filter: `drop-shadow(0 0 6px ${color})` }}
				/>
			</svg>
			{label != null && (
				<span style={{ fontSize: 12, color: "var(--monad-text-muted)" }}>
					{label}
				</span>
			)}
		</span>
	);
}
