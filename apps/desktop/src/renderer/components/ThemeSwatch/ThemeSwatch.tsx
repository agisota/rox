import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { motion } from "framer-motion";
import { getTerminalColors, type Theme } from "shared/themes";

export function ThemeSwatch({ theme }: { theme: Theme }) {
	const terminal = getTerminalColors(theme);
	const isDark = theme.type === "dark";
	const shouldAnimate = useShouldAnimate("decorative");

	const transition = { duration: motionDuration.fast, ease: ease.standard };

	return (
		<motion.div
			className="flex h-5 w-7 shrink-0 items-center justify-center gap-1 rounded-sm font-semibold"
			animate={
				shouldAnimate ? { backgroundColor: terminal.background } : undefined
			}
			style={
				shouldAnimate
					? { boxShadow: "inset 0 0 0 0.5px rgba(128, 128, 128, 0.3)" }
					: {
							backgroundColor: terminal.background,
							boxShadow: "inset 0 0 0 0.5px rgba(128, 128, 128, 0.3)",
						}
			}
			transition={transition}
		>
			<motion.span
				className="h-1 w-1 rounded-full"
				animate={
					shouldAnimate ? { backgroundColor: terminal.green } : undefined
				}
				style={shouldAnimate ? undefined : { backgroundColor: terminal.green }}
				transition={transition}
			/>
			<motion.span
				className="text-[9px] leading-none"
				animate={
					shouldAnimate ? { color: isDark ? "#fff" : "#000" } : undefined
				}
				style={
					shouldAnimate
						? { opacity: 0.9 }
						: { color: isDark ? "#fff" : "#000", opacity: 0.9 }
				}
				transition={transition}
			>
				Aa
			</motion.span>
		</motion.div>
	);
}
