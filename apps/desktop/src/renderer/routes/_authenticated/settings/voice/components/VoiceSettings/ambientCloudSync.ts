/**
 * Ambient cloud wire-up helpers (ambient-intelligence epic, phase 4b, "Act").
 *
 * The "Фоновый агент" toggle and "Контекст для агента" text persist to TWO
 * places:
 *   - LOCAL (`@rox/local-db` via electronTrpc.settings.*) — drives the snappy
 *     optimistic UI and the future on-device ambient runtime / dictation
 *     post-process.
 *   - CLOUD (`apiClient.ambient.*` → `user_ambient_settings`) — the org+user
 *     row the server-side `*\/5` nudge job actually gates on. The desktop may be
 *     closed, so the job can only see the cloud row; without this the toggle
 *     never reaches the job and the feature no-ops.
 *
 * Cloud is the source of truth for the server job, so initial UI state is
 * seeded from the cloud row when it is available and only falls back to the
 * local value before the cloud read resolves (or when it fails). These helpers
 * are pure so the merge logic is unit-tested without React or tRPC.
 */

/** The cloud `ambient.get` shape we depend on (subset). */
export interface AmbientCloudState {
	ambientEnabled: boolean;
	voiceAgentContext: string | null;
}

/**
 * Resolve the ambient toggle's initial `checked` value.
 *
 * Cloud is authoritative for the server nudge job, so prefer the cloud row once
 * it has loaded; fall back to the local opt-in flag while the cloud read is
 * still pending or if it failed, and finally to `false` (opt-in default).
 */
export function resolveAmbientEnabled(
	cloud: AmbientCloudState | undefined,
	local: boolean | undefined,
): boolean {
	if (cloud !== undefined) return cloud.ambientEnabled;
	return local ?? false;
}

/**
 * Resolve the persona/context textarea's seed value.
 *
 * Same precedence as the toggle: cloud row first (normalising NULL → ""), then
 * the local value, then empty. Used only to seed the editable draft before the
 * user starts typing (cache-first), never to overwrite an in-progress edit.
 */
export function resolveAmbientContext(
	cloud: AmbientCloudState | undefined,
	local: string | undefined,
): string {
	if (cloud !== undefined) return cloud.voiceAgentContext ?? "";
	return local ?? "";
}

/**
 * Normalise the textarea value into the cloud `setPersona` input: trimmed, and
 * empty → null so the server clears the persona (matches the router contract,
 * which treats falsy as "use the default Rox persona").
 */
export function toCloudPersona(context: string): string | null {
	const trimmed = context.trim();
	return trimmed.length > 0 ? trimmed : null;
}
