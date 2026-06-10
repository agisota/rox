"use client";

import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import type { MotionTier } from "../MotionFrameProvider";
import { useMotionTier } from "../useMotionTier";

const TIERS: readonly MotionTier[] = ["off", "essential", "full"];

const TIER_LABEL: Record<MotionTier, string> = {
	off: "Off",
	essential: "Essential",
	full: "Full",
};

export interface MotionTierSwitcherProps {
	className?: string;
	/** Accessible label for the radio group. */
	label?: string;
}

/**
 * Segmented control for the motion governor: lets the user request
 * `off | essential | full`. The highlighted option is the *requested* tier;
 * the effective tier may be clamped lower by `prefers-reduced-motion`
 * (surfaced via `data-clamped` on the group). The highlight pill animates via
 * `layoutId` only when the governor allows transitions — the switcher obeys
 * the same rules it controls, and colors snap (no CSS transitions) so nothing
 * animates in `off`.
 */
export function MotionTierSwitcher({
	className,
	label = "Animation level",
}: MotionTierSwitcherProps) {
	const { tier, setTier, effectiveTier, capabilities } = useMotionTier();

	return (
		<fieldset
			className={cn(
				"inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1",
				className,
			)}
			data-clamped={effectiveTier !== tier ? "" : undefined}
		>
			<legend className="sr-only">{label}</legend>
			{TIERS.map((value) => {
				const selected = value === tier;
				return (
					<button
						aria-pressed={selected}
						className={cn(
							"relative rounded-full px-3 py-1 text-xs",
							selected
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
						key={value}
						onClick={() => setTier(value)}
						type="button"
					>
						{selected ? (
							capabilities.transition ? (
								<motion.span
									className="absolute inset-0 rounded-full bg-background shadow-sm"
									data-motion-pill
									layoutId="motion-tier-pill"
									transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
								/>
							) : (
								<span
									className="absolute inset-0 rounded-full bg-background shadow-sm"
									data-motion-pill
								/>
							)
						) : null}
						<span className="relative z-10">{TIER_LABEL[value]}</span>
					</button>
				);
			})}
		</fieldset>
	);
}
