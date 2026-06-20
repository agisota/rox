/**
 * LiveBlocks configuration resolved from the environment. Kept dependency-light
 * (no `@t3-oss/env-core`) — mirrors `@rox/analytics/src/env.ts` — so this package
 * can be imported from both browser and server bundles. The host app
 * (`apps/web/src/env.ts`) remains the validating authority; this helper only
 * reads the same vars.
 *
 * Reuses the EXISTING experimental-features env-key names — does not invent a
 * parallel flag:
 *   - `LIVEBLOCKS_SECRET_KEY`            (server-only; never shipped to client)
 *   - `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` (public; safe to expose)
 */

export interface LiveblocksEnv {
	/** Server-only secret used to mint room session tokens. */
	secretKey: string | undefined;
	/** Public key — safe to expose to the browser. */
	publicKey: string | undefined;
}

function read(key: string): string | undefined {
	const value = typeof process !== "undefined" ? process.env?.[key] : undefined;
	return value && value.length > 0 ? value : undefined;
}

export function resolveLiveblocksEnv(): LiveblocksEnv {
	return {
		secretKey: read("LIVEBLOCKS_SECRET_KEY"),
		publicKey: read("NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY"),
	};
}

/** True when LiveBlocks is configured enough to mint server-side tokens. */
export function isLiveblocksServerEnabled(env: LiveblocksEnv): boolean {
	return Boolean(env.secretKey);
}

/** True when LiveBlocks is configured enough to connect from the browser. */
export function isLiveblocksClientEnabled(env: LiveblocksEnv): boolean {
	return Boolean(env.publicKey);
}

/**
 * Read + assert the server secret is present. Throws a clear error when the key
 * is missing so server entry points fail loudly rather than silently denying.
 */
export function requireLiveblocksSecretKey(): string {
	const { secretKey } = resolveLiveblocksEnv();
	if (!secretKey) {
		throw new Error(
			"LIVEBLOCKS_SECRET_KEY is not set — cannot mint LiveBlocks room tokens.",
		);
	}
	return secretKey;
}
