/**
 * Managed-host relay credential resolution (remote-hosts epic, C5 / D7).
 *
 * A host-service can dial the relay using one of three credential sources, in
 * priority order:
 *
 *   1. A config-file session token (interactive desktop login) — handled by the
 *      caller via ConfigFileSessionTokenSource when ROX_AUTH_CONFIG_PATH is set.
 *   2. A relay bootstrap token (RELAY_BOOTSTRAP_TOKEN) — a short-lived
 *      credential injected by the managed provisioner so an ephemeral sandbox
 *      can authenticate without an interactive login or a long-lived API key.
 *   3. A static AUTH_TOKEN (API key / JWT) — the existing self-managed path.
 *
 * This helper resolves which static-token source to use when there is no
 * config-file source. The bootstrap token wins over AUTH_TOKEN so a sandbox
 * provisioned with both prefers the scoped, short-lived credential.
 */
export interface HostCredentialEnv {
	relayBootstrapToken?: string;
	authToken?: string;
	hasConfigSource: boolean;
}

export type HostCredentialSource =
	| { kind: "config" }
	| { kind: "bootstrap"; token: string }
	| { kind: "auth"; token: string }
	| { kind: "none" };

export function resolveHostCredentialSource(
	env: HostCredentialEnv,
): HostCredentialSource {
	if (env.hasConfigSource) return { kind: "config" };
	if (env.relayBootstrapToken) {
		return { kind: "bootstrap", token: env.relayBootstrapToken };
	}
	if (env.authToken) return { kind: "auth", token: env.authToken };
	return { kind: "none" };
}

/**
 * True when at least one usable credential source is configured. Managed
 * sandboxes set RELAY_BOOTSTRAP_TOKEN instead of AUTH_TOKEN, so env validation
 * must accept either.
 */
export function hasHostCredential(env: HostCredentialEnv): boolean {
	return resolveHostCredentialSource(env).kind !== "none";
}
