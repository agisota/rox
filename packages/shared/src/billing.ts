/**
 * Plan tier identifiers retained for the desktop UI only (#70: Stripe
 * subscriptions removed).
 *
 * The prepaid Rox economy has no paid subscription tiers — `useCurrentPlan`
 * (`apps/desktop`) hard-codes the free tier and only needs this string-union for
 * its return type. The Stripe-coupled exports that used to live here
 * (`ACTIVE_SUBSCRIPTION_STATUSES`, `isActiveSubscriptionStatus`, `isPaidPlan`)
 * were removed alongside the `subscriptions` table — they had no live consumer
 * once `membership.ts` stopped joining subscriptions.
 */
export const PLAN_TIERS = ["free", "pro", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];
