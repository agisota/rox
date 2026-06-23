/**
 * Pure resolution of the agents-UI flag from a raw PostHog evaluation result.
 * Kept in its OWN module (no Next `headers()`, `auth`, `db`, or PostHog client
 * imports) so the gate decision is unit-testable without booting the server
 * runtime — importing the full `getAgentsUiAccess` pulls in the neon client.
 *
 * `flagValue` is the raw `getFeatureFlag` result; `evaluationFailed` is true
 * when the PostHog call threw (outage / timeout / network unreachable).
 *
 * Policy: the flag is a POSITIVE enable, never a deny-by-default-on-error gate.
 *   - flag truthy + evaluation succeeded  → grant (genuine enable)
 *   - flag falsy   + evaluation succeeded → deny  (genuine deny — preserved)
 *   - evaluation FAILED                   → FAIL OPEN: grant, `degraded: true`
 *
 * Rationale: a PostHog outage must NOT lock everyone out. Treating an infra
 * failure as a hard deny made a single PostHog outage indistinguishable from a
 * genuine flag-off deny and locked out users who would otherwise have access.
 * On outage we fail open (access granted) to the deterministic safe default and
 * surface `degraded: true` so the failure stays observable (telemetry / UI) and
 * is never a silent downgrade. Genuine deny (flag explicitly off) still works.
 */
export function resolveAgentsUiAccess(
	flagValue: string | boolean | undefined,
	evaluationFailed: boolean,
): { hasAgentsUiAccess: boolean; degraded: boolean } {
	if (evaluationFailed) {
		// Fail OPEN on infra failure: do not lock users out because PostHog is
		// unreachable. `degraded` keeps the failed check observable.
		return { hasAgentsUiAccess: true, degraded: true };
	}
	return { hasAgentsUiAccess: Boolean(flagValue), degraded: false };
}
