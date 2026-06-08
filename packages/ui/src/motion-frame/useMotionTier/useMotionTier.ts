"use client";

import { useContext } from "react";
import {
	MotionFrameContext,
	type MotionFrameContextValue,
} from "../MotionFrameProvider";

/**
 * Default used when a primitive renders outside a `MotionFrameProvider` (tests,
 * isolated stories, ad-hoc usage). Falls open to `full` so components stay
 * fully functional without an explicit provider.
 */
const FALLBACK: MotionFrameContextValue = {
	tier: "full",
	setTier: () => {},
	effectiveTier: "full",
	prefersReducedMotion: false,
	capabilities: { entrance: true, loop: true, transition: true },
};

/** Read the active motion tier and its capability flags. */
export function useMotionTier(): MotionFrameContextValue {
	return useContext(MotionFrameContext) ?? FALLBACK;
}
