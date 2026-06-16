import type { ThinkingLevel } from "@rox/ui/ai-elements/thinking-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { LayoutGroup, motion } from "framer-motion";
import { BrainIcon } from "lucide-react";
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

/**
 * Labelled reasoning-effort control for the chat composer. A single pill that
 * names what it does — a brain glyph + "Размышление" caption — followed by an
 * inline segmented slider (Выкл → Макс) for the five reasoning levels. The
 * active segment is tracked by a shared-layout marker (essential tier, so it
 * still moves under the "essential" motion preference and snaps instantly when
 * motion is off). The caption dims when reasoning is off so the active/idle
 * state reads at a glance, matching the dark premium composer styling.
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
						<span
							className={cn(
								"inline-flex shrink-0 items-center gap-1 transition-colors",
								isActive ? "text-foreground" : "text-muted-foreground",
							)}
						>
							<BrainIcon className="size-3.5 opacity-60" />
							<span className="font-medium">Размышление</span>
						</span>
					</TooltipTrigger>
					<TooltipContent>Уровень размышления модели</TooltipContent>
				</Tooltip>
				<div
					role="radiogroup"
					aria-label="Уровень размышления модели"
					className="relative inline-flex items-center gap-0.5 rounded bg-muted p-0.5"
				>
					{SEGMENTS.map((seg) => {
						const selected = seg.value === level;
						return (
							// biome-ignore lint/a11y/useSemanticElements: segmented control uses button+role=radio inside a radiogroup; a native input/radio cannot carry the layout animation marker
							<button
								key={seg.value}
								type="button"
								role="radio"
								aria-checked={selected}
								onClick={() => onLevelChange(seg.value)}
								className={cn(
									"relative z-10 rounded px-2 py-1 transition-colors",
									selected
										? "text-accent-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{selected && (
									<motion.span
										layoutId="reasoning-marker"
										className="absolute inset-0 -z-10 rounded bg-accent"
										transition={
											shouldAnimate ? motionSpring.snappy : { duration: 0 }
										}
									/>
								)}
								{seg.label}
							</button>
						);
					})}
				</div>
			</div>
		</LayoutGroup>
	);
}
