import type { PlanTier } from "@rox/shared/billing";

/**
 * #34.1: plan tiers are gone — the Rox edition is free for everyone. This hook
 * is kept (with its prior `{ plan, isReady }` shape) only so the handful of
 * call sites that read it keep compiling; it always reports the free tier.
 */
export function useCurrentPlan(): { plan: PlanTier; isReady: boolean } {
	return { plan: "free", isReady: true };
}
