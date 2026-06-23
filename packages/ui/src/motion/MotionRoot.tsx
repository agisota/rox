import { LayoutGroup, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { motionDuration } from "./tokens";
import { useMotionPreference } from "./useMotionPreference";

export interface MotionRootProps {
	children: ReactNode;
}

/**
 * App-wide motion provider.
 *
 * `LayoutGroup` enables shared-`layoutId` transitions across sibling
 * components. The `reducedMotion` mode is derived from the user's stored
 * preference: `'off'` maps to `"always"` (a global backstop that disables motion
 * even for any ad-hoc `motion.*` not gated by `useShouldAnimate`), while any
 * other value maps to `"user"` so framer-motion still honors the OS
 * reduce-motion setting for every descendant. Case 015 wires this up.
 *
 * Net-new in PR-01 and not yet mounted into any product surface.
 */
export function MotionRoot({ children }: MotionRootProps) {
	const preference = useMotionPreference();
	const reducedMotion = preference === "off" ? "always" : "user";
	return (
		<MotionConfig
			reducedMotion={reducedMotion}
			transition={{ duration: motionDuration.base }}
		>
			<LayoutGroup>{children}</LayoutGroup>
		</MotionConfig>
	);
}
