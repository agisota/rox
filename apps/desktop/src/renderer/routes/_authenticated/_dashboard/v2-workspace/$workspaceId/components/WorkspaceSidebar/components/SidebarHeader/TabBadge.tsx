import { cn } from "@rox/ui/utils";
import { motion, useAnimationControls } from "framer-motion";
import { useEffect, useRef } from "react";
import {
	AnimatedNumber,
	motionSpring,
	useShouldAnimate,
} from "renderer/motion";

interface TabBadgeProps {
	count: number;
	isActive: boolean;
	compact?: boolean;
}

export function TabBadge({ count, isActive, compact }: TabBadgeProps) {
	const animate = useShouldAnimate("decorative");
	const controls = useAnimationControls();
	const prev = useRef(count);

	useEffect(() => {
		if (animate && prev.current !== count) {
			controls.start({ scale: [1, 1.25, 1], transition: motionSpring.badge });
		}
		prev.current = count;
	}, [count, animate, controls]);

	const className = cn(
		"shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium leading-4 tabular-nums text-muted-foreground",
		isActive && "bg-background/80 text-foreground",
		compact && "absolute right-1 top-1 min-w-3 px-1 text-[9px] leading-3",
	);

	if (!animate) {
		return (
			<span aria-hidden="true" className={className}>
				{count > 99 ? "99+" : count}
			</span>
		);
	}

	return (
		<motion.span
			aria-hidden="true"
			className={className}
			animate={controls}
			style={{ willChange: "transform" }}
		>
			{count > 99 ? "99+" : <AnimatedNumber value={count} />}
		</motion.span>
	);
}
