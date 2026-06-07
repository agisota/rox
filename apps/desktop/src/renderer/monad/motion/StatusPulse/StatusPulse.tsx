import { motion } from "framer-motion";
import { useMotionPreference } from "../useMotionPreference";

export type StatusPulseStatus =
	| "idle"
	| "transition"
	| "verified"
	| "warn"
	| "error";

const STATUS_COLOR: Record<StatusPulseStatus, string> = {
	idle: "var(--monad-resting)",
	transition: "var(--monad-transition)",
	verified: "var(--monad-verified)",
	warn: "var(--monad-warn)",
	error: "var(--monad-error)",
};

export interface StatusPulseProps {
	status?: StatusPulseStatus;
	/** Emit the expanding halo. Defaults to true for non-idle statuses. */
	active?: boolean;
	/** Dot diameter in px. Defaults to 8. */
	size?: number;
	className?: string;
}

/**
 * A status dot with an optional pulsing halo (state-signal motion). The solid
 * dot is always visible (resting state), so under reduced motion only the
 * looping halo is dropped. The loop runs only while `active` and motion is
 * unreduced, so it idles off when not needed.
 *
 * Used for: offline badge (PR-11), streaming/live indicators, run status.
 */
export function StatusPulse({
	status = "idle",
	active,
	size = 8,
	className,
}: StatusPulseProps) {
	const { reduced } = useMotionPreference();
	const color = STATUS_COLOR[status];
	const shouldPulse = (active ?? status !== "idle") && !reduced;

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
			{shouldPulse && (
				<motion.span
					style={{
						position: "absolute",
						inset: 0,
						borderRadius: "9999px",
						background: color,
					}}
					initial={{ opacity: 0.45, scale: 1 }}
					animate={{ opacity: 0, scale: 2.4 }}
					transition={{
						duration: 1.6,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeOut",
					}}
				/>
			)}
			<span
				style={{
					position: "relative",
					width: size,
					height: size,
					borderRadius: "9999px",
					background: color,
					boxShadow: `0 0 ${size}px ${color}`,
				}}
			/>
		</span>
	);
}
