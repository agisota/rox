/**
 * Pure resolution of the agents-UI flag from a raw PostHog evaluation result.
 * Kept in its OWN module (no Next `headers()`, `auth`, `db`, or PostHog client
 * imports) so the gate decision is unit-testable without booting the server
 * runtime — importing the full `getAgentsUiAccess` pulls in the neon client.
 *
 * `flagValue` is the raw `getFeatureFlag` result; `evaluationFailed` is true
 * when the PostHog call threw. WS-B T6: a PostHog outage must NOT silently
 * downgrade everyone — it surfaces `degraded: true` so the UI can show a
 * visible "access check unavailable" view instead of a blank deny.
 */
export function resolveAgentsUiAccess(
	flagValue: string | boolean | undefined,
	evaluationFailed: boolean,
): { hasAgentsUiAccess: boolean; degraded: boolean } {
	if (evaluationFailed) {
		return { hasAgentsUiAccess: false, degraded: true };
	}
	return { hasAgentsUiAccess: Boolean(flagValue), degraded: false };
}
