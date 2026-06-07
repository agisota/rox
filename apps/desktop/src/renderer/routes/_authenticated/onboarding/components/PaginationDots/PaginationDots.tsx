import { cn } from "@rox/ui/utils";
import { motion } from "framer-motion";
import { useShouldAnimate } from "renderer/motion";

interface PaginationDotsProps {
	current: number;
	total: number;
}

export function PaginationDots({ current, total }: PaginationDotsProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	const dots = Array.from({ length: total }, (_, i) => `dot-${i}`);
	return (
		<div className="flex items-center gap-1.5">
			{dots.map((id, i) => (
				<span
					key={id}
					aria-hidden
					className={cn(
						"relative size-1.5 rounded-full bg-muted-foreground/30",
					)}
				>
					{i === current && (
						<motion.span
							layoutId="onboarding-dot-active"
							className="absolute inset-0 rounded-full bg-foreground"
							transition={
								shouldAnimate
									? { type: "spring", stiffness: 400, damping: 30 }
									: { duration: 0 }
							}
						/>
					)}
				</span>
			))}
		</div>
	);
}
