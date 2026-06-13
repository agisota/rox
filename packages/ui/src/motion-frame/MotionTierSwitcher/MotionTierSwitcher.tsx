"use client";

import { motion } from "motion/react";
import { useId } from "react";
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
 * `off | essential | full`. Native radio inputs (visually hidden, styled
 * labels) give screen readers true one-of-many semantics and arrow-key
 * navigation. The highlighted option is the *requested* tier; the effective
 * tier may be clamped lower by `prefers-reduced-motion` (surfaced via
 * `data-clamped` on the group). The highlight pill animates via a
 * per-instance `layoutId` only when the governor allows transitions — the
 * switcher obeys the same rules it controls, and colors snap (no CSS
 * transitions) so nothing animates in `off`.
 */
export function MotionTierSwitcher({
	className,
	label = "Animation level",
}: MotionTierSwitcherProps) {
	const { tier, setTier, effectiveTier, capabilities } = useMotionTier();
	// Isolates instances: radio groups must not share a name, and motion must
	// not treat pills from different switchers as one shared layout element.
	const instanceId = useId();

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
					<label
						className={cn(
							"relative cursor-pointer rounded-full px-3 py-1 text-xs",
							"has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
							selected
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
						key={value}
					>
						<input
							checked={selected}
							className="sr-only"
							name={`motion-tier-${instanceId}`}
							onChange={() => setTier(value)}
							type="radio"
							value={value}
						/>
						{selected ? (
							capabilities.transition ? (
								<motion.span
									className="absolute inset-0 rounded-full bg-background shadow-sm"
									data-motion-pill="animated"
									layoutId={`motion-tier-pill-${instanceId}`}
									transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
								/>
							) : (
								<span
									className="absolute inset-0 rounded-full bg-background shadow-sm"
									data-motion-pill="static"
								/>
							)
						) : null}
						<span className="relative z-10">{TIER_LABEL[value]}</span>
					</label>
				);
			})}
		</fieldset>
	);
}
