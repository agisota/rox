/**
 * Rox perk matrix (billing-economy epic, be-02).
 *
 * Distinguishes free vs subscriber users. The charge path (be-09) consults this
 * to decide whether a user may keep spending once their balance hits zero:
 * free users are hard-stopped at 0, subscribers are allowed to run a negative
 * (postpaid) balance that is reconciled at billing time.
 */

export type RoxPlanTier = "free" | "subscriber";

export interface RoxPerks {
	tier: RoxPlanTier;
	/** Free users are guarded at 0; subscribers may go negative (postpaid). */
	canSpendBelowZero: boolean;
	/** Max simultaneous in-flight metered requests. */
	maxConcurrentRequests: number;
	/** Whether the user gets priority routing/support. */
	prioritySupport: boolean;
	/** Catalog visibility. */
	modelAccess: "free_only" | "all";
}

export const ROX_PERKS: Record<RoxPlanTier, RoxPerks> = {
	free: {
		tier: "free",
		canSpendBelowZero: false,
		maxConcurrentRequests: 2,
		prioritySupport: false,
		modelAccess: "all",
	},
	subscriber: {
		tier: "subscriber",
		canSpendBelowZero: true,
		maxConcurrentRequests: 10,
		prioritySupport: true,
		modelAccess: "all",
	},
};

export function perksFor(tier: RoxPlanTier): RoxPerks {
	return ROX_PERKS[tier];
}

/**
 * Map a subscription status onto a tier. Active / trialing subscriptions are
 * subscribers; everything else (incomplete, canceled, missing) is free.
 */
export function resolveTier(subscriptionStatus?: string | null): RoxPlanTier {
	return subscriptionStatus === "active" || subscriptionStatus === "trialing"
		? "subscriber"
		: "free";
}

/**
 * Can this user afford a charge of `costRox` given their current `balanceRox`?
 * Free users must stay >= 0; subscribers may run negative.
 */
export function canAfford(
	tier: RoxPlanTier,
	balanceRox: number,
	costRox: number,
): boolean {
	if (perksFor(tier).canSpendBelowZero) {
		return true;
	}
	return balanceRox - costRox >= 0;
}
