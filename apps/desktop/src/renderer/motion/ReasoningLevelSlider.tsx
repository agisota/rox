import { LayoutGroup, motion } from "framer-motion";
import { useId } from "react";
import { type ThinkingLevel } from "@rox/ui/ai-elements/thinking-toggle";
import { cn } from "@rox/ui/utils";
import { useShouldAnimate } from "./useMotionPreference";
import { motionSpring } from "./tokens";

const SEGMENTS: { value: ThinkingLevel; label: string }[] = [
	{ value: "off", label: "Off" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "xhigh", label: "Max" },
];

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

	return (
		<LayoutGroup id={groupId}>
			<div
				role="radiogroup"
				aria-label="Extended thinking level"
				className={cn(
					"relative inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5 text-xs",
					className,
				)}
			>
				{SEGMENTS.map((seg) => {
					const selected = seg.value === level;
					return (
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
		</LayoutGroup>
	);
}
