import { useReducedMotion } from "motion/react";
import { useSyncExternalStore } from "react";

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
 * Injectable source of the host app's persisted motion preference.
 *
 * The motion kit lives in `@rox/ui` and must not import any app store, so the
 * host registers its preference source once at startup via
 * {@link setMotionPreferenceSource}. The shape is a `getSnapshot`/`subscribe`
 * pair so it drives `useSyncExternalStore` directly — the hook identity never
 * changes regardless of when (or whether) a source is registered — and a
 * Zustand store wires in with no adapter (`getState`/`subscribe`).
 */
export interface MotionPreferenceSource {
	/** Current persisted preference. */
	getSnapshot: () => MotionPreference;
	/** Subscribe to changes; returns an unsubscribe fn. */
	subscribe: (onStoreChange: () => void) => () => void;
}

/** Default until a host registers: animate everything. */
const defaultSource: MotionPreferenceSource = {
	getSnapshot: () => "full",
	subscribe: () => () => {},
};

let preferenceSource: MotionPreferenceSource = defaultSource;

/**
 * Register the host app's persisted motion preference. Call once at startup,
 * before the first render that reads motion state.
 */
export function setMotionPreferenceSource(
	source: MotionPreferenceSource,
): void {
	preferenceSource = source;
}

function getStoredMotionPreference(): MotionPreference {
	return preferenceSource.getSnapshot();
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
 * reduce-motion setting or the registered preference source changes.
 */
export function useMotionPreference(): MotionPreference {
	const prefersReducedMotion = useReducedMotion();
	// Wrapper closures read the CURRENT source on every call, so a source
	// registered after mount is picked up without changing the hook identity.
	const stored = useSyncExternalStore(
		(onStoreChange) => preferenceSource.subscribe(onStoreChange),
		() => preferenceSource.getSnapshot(),
		() => preferenceSource.getSnapshot(),
	);
	return resolveMotionPreference(prefersReducedMotion, stored);
}

/**
 * Non-hook accessor twin of {@link useShouldAnimate}, for imperative call sites
 * (e.g. the imperative theme animation) that cannot use React hooks. Reads the
 * OS reduce-motion media query directly.
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
 * NOTE: this signature is FROZEN — consumers depend on the exact parameter list
 * and return type.
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
