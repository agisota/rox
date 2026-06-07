import { motion } from "framer-motion";
import { springs } from "../../motion/tokens";
import { useMotionPreference } from "../../motion/useMotionPreference";
import { type MonadFont, useMonadFont } from "../FontProvider";

const FONTS: { id: MonadFont; label: string }[] = [
	{ id: "blueprint", label: "Blueprint" },
	{ id: "brutalist", label: "Brutalist" },
	{ id: "terminal", label: "Terminal" },
];

export interface FontSwitcherProps {
	className?: string;
}

/**
 * Segmented control over the three MONAD font themes. The active option is
 * marked by a shared-`layoutId` orange pill that glides between options; under
 * reduced motion the pill simply appears on the active option (resting state
 * stays visible either way).
 */
export function FontSwitcher({ className }: FontSwitcherProps) {
	const { font, setFont } = useMonadFont();
	const { reduced } = useMotionPreference();

	return (
		<div
			role="toolbar"
			aria-label="Font theme"
			className={`inline-flex items-center gap-0.5 rounded-md p-0.5 ${className ?? ""}`}
			style={{
				background: "var(--monad-surface)",
				border: "1px solid var(--monad-border)",
			}}
		>
			{FONTS.map(({ id, label }) => {
				const active = id === font;
				return (
					<button
						key={id}
						type="button"
						aria-pressed={active}
						onClick={() => setFont(id)}
						className="relative rounded px-3 py-1 text-xs font-medium tracking-wide transition-colors"
						style={{
							color: active
								? "var(--monad-transition)"
								: "var(--monad-text-muted)",
						}}
					>
						{active && (
							<motion.span
								aria-hidden
								layoutId={reduced ? undefined : "monad-font-pill"}
								className="absolute inset-0 rounded"
								style={{
									background: "var(--monad-orange-glow)",
									border: "1px solid var(--monad-transition)",
								}}
								transition={springs.snap}
							/>
						)}
						<span className="relative z-10">{label}</span>
					</button>
				);
			})}
		</div>
	);
}
