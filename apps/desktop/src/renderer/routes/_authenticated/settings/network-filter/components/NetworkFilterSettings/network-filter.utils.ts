/**
 * Pure gating helper for the Network Filter settings surface (WS-N / N7).
 *
 * The surface is flag-gated (`FEATURE_FLAGS.NETWORK_FILTER`). `useFeatureFlagEnabled`
 * returns `boolean | undefined` (undefined while PostHog is still bootstrapping), so
 * the decision is centralized here and unit-tested rather than rendered, matching the
 * repo's "test the pure logic, keep the component thin" convention.
 */

/**
 * Whether the Network Filter settings shell should render.
 *
 * Treats an undefined flag (PostHog not yet resolved) as OFF so the surface never
 * flashes for users outside the rollout cohort / without an admin override.
 */
export function shouldRenderNetworkFilter(
	flagEnabled: boolean | undefined,
): boolean {
	return flagEnabled === true;
}
