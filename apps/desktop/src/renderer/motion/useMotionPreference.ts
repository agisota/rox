import { useReducedMotion } from "framer-motion";
import { useSettings } from "renderer/stores/settings";

/**
 * Resolved motion preference. `'full'` animates everything, `'essential'`
 * keeps only meaning-bearing transitions, `'off'` disables all motion.
 */
export type MotionPreference = "full" | "essential" | "off";

/**
 * Animation tier a primitive belongs to. `'essential'` motion conveys state
 * (open/close, presence); `'decorative'` motion is purely aesthetic.
 */
export type MotionTier = "essential" | "decorative";

/**
 * Typed seam for case 015 / PR-12.
 *
 * PR-01 shipped a stub that always returned `'full'`. Case 015 wires this to
 * the persisted `animationPreference` from `useSettings` — without changing any
 * exported signature, so consumers (cases 002–100) never need to be touched.
 */
function getStoredMotionPreference(): MotionPreference {
	return useSettings.getState().animationPreference;
}

/** Resolve the effective preference from the OS reduce-motion signal + store. */
function resolveMotionPreference(
	prefersReducedMotion: boolean | null,
	stored: MotionPreference,
): MotionPreference {
	// OS-level reduce-motion always wins, downgrading to the essential tier.
	if (prefersReducedMotion) {
		return "essential";
	}
	return stored;
}

/** Given a preference + tier, decide whether the tier may animate. */
function shouldAnimateForPreference(
	preference: MotionPreference,
	tier: MotionTier,
): boolean {
	if (preference === "off") {
		return false;
	}
	if (preference === "essential") {
		return tier === "essential";
	}
	return true;
}

/**
 * Hook: the current resolved motion preference. Re-renders when the OS
 * reduce-motion setting changes.
 */
export function useMotionPreference(): MotionPreference {
	const prefersReducedMotion = useReducedMotion();
	const stored = useSettings((s) => s.animationPreference);
	return resolveMotionPreference(prefersReducedMotion, stored);
}

/**
 * Non-hook accessor twin of {@link useShouldAnimate}, for imperative call sites
 * (e.g. case 011's imperative theme animation) that cannot use React hooks.
 * Reads the OS reduce-motion media query directly.
 */
export function motionPreference(): MotionPreference {
	const prefersReducedMotion =
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	return resolveMotionPreference(
		prefersReducedMotion,
		getStoredMotionPreference(),
	);
}

/**
 * Hook: whether the given tier should animate right now. Every motion primitive
 * gates on this and renders its final state instantly when it returns `false`.
 *
 * NOTE: this signature is FROZEN. Case 015 rewrites the resolution logic but
 * must not change the parameter list or return type.
 */
export function useShouldAnimate(tier: MotionTier = "essential"): boolean {
	const preference = useMotionPreference();
	return shouldAnimateForPreference(preference, tier);
}

/**
 * Non-hook twin of {@link useShouldAnimate} for imperative call sites.
 */
export function shouldAnimate(tier: MotionTier = "essential"): boolean {
	return shouldAnimateForPreference(motionPreference(), tier);
}
