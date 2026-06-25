import {
	type BreakpointTier,
	type CascadeRules,
	cascadeRulesFor,
	resolveTier,
} from "@rox/shared/breakpoints";
import * as React from "react";

/**
 * Responsive breakpoint tier — React binding (F05, Hermes-borrow #639).
 *
 * Thin React adapter over the platform-neutral `@rox/shared/breakpoints` core.
 * The core owns the tier policy (wide / tablet / phone) and the per-tier cascade
 * rules; this hook only measures the DOM viewport and re-renders on resize. Web
 * and desktop consume this; React Native ships its own binding over the SAME
 * core via `Dimensions`, so the tier contract is identical everywhere.
 *
 * Resolution is read straight from `window.innerWidth` (and kept in sync with a
 * `resize` listener) rather than three separate `matchMedia` subscriptions, so a
 * width that lands exactly on a boundary can only ever produce one tier — the
 * one {@link resolveTier} returns. Before the first measurement (SSR / first
 * paint) the tier is `wide`, so the shell renders fully docked and only
 * collapses once a real width arrives, never flashing a phone layout on desktop.
 */
function readViewportWidth(): number {
	if (typeof window === "undefined") return Number.POSITIVE_INFINITY;
	return window.innerWidth;
}

/**
 * Current viewport tier. Re-renders only when the tier actually changes, not on
 * every pixel of a resize, so the shell cascade is cheap to keep mounted.
 */
export function useBreakpoint(): BreakpointTier {
	const [tier, setTier] = React.useState<BreakpointTier>(() =>
		resolveTier(readViewportWidth()),
	);

	React.useEffect(() => {
		const sync = () => {
			const next = resolveTier(window.innerWidth);
			// Functional update: skip the state churn (and child re-render) unless
			// the tier flipped — matches the core's "stable value" contract.
			setTier((prev) => (prev === next ? prev : next));
		};
		sync();
		window.addEventListener("resize", sync);
		return () => window.removeEventListener("resize", sync);
	}, []);

	return tier;
}

/**
 * Current tier plus its cascade rules in one read. Convenience for the shell,
 * which needs both the tier (for keys / analytics) and the rule flags (to drive
 * the region collapse). The rules object has a stable identity per tier, so it
 * is safe to spread into dependency arrays.
 */
export function useCascadeRules(): CascadeRules {
	const tier = useBreakpoint();
	return cascadeRulesFor(tier);
}
