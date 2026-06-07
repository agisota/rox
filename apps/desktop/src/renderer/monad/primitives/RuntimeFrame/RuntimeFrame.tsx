import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useMotionPreference } from "../../motion/useMotionPreference";

export interface RuntimeFrameProps {
	label?: ReactNode;
	/** Sweep an orange scan along the top edge while active. */
	running?: boolean;
	children?: ReactNode;
	className?: string;
}

/**
 * A bordered runtime boundary with a label tab. While `running`, an orange
 * scan sweeps the top edge; under reduced motion the frame is static. The
 * scan loop idles off when not running.
 *
 * Lands on: workspace shell, tool runtime container.
 */
export function RuntimeFrame({
	label,
	running = false,
	children,
	className,
}: RuntimeFrameProps) {
	const { reduced } = useMotionPreference();

	return (
		<div
			className={className}
			style={{
				position: "relative",
				border: "1px solid var(--monad-border-strong)",
				borderRadius: "var(--monad-radius-md)",
				background: "var(--monad-surface)",
				padding: 16,
				fontFamily: "var(--monad-font)",
				color: "var(--monad-text)",
				overflow: "hidden",
			}}
		>
			{label != null && (
				<span
					style={{
						position: "absolute",
						top: -1,
						left: 12,
						transform: "translateY(-50%)",
						padding: "1px 8px",
						fontSize: 10,
						letterSpacing: "0.08em",
						textTransform: "uppercase",
						color: "var(--monad-text-muted)",
						background: "var(--monad-bg)",
						border: "1px solid var(--monad-border)",
						borderRadius: "9999px",
					}}
				>
					{label}
				</span>
			)}
			{running && !reduced && (
				<motion.span
					aria-hidden
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						height: 2,
						width: "40%",
						background:
							"linear-gradient(90deg, transparent, var(--monad-transition), transparent)",
					}}
					initial={{ x: "-100%" }}
					animate={{ x: "350%" }}
					transition={{
						duration: 1.8,
						ease: "easeInOut",
						repeat: Number.POSITIVE_INFINITY,
					}}
				/>
			)}
			{children}
		</div>
	);
}
