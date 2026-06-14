import { cn } from "@rox/ui/utils";
import { useId } from "react";

interface RoxLogoProps {
	className?: string;
	/** Animated shimmer sweep — used for loading / session-restore states. */
	gradient?: boolean;
}

/**
 * The Rox wordmark: the lowercase "rox" set in the app's brand monospace
 * (Victor Mono) with a soft vertical sheen and a terminal caret that gently
 * pulses — the developer-native signature. When `gradient` is set, the
 * wordmark plays a left-to-right shimmer (used while a session is restoring).
 */
export function RoxLogo({ className, gradient = false }: RoxLogoProps) {
	const reactId = useId();
	const shimmerId = `rox-shimmer-${reactId}`;
	const depthId = `rox-depth-${reactId}`;

	return (
		<svg
			width="122"
			height="48"
			viewBox="0 0 122 48"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={cn("text-foreground", className)}
			aria-label="Rox"
		>
			<title>Rox</title>
			<defs>
				{/* Soft top→bottom sheen so the wordmark reads with depth, not flat. */}
				<linearGradient id={depthId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="currentColor" stopOpacity="1" />
					<stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
				</linearGradient>
				{gradient && (
					<linearGradient id={shimmerId} x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
						<stop offset="45%" stopColor="currentColor" stopOpacity="0.45" />
						<stop offset="50%" stopColor="currentColor" stopOpacity="1" />
						<stop offset="55%" stopColor="currentColor" stopOpacity="0.45" />
						<stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
						<animate
							attributeName="x1"
							values="-100%;100%;100%"
							keyTimes="0;0.55;1"
							dur="1.6s"
							repeatCount="indefinite"
						/>
						<animate
							attributeName="x2"
							values="0%;200%;200%"
							keyTimes="0;0.55;1"
							dur="1.6s"
							repeatCount="indefinite"
						/>
					</linearGradient>
				)}
			</defs>

			<text
				x="0"
				y="37"
				fontFamily='var(--font-mono, "Victor Mono", ui-monospace, monospace)'
				fontSize="42"
				fontWeight="700"
				letterSpacing="-1"
				fill={gradient ? `url(#${shimmerId})` : `url(#${depthId})`}
			>
				rox
			</text>

			{/* Terminal caret — gently pulses like a live prompt. */}
			<rect x="95" y="11" width="18" height="27" rx="3" fill="currentColor">
				<animate
					attributeName="opacity"
					values="1;0.2;1"
					keyTimes="0;0.5;1"
					dur="1.4s"
					calcMode="spline"
					keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
					repeatCount="indefinite"
				/>
			</rect>
		</svg>
	);
}
