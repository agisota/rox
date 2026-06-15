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
 * When `gradient` is set (e.g. while a session is restoring) the mark plays a
 * soft opacity pulse.
 */
export function RoxLogo({ className, gradient = false }: RoxLogoProps) {
	return (
		<img
			src={roxLogo}
			alt="Rox"
			draggable={false}
			className={cn(
				"w-auto select-none",
				gradient && "motion-safe:animate-pulse",
				className,
			)}
		/>
	);
}
