import { cn } from "@rox/ui/utils";
import { useId } from "react";

interface RoxLogoProps {
	className?: string;
	gradient?: boolean;
}

/**
 * Rox brand wordmark. Rendered as SVG text so it scales crisply and inherits
 * `currentColor`. Keeps the original SVG interface (width/height/className,
 * optional shimmer gradient) used across the sign-in / loading surfaces.
 */
export function RoxLogo({ className, gradient = false }: RoxLogoProps) {
	const reactId = useId();
	const gradientId = `rox-logo-gradient-${reactId}`;

	return (
		<svg
			width="120"
			height="46"
			viewBox="0 0 120 46"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={cn("text-foreground", className)}
			aria-label="Rox"
		>
			<title>Rox</title>
			{gradient && (
				<defs>
					<linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
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
				</defs>
			)}
			<text
				x="0"
				y="37"
				fontFamily="ui-sans-serif, -apple-system, system-ui, sans-serif"
				fontSize="44"
				fontWeight="800"
				letterSpacing="-2"
				fill={gradient ? `url(#${gradientId})` : "currentColor"}
			>
				rox
			</text>
		</svg>
	);
}
