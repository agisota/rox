import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { springs } from "../../motion/tokens";
import { useMotionPreference } from "../../motion/useMotionPreference";
import { type MonadStatus, statusColor } from "../status";

export interface StateNodeProps {
	/** State label, e.g. "S0", "S*", "running". */
	label: ReactNode;
	status?: MonadStatus;
	/** Emphasize as the currently-active state (glow ring). */
	active?: boolean;
	className?: string;
}

/**
 * A node in a state machine — a labelled capsule coloured by its semantic
 * status, with a status dot. The active node gets a soft glow. Entrance is
 * transform-only; under reduced/disabled motion it renders at rest.
 *
 * Lands on: tab-bar progression, run-button states, pipeline nodes.
 */
export function StateNode({
	label,
	status = "resting",
	active = false,
	className,
}: StateNodeProps) {
	const { disabled } = useMotionPreference();
	const color = statusColor[status];

	return (
		<motion.div
			className={className}
			initial={disabled ? false : { opacity: 0, scale: 0.92 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={springs.soft}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 8,
				padding: "6px 12px",
				borderRadius: "var(--monad-radius-md)",
				border: `1px solid ${color}`,
				background: "var(--monad-surface)",
				color: "var(--monad-text)",
				fontFamily: "var(--monad-font)",
				fontSize: 13,
				lineHeight: 1.2,
				boxShadow: active ? `0 0 18px ${color}` : "none",
			}}
		>
			<span
				aria-hidden
				style={{
					width: 7,
					height: 7,
					borderRadius: "9999px",
					background: color,
					boxShadow: `0 0 8px ${color}`,
				}}
			/>
			{label}
		</motion.div>
	);
}
