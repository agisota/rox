/**
 * Local-only auth gate.
 *
 * When `LOCAL_ONLY_AUTH` is truthy the production build authenticates against
 * the local email/password path — no external OAuth provider and no cloud
 * round-trip (email verification is skipped) — for self-hosted / offline
 * deployments. When the flag is unset (the default) the normal cloud auth path
 * is completely unchanged.
 *
 * The browser bundle reads the `NEXT_PUBLIC_`-prefixed mirror because Next.js
 * only inlines that prefix into client code; server code reads either name.
 * Both are checked here so a single env value (`LOCAL_ONLY_AUTH`) drives the
 * server while `NEXT_PUBLIC_LOCAL_ONLY_AUTH` drives the client when set.
 */
const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

function isTruthy(value: string | undefined): boolean {
	return value !== undefined && TRUTHY_VALUES.has(value.trim().toLowerCase());
}

export function isLocalOnlyAuth(): boolean {
	return (
		isTruthy(process.env.LOCAL_ONLY_AUTH) ||
		isTruthy(process.env.NEXT_PUBLIC_LOCAL_ONLY_AUTH)
	);
}
