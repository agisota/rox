import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { springs } from "../../motion/tokens";
import { useMotionPreference } from "../../motion/useMotionPreference";
import { statusColor } from "../status";

export interface CapsulePrerequisite {
	id: string;
	label: ReactNode;
	satisfied?: boolean;
}

export interface MonadCapsuleProps {
	label?: ReactNode;
	prerequisites?: CapsulePrerequisite[];
	children?: ReactNode;
	className?: string;
}

/**
 * A capsule that gathers the context / prerequisites a transition depends on.
 * Each prerequisite shows a status dot (green when satisfied). Prerequisites
 * enter with a transform-only stagger; reduced/disabled motion renders them at
 * rest.
 *
 * Lands on: tool-call context (ToolCallBlock, PR-07).
 */
export function MonadCapsule({
	label,
	prerequisites = [],
	children,
	className,
}: MonadCapsuleProps) {
	const { disabled } = useMotionPreference();

	return (
		<div
			className={className}
			style={{
				display: "inline-flex",
				flexDirection: "column",
				gap: 8,
				padding: 12,
				borderRadius: "var(--monad-radius-lg)",
				border: "1px solid var(--monad-border)",
				background: "var(--monad-surface)",
				fontFamily: "var(--monad-font)",
				color: "var(--monad-text)",
			}}
		>
			{label != null && (
				<span
					style={{
						fontSize: 11,
						letterSpacing: "0.06em",
						textTransform: "uppercase",
						color: "var(--monad-text-muted)",
					}}
				>
					{label}
				</span>
			)}
			{prerequisites.length > 0 && (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
					{prerequisites.map((prerequisite, index) => {
						const color = prerequisite.satisfied
							? statusColor.verified
							: statusColor.resting;
						return (
							<motion.span
								key={prerequisite.id}
								initial={disabled ? false : { opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									...springs.soft,
									delay: disabled ? 0 : index * 0.05,
								}}
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "3px 8px",
									borderRadius: "9999px",
									border: `1px solid ${color}`,
									fontSize: 12,
								}}
							>
								<span
									aria-hidden
									style={{
										width: 6,
										height: 6,
										borderRadius: "9999px",
										background: color,
									}}
								/>
								{prerequisite.label}
							</motion.span>
						);
					})}
				</div>
			)}
			{children}
		</div>
	);
}
