/**
 * LiveKit configuration resolved from the environment. Kept dependency-light
 * (no `@t3-oss/env-core`) — mirrors `@rox/analytics/src/env.ts` — so this package
 * can be imported from both browser and server bundles. The host app
 * (`apps/web/src/env.ts`) remains the validating authority.
 *
 * Reuses the EXISTING experimental-features env-key names:
 *   - `LIVEKIT_API_KEY`       (server-only)
 *   - `LIVEKIT_API_SECRET`    (server-only)
 *   - `NEXT_PUBLIC_LIVEKIT_URL` (public; the SFU / LiveKit Cloud ws URL)
 */

export interface LivekitEnv {
	/** Server-only API key used to sign access tokens. */
	apiKey: string | undefined;
	/** Server-only API secret used to sign access tokens. */
	apiSecret: string | undefined;
	/** Public SFU URL the browser connects to (e.g. `wss://<project>.livekit.cloud`). */
	url: string | undefined;
}

function read(key: string): string | undefined {
	const value = typeof process !== "undefined" ? process.env?.[key] : undefined;
	return value && value.length > 0 ? value : undefined;
}

export function resolveLivekitEnv(): LivekitEnv {
	return {
		apiKey: read("LIVEKIT_API_KEY"),
		apiSecret: read("LIVEKIT_API_SECRET"),
		url: read("NEXT_PUBLIC_LIVEKIT_URL"),
	};
}

/** True when LiveKit is configured enough to mint server-side access tokens. */
export function isLivekitServerEnabled(env: LivekitEnv): boolean {
	return Boolean(env.apiKey && env.apiSecret);
}

/** True when LiveKit is configured enough to connect from the browser. */
export function isLivekitClientEnabled(env: LivekitEnv): boolean {
	return Boolean(env.url);
}

/** Read + assert both server credentials are present. */
export function requireLivekitServerCredentials(): {
	apiKey: string;
	apiSecret: string;
} {
	const { apiKey, apiSecret } = resolveLivekitEnv();
	if (!apiKey || !apiSecret) {
		throw new Error(
			"LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not set — cannot mint LiveKit tokens.",
		);
	}
	return { apiKey, apiSecret };
}
