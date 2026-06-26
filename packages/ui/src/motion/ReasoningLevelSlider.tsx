import type { ThinkingLevel } from "@rox/ui/ai-elements/thinking-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { BrainIcon } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { motionSpring } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

const SEGMENTS: { value: ThinkingLevel; label: string }[] = [
	{ value: "off", label: "Выкл" },
	{ value: "low", label: "Низкий" },
	{ value: "medium", label: "Средний" },
	{ value: "high", label: "Высокий" },
	{ value: "xhigh", label: "Макс" },
];

/** Ordinal of each level — drives the brain-glyph fill intensity. */
const LEVEL_INTENSITY: Record<ThinkingLevel, number> = {
	off: 0,
	low: 0.25,
	medium: 0.5,
	high: 0.75,
	xhigh: 1,
};

/**
 * Reasoning-effort control for the chat composer (FN / #518 redesign).
 *
 * An icon-only, focusable brain glyph (with an `aria-label` + tooltip explaining
 * it regulates reasoning effort) followed by an inline segmented slider
 * (Выкл → Макс) for the five reasoning levels. The redesign turns the flat
 * segments into a premium glass control:
 *
 * - the track is a translucent glass pill (`backdrop-blur` + hairline ring) that
 *   reads on the dark composer chrome;
 * - the active segment is a shared-layout glass marker with a soft accent glow
 *   that springs between segments (essential motion tier, so it still moves under
 *   the "essential" preference and snaps instantly when motion is off);
 * - each segment scales subtly on press and lifts its label on hover, so it is
 *   "interesting to click";
 * - the brain glyph brightens and fills proportionally to the chosen level, so
 *   the active/idle state reads at a glance.
 *
 * A11y is preserved: `role=radiogroup` + `role=radio`/`aria-checked` segments,
 * keyboard-focusable, with RU labels matching the `ThinkingToggle` dropdown.
 */
export function ReasoningLevelSlider({
	level,
	onLevelChange,
	className,
}: {
	level: ThinkingLevel;
	onLevelChange: (level: ThinkingLevel) => void;
	className?: string;
}) {
	const shouldAnimate = useShouldAnimate("essential");
	const groupId = useId();
	const isActive = level !== "off";
	const intensity = LEVEL_INTENSITY[level];

	const markerTransition = shouldAnimate
		? motionSpring.snappy
		: { duration: 0 };

	return (
		<LayoutGroup id={groupId}>
			<div
				className={cn(
					"inline-flex items-center gap-1.5 rounded-md px-1.5 text-xs",
					className,
				)}
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Уровень рассуждения"
							className={cn(
								"inline-flex shrink-0 cursor-default items-center transition-colors duration-200",
								isActive ? "text-foreground" : "text-muted-foreground",
							)}
						>
							<BrainIcon
								className="size-3.5 transition-opacity duration-200"
								// Glyph fills with the reasoning level: dim at "off", solid at
								// "Макс". Inline so it tracks the continuous intensity ramp.
								style={{ opacity: 0.45 + intensity * 0.55 }}
							/>
						</button>
					</TooltipTrigger>
					<TooltipContent>Регулирование усилия рассуждения</TooltipContent>
				</Tooltip>
				<div
					role="radiogroup"
					aria-label="Уровень размышления модели"
					className={cn(
						// Glass track: translucent fill + hairline ring + blur so it reads
						// as a premium control on the dark composer chrome.
						"relative inline-flex items-center gap-0.5 rounded-full p-0.5",
						"bg-foreground/[0.06] ring-1 ring-inset ring-foreground/10 backdrop-blur-sm",
						"transition-shadow duration-200",
						isActive && "ring-accent/30",
					)}
				>
					{SEGMENTS.map((seg) => {
						const selected = seg.value === level;
						return (
							<motion.button
								key={seg.value}
								type="button"
								role="radio"
								aria-checked={selected}
								onClick={() => onLevelChange(seg.value)}
								whileTap={shouldAnimate ? { scale: 0.92 } : undefined}
								transition={markerTransition}
								className={cn(
									"relative z-10 rounded-full px-2 py-1 font-medium transition-colors duration-150",
									"hover:-translate-y-px",
									selected
										? "text-accent-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{selected && (
									<motion.span
										layoutId="reasoning-marker"
										className={cn(
											"absolute inset-0 -z-10 rounded-full",
											// Glass marker with a soft accent glow.
											"bg-accent shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_-2px_var(--tw-shadow-color)] shadow-accent/50",
										)}
										transition={markerTransition}
									/>
								)}
								{seg.label}
							</motion.button>
						);
					})}
				</div>
			</div>
		</LayoutGroup>
	);
}
