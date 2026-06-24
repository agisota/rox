/**
 * Transcribe-worker configuration — resolved from the environment ONLY.
 *
 * Secrets (Deepgram API key, LiveKit API secret, the segment-ingest HMAC secret)
 * are read from `process.env` and NEVER logged, echoed, or returned in any error
 * message. A misconfigured deploy fails fast with a var-name-only error so the
 * operator can fix it without the secret ever being printed.
 *
 * Env keys (reusing the EXISTING LiveKit names from `@rox/rtc/env`):
 *   - DEEPGRAM_API_KEY            (secret) realtime STT auth
 *   - LIVEKIT_API_KEY             (secret) sign the worker's room join token
 *   - LIVEKIT_API_SECRET          (secret) sign the worker's room join token
 *   - LIVEKIT_URL / NEXT_PUBLIC_LIVEKIT_URL   SFU ws url the worker connects to
 *   - ROX_API_URL                 rox API base for the signed segment-persist POST
 *   - TRANSCRIBE_INGEST_SECRET    (secret) HMAC shared secret for that POST
 *   - DEEPGRAM_MODEL              (optional) default "nova-3"
 *   - DEEPGRAM_LANGUAGE           (optional) default "multi"
 */

export interface TranscribeWorkerConfig {
	/** Deepgram realtime API key (secret; never logged). */
	deepgramApiKey: string;
	/** LiveKit server credentials used to mint the worker's join token (secret). */
	livekit: { apiKey: string; apiSecret: string; url: string };
	/** Rox API base url for the signed segment-persist POST. */
	apiUrl: string;
	/** HMAC shared secret for the segment-persist POST (secret; never logged). */
	ingestSecret: string;
	/** Deepgram model id (default "nova-3"). */
	model: string;
	/** Deepgram language (default "multi" for RU/EN mixed rooms). */
	language: string;
}

function req(env: Record<string, string | undefined>, key: string): string {
	const value = env[key]?.trim();
	if (!value) {
		// Var NAME only — never the (absent) value. Required vars fail fast.
		throw new Error(`${key} is not set`);
	}
	return value;
}

/**
 * Build the worker config from the environment. Throws (var-name-only) when a
 * required secret/url is missing. `LIVEKIT_URL` falls back to the public
 * `NEXT_PUBLIC_LIVEKIT_URL` so the worker reuses the app's single SFU url.
 */
export function readConfigFromEnv(
	env: Record<string, string | undefined> = process.env,
): TranscribeWorkerConfig {
	const url =
		env.LIVEKIT_URL?.trim() || env.NEXT_PUBLIC_LIVEKIT_URL?.trim() || "";
	if (!url) {
		throw new Error("LIVEKIT_URL (or NEXT_PUBLIC_LIVEKIT_URL) is not set");
	}

	return {
		deepgramApiKey: req(env, "DEEPGRAM_API_KEY"),
		livekit: {
			apiKey: req(env, "LIVEKIT_API_KEY"),
			apiSecret: req(env, "LIVEKIT_API_SECRET"),
			url,
		},
		apiUrl: req(env, "ROX_API_URL"),
		ingestSecret: req(env, "TRANSCRIBE_INGEST_SECRET"),
		model: env.DEEPGRAM_MODEL?.trim() || "nova-3",
		language: env.DEEPGRAM_LANGUAGE?.trim() || "multi",
	};
}

/**
 * True when the environment carries every secret/url a LIVE run needs. Lets a
 * health endpoint / deploy preflight report readiness WITHOUT throwing and without
 * reading any secret value into a log.
 */
export function isWorkerConfigured(
	env: Record<string, string | undefined> = process.env,
): boolean {
	try {
		readConfigFromEnv(env);
		return true;
	} catch {
		return false;
	}
}
