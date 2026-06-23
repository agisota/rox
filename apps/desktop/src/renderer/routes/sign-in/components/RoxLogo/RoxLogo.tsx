import { cn } from "@rox/ui/utils";
import roxLogo from "renderer/assets/rox-logo.png";

interface RoxLogoProps {
	className?: string;
	/**
	 * Loading / session-restore hint — renders the brand mark with a gentle
	 * opacity pulse (honors prefers-reduced-motion via motion-safe).
	 */
	gradient?: boolean;
}

/**
 * The Rox brand mark: the illustrated girl logo, shown on the sign-in screen.
 *
 * Rendered as a CSS mask filled with `bg-foreground` (instead of a raw <img>)
 * so the mark always takes the theme's foreground color — dark on light themes,
 * light on dark themes — and never disappears against the background. The PNG's
 * alpha channel defines the shape; the fill comes from the theme token.
 *
 * Aspect ratio is locked to the source asset (683×1040) so callers can size it
 * with just a height (e.g. `h-24`) and the width follows.
 */
export function RoxLogo({ className, gradient = false }: RoxLogoProps) {
	return (
		<div
			role="img"
			aria-label="Rox"
			className={cn(
				"aspect-[683/1040] select-none bg-foreground",
				gradient && "motion-safe:animate-pulse",
				className,
			)}
			style={{
				maskImage: `url(${roxLogo})`,
				WebkitMaskImage: `url(${roxLogo})`,
				maskSize: "contain",
				WebkitMaskSize: "contain",
				maskRepeat: "no-repeat",
				WebkitMaskRepeat: "no-repeat",
				maskPosition: "center",
				WebkitMaskPosition: "center",
			}}
		/>
	);
}
