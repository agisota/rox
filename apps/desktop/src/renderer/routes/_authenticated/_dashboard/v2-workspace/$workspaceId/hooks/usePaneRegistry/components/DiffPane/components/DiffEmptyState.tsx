import {
	DrawnCheck,
	ease,
	motionDuration,
	useShouldAnimate,
} from "@rox/ui/motion";
import { motion } from "framer-motion";

/**
 * Animated empty state shown when the changeset has no files (working tree is
 * clean). Draws a check mark and staggers in the title + subtitle. Reduced
 * motion: renders final state instantly.
 */
export function DiffEmptyState() {
	const animate = useShouldAnimate("decorative");

	const container = {
		hidden: { opacity: 0 },
		show: {
			opacity: 1,
			transition: {
				staggerChildren: 0.06,
				delayChildren: 0.05,
			},
		},
	};

	const item = {
		hidden: { opacity: 0, y: 6 },
		show: {
			opacity: 1,
			y: 0,
			transition: { duration: motionDuration.base, ease: ease.standard },
		},
	};

	return (
		<motion.div
			className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
			variants={container}
			initial={animate ? "hidden" : false}
			animate="show"
		>
			<motion.span
				variants={item}
				className="mb-1 flex items-center justify-center rounded-full bg-green-500/10 p-2 text-green-500"
			>
				<DrawnCheck className="h-5 w-5" strokeWidth={2.5} />
			</motion.span>
			<motion.span variants={item} className="font-medium text-foreground">
				No changes
			</motion.span>
			<motion.span variants={item}>Your working tree is clean.</motion.span>
		</motion.div>
	);
}
