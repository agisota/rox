import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { Gauge } from "lucide-react";
import { ease, motionDuration } from "renderer/motion/tokens";
import { useShouldAnimate } from "renderer/motion/useMotionPreference";

interface DiffPerformanceMeterProps {
	totalChanged: number;
	fileCount: number;
	expandUnchanged: boolean;
	onHideUnchanged: () => void;
}

export function DiffPerformanceMeter({
	totalChanged,
	fileCount,
	expandUnchanged,
	onHideUnchanged,
}: DiffPerformanceMeterProps) {
	const animate = useShouldAnimate("decorative");
	const fill = Math.min(1, totalChanged / 8000);

	return (
		<AnimatePresence initial={false}>
			<motion.div
				key="diff-perf-meter"
				initial={animate ? { opacity: 0, width: 0 } : false}
				animate={{ opacity: 1, width: "auto" }}
				exit={animate ? { opacity: 0, width: 0 } : { opacity: 0 }}
				transition={{ duration: motionDuration.fast, ease: ease.standard }}
				className="flex items-center gap-1 overflow-hidden pr-1"
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={expandUnchanged ? onHideUnchanged : undefined}
							aria-label="Large diff — hide unchanged regions to improve performance"
							className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
						>
							<Gauge className="size-3.5" />
							<span className="relative h-1 w-8 overflow-hidden rounded-full bg-muted-foreground/20">
								<motion.span
									className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-amber-500"
									style={{ scaleX: fill }}
									initial={animate ? { scaleX: 0 } : false}
									animate={{ scaleX: fill }}
									transition={{
										duration: animate ? motionDuration.base : 0,
										ease: ease.standard,
									}}
								/>
							</span>
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{`Large diff (${fileCount} files, ${totalChanged.toLocaleString()} lines). Hide unchanged regions for smoother scrolling.`}
					</TooltipContent>
				</Tooltip>
			</motion.div>
		</AnimatePresence>
	);
}
