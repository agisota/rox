"use client";

import { useReducedMotion } from "motion/react";
import { useContext } from "react";
import {
	CAPABILITIES,
	MotionFrameContext,
	type MotionFrameContextValue,
	type MotionTier,
} from "../MotionFrameProvider";

/**
 * Read the active motion tier and its capability flags.
 *
 * Inside a `MotionFrameProvider` the provider's value wins. Outside one (tests,
 * isolated usage) the hook still honors the OS `prefers-reduced-motion` setting:
 * it falls back to `full` only when motion is allowed, and to `off` otherwise —
 * so a provider-less component never animates against the user's preference.
 */
export function useMotionTier(): MotionFrameContextValue {
	const ctx = useContext(MotionFrameContext);
	const prefersReducedMotion = useReducedMotion() ?? false;

	if (ctx) {
		return ctx;
	}

	const effectiveTier: MotionTier = prefersReducedMotion ? "off" : "full";
	return {
		tier: "full",
		setTier: () => {},
		effectiveTier,
		prefersReducedMotion,
		capabilities: CAPABILITIES[effectiveTier],
	};
}
