import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { springs } from "../../motion/tokens";
import { useMotionPreference } from "../../motion/useMotionPreference";
import { statusColor } from "../status";

export type ValidatorState = "pending" | "validating" | "passed" | "failed";

const STATE_COLOR: Record<ValidatorState, string> = {
	pending: statusColor.resting,
	validating: statusColor.transition,
	passed: statusColor.verified,
	failed: statusColor.warn,
};

const STATE_GLYPH: Record<ValidatorState, string> = {
	pending: "·",
	validating: "◇",
	passed: "✓",
	failed: "✕",
};

export interface ValidatorGateProps {
	state?: ValidatorState;
	label?: ReactNode;
	className?: string;
}

/**
 * A validation gate that signals pending → validating → passed (green) /
 * failed (amber). The centre glyph swaps via AnimatePresence; under reduced
 * motion it changes instantly (resting state stays visible).
 *
 * Lands on: diff review, pending-approval cards (PR-08).
 */
export function ValidatorGate({
	state = "pending",
	label,
	className,
}: ValidatorGateProps) {
	const { reduced } = useMotionPreference();
	const color = STATE_COLOR[state];

	return (
		<span
			className={className}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 8,
				fontFamily: "var(--monad-font)",
				color: "var(--monad-text)",
			}}
		>
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					width: 28,
					height: 24,
					border: `1px solid ${color}`,
					borderRadius: 6,
				}}
			>
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.span
						key={state}
						initial={reduced ? false : { opacity: 0, scale: 0.6 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
						transition={springs.snap}
						style={{ color, fontSize: 13, lineHeight: 1 }}
					>
						{STATE_GLYPH[state]}
					</motion.span>
				</AnimatePresence>
			</span>
			{label != null && (
				<span style={{ fontSize: 12, color: "var(--monad-text-muted)" }}>
					{label}
				</span>
			)}
		</span>
	);
}
