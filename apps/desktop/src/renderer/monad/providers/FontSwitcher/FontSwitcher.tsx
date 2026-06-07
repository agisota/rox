import { motion } from "framer-motion";
import { type KeyboardEvent, useRef } from "react";
import { instant, springs } from "../../motion/tokens";
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
 * Segmented control over the three MONAD font themes, implemented as an ARIA
 * toolbar with roving tabindex: Tab reaches the active option, then Arrow /
 * Home / End move between options. The active option is marked by a shared-
 * `layoutId` orange pill that glides between options; under reduced motion the
 * pill keeps the same `layoutId` but teleports (zero duration), so the resting
 * state stays stable with no remount flash.
 */
export function FontSwitcher({ className }: FontSwitcherProps) {
	const { font, setFont } = useMonadFont();
	const { reduced } = useMotionPreference();
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

	const moveFocus = (index: number) => {
		const next = (index + FONTS.length) % FONTS.length;
		setFont(FONTS[next].id);
		buttonsRef.current[next]?.focus();
	};

	const onKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
	) => {
		switch (event.key) {
			case "ArrowRight":
			case "ArrowDown":
				event.preventDefault();
				moveFocus(index + 1);
				break;
			case "ArrowLeft":
			case "ArrowUp":
				event.preventDefault();
				moveFocus(index - 1);
				break;
			case "Home":
				event.preventDefault();
				moveFocus(0);
				break;
			case "End":
				event.preventDefault();
				moveFocus(FONTS.length - 1);
				break;
			default:
				break;
		}
	};

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
			{FONTS.map(({ id, label }, index) => {
				const active = id === font;
				return (
					<button
						key={id}
						ref={(el) => {
							buttonsRef.current[index] = el;
						}}
						type="button"
						aria-pressed={active}
						tabIndex={active ? 0 : -1}
						onClick={() => setFont(id)}
						onKeyDown={(event) => onKeyDown(event, index)}
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
								layoutId="monad-font-pill"
								className="absolute inset-0 rounded"
								style={{
									background: "var(--monad-orange-glow)",
									border: "1px solid var(--monad-transition)",
								}}
								transition={reduced ? instant : springs.snap}
							/>
						)}
						<span className="relative z-10">{label}</span>
					</button>
				);
			})}
		</div>
	);
}
