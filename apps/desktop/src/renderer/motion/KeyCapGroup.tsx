import { Kbd, KbdGroup } from "@rox/ui/kbd";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { useEffect, useRef } from "react";
import { ease, motionDuration, motionSpring } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

/**
 * Staggered key-cap pop-in with a one-shot glow on chord change.
 *
 * Each key cap in `keys` enters with a spring scale/opacity/y pop when the
 * array changes. When a **new** chord lands (not on first paint), the wrapper
 * pulses a brief primary-colour box-shadow to confirm the recorded binding.
 *
 * Decorative tier — renders the static `KbdGroup` instantly when motion is
 * off or reduced-motion is in effect.
 *
 * Case 117 / PR-117.
 */
export function KeyCapGroup({ keys }: { keys: string[] }) {
	const animate = useShouldAnimate("decorative");
	const controls = useAnimationControls();
	const mountRef = useRef(true);
	const keysKey = keys.join("+");

	useEffect(() => {
		// Skip the glow on the very first mount — only fire on an actual change.
		if (mountRef.current) {
			mountRef.current = false;
			return;
		}
		if (!animate || !keysKey) return;
		void controls.start({
			boxShadow: [
				"0 0 0 0 hsl(var(--primary) / 0)",
				"0 0 0 3px hsl(var(--primary) / 0.35)",
				"0 0 0 0 hsl(var(--primary) / 0)",
			],
			transition: { duration: motionDuration.base, ease: ease.standard },
		});
	}, [keysKey, animate, controls]);

	if (!animate) {
		return (
			<KbdGroup>
				{keys.map((k) => (
					<Kbd key={k}>{k}</Kbd>
				))}
			</KbdGroup>
		);
	}

	return (
		<motion.span animate={controls} className="inline-flex rounded-sm">
			<KbdGroup>
				<AnimatePresence initial={false} mode="popLayout">
					{keys.map((k, i) => (
						<motion.span
							key={k}
							initial={{ opacity: 0, scale: 0.6, y: -3 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.6, y: -3 }}
							transition={{ ...motionSpring.snappy, delay: i * 0.04 }}
						>
							<Kbd>{k}</Kbd>
						</motion.span>
					))}
				</AnimatePresence>
			</KbdGroup>
		</motion.span>
	);
}
