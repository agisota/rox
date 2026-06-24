import { useShouldAnimate } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import type { ReactNode } from "react";

interface SpringInCardProps {
	className?: string;
	children: ReactNode;
}

/**
 * Decorative bouncy spring-in for empty / error state cards (spec MOTION tier
 * `decorative`). Implemented with `tw-animate-css` utilities gated behind both
 * the app motion-preference store ({@link useShouldAnimate}) and the OS
 * reduce-motion signal (`motion-safe:`), so it degrades to a static card when
 * either suppresses motion — no direct `motion/react` dependency in the
 * renderer surface.
 */
export function SpringInCard({ className, children }: SpringInCardProps) {
	const animate = useShouldAnimate("decorative");
	return (
		<div
			className={cn(
				animate &&
					"motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300",
				className,
			)}
		>
			{children}
		</div>
	);
}
