import type { ReactNode } from "react";
import { AnimatedNumber } from "../../motion/AnimatedNumber";
import { StateNode } from "../StateNode";
import { statusColor } from "../status";

export interface DeltaFieldProps {
	from?: ReactNode;
	to?: ReactNode;
	additions?: number;
	deletions?: number;
	className?: string;
}

/**
 * The S0 → S* delta header: a source and target StateNode bridged by a delta
 * marker, with animated addition (green) and deletion (red) counts. Composes
 * StateNode + AnimatedNumber, so it inherits their reduced-motion behaviour.
 *
 * Lands on: diff header (DiffPane, PR-08).
 */
export function DeltaField({
	from = "S0",
	to = "S*",
	additions = 0,
	deletions = 0,
	className,
}: DeltaFieldProps) {
	return (
		<div
			className={className}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 12,
				fontFamily: "var(--monad-font)",
			}}
		>
			<StateNode label={from} status="resting" />
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 8,
					fontSize: 12,
					color: "var(--monad-text-muted)",
				}}
			>
				<span aria-hidden>Δ</span>
				<span style={{ color: statusColor.verified }}>
					+<AnimatedNumber value={additions} />
				</span>
				<span style={{ color: statusColor.error }}>
					−<AnimatedNumber value={deletions} />
				</span>
			</span>
			<StateNode label={to} status="verified" active />
		</div>
	);
}
