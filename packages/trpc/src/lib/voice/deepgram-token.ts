/**
 * Deepgram short-lived stream-token minting — in-app streaming STT.
 *
 * The desktop renderer streams the user's OWN microphone to Deepgram's realtime
 * API directly (sub-second words), but it must NEVER hold the real
 * `DEEPGRAM_API_KEY`. Instead the SERVER mints a short-lived JWT via Deepgram's
 * token-grant endpoint and hands only that token to the renderer; the renderer
 * authenticates the websocket with `Bearer <token>` while the real key stays
 * server-side.
 *
 * This mirrors the existing `whisper.ts` pattern: the key is read lazily from the
 * environment so callers stay testable without it, and the mint itself is a thin,
 * dependency-injected `fetch` over Deepgram's documented REST endpoint
 * (`POST https://api.deepgram.com/v1/auth/grant`, auth `Token <key>`, body
 * `{ ttl_seconds }`, response `{ access_token, expires_in }`). The grant runs only
 * here (server-side) and the key is never returned or logged.
 *
 * Ref (Deepgram docs, verified): POST /v1/auth/grant issues a JWT with
 * `usage:write` scope for the core voice APIs; default TTL 30s, max 3600s.
 */

/** Deepgram token-grant endpoint (REST equivalent of SDK `auth.v1.tokens.grant`). */
const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";

/** Default token lifetime (seconds). 300s comfortably covers reconnects while the
 * renderer streams a continuous mic; well under Deepgram's 3600s ceiling. */
export const DEFAULT_STREAM_TOKEN_TTL_SECONDS = 300;

/** Clamp bounds for a requested TTL (Deepgram allows 1..3600). */
const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 3600;

/** What the renderer receives — the minted token and its absolute expiry. */
export interface DeepgramStreamToken {
	/** Short-lived Deepgram JWT; sent by the renderer as `Bearer <token>`. */
	token: string;
	/** Absolute expiry as epoch ms (so the client can re-mint before it lapses). */
	expiresAt: number;
}

export interface MintDeepgramStreamTokenOptions {
	/** Desired TTL in seconds; clamped to Deepgram's supported [30, 3600] range. */
	ttlSeconds?: number;
	/** Injectable fetch (defaults to global) so the mint is unit-testable. */
	fetchImpl?: typeof fetch;
	/** Clock injection for deterministic `expiresAt` in tests. */
	now?: () => number;
}

/**
 * Resolve the real Deepgram API key from the environment (server-only). Returns
 * `null` when unset so the procedure can fail closed with a clear error instead
 * of leaking an undefined into the request. Never logged.
 */
export function resolveDeepgramKey(): string | null {
	return process.env.DEEPGRAM_API_KEY?.trim() || null;
}

/** Whether in-app Deepgram streaming can be minted (the server key is present). */
export function isDeepgramStreamConfigured(): boolean {
	return resolveDeepgramKey() !== null;
}

function clampTtl(ttlSeconds: number): number {
	if (!Number.isFinite(ttlSeconds)) return DEFAULT_STREAM_TOKEN_TTL_SECONDS;
	return Math.min(
		MAX_TTL_SECONDS,
		Math.max(MIN_TTL_SECONDS, Math.floor(ttlSeconds)),
	);
}

/**
 * Mint a short-lived Deepgram streaming token server-side.
 *
 * Fails closed (throws) when `DEEPGRAM_API_KEY` is unset. On a non-2xx grant
 * response it throws WITHOUT echoing the key (only the status + a truncated body
 * are surfaced). On success it returns `{ token, expiresAt }` where `expiresAt`
 * is derived from Deepgram's `expires_in` (falling back to the requested TTL if
 * the field is missing).
 */
export async function mintDeepgramStreamToken(
	opts: MintDeepgramStreamTokenOptions = {},
): Promise<DeepgramStreamToken> {
	const key = resolveDeepgramKey();
	if (!key) {
		// Fail closed: never proceed without the server key, never leak its value.
		throw new Error(
			"DEEPGRAM_API_KEY is not configured for in-app streaming STT",
		);
	}

	const ttlSeconds = clampTtl(
		opts.ttlSeconds ?? DEFAULT_STREAM_TOKEN_TTL_SECONDS,
	);
	const doFetch = opts.fetchImpl ?? fetch;
	const now = opts.now ?? Date.now;

	const response = await doFetch(DEEPGRAM_GRANT_URL, {
		method: "POST",
		headers: {
			// Deepgram websocket/grant auth scheme is `Token <key>` (NOT `Bearer`).
			Authorization: `Token ${key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ ttl_seconds: ttlSeconds }),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		// Surface status + truncated body only — the request key is never included.
		throw new Error(
			`Deepgram grant failed (${response.status}): ${body.slice(0, 300)}`,
		);
	}

	const data = (await response.json()) as {
		access_token?: unknown;
		expires_in?: unknown;
	};

	const token =
		typeof data.access_token === "string" ? data.access_token.trim() : "";
	if (!token) {
		throw new Error("Deepgram grant returned no access_token");
	}

	const expiresInSeconds =
		typeof data.expires_in === "number" && data.expires_in > 0
			? data.expires_in
			: ttlSeconds;

	return {
		token,
		expiresAt: now() + expiresInSeconds * 1000,
	};
}
