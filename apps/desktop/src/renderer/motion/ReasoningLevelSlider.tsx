import type { ThinkingLevel } from "@rox/ui/ai-elements/thinking-toggle";
import { cn } from "@rox/ui/utils";
import { LayoutGroup, motion } from "framer-motion";
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
		</LayoutGroup>
	);
}
