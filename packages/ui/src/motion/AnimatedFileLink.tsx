import { FileIcon } from "lucide-react";
import { motion } from "motion/react";
import { type ComponentProps, memo } from "react";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

type AnimatedFileLinkProps = ComponentProps<"a">;

export const AnimatedFileLink = memo(function AnimatedFileLink({
	href,
	children,
	className,
	title,
	onClick,
	...rest
}: AnimatedFileLinkProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!shouldAnimate) {
		return (
			<a
				href={href}
				className={`underline underline-offset-2 ${className ?? ""}`}
				title={title}
				target="_blank"
				rel="noopener noreferrer"
				onClick={onClick}
				{...rest}
			>
				{children}
			</a>
		);
	}

	const linkTransition = {
		duration: motionDuration.fast,
		ease: ease.standard,
	};

	return (
		<motion.a
			href={href}
			className={`relative inline-flex items-center gap-1 underline-offset-2 text-primary hover:text-primary/80 ${className ?? ""}`}
			title={title}
			target="_blank"
			rel="noopener noreferrer"
			onClick={onClick}
			initial="rest"
			whileHover="hover"
			whileFocus="hover"
			{...(rest as object)}
		>
			<motion.span
				style={{ display: "inline-flex", alignItems: "center" }}
				variants={{
					rest: { x: 0 },
					hover: { x: 2 },
				}}
				transition={linkTransition}
			>
				<FileIcon className="size-3" aria-hidden />
			</motion.span>
			{children}
			<motion.span
				className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-px bg-current origin-left"
				variants={{
					rest: { scaleX: 0 },
					hover: { scaleX: 1 },
				}}
				transition={linkTransition}
			/>
		</motion.a>
	);
});
