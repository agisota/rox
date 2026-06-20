import { Receiver } from "@upstash/qstash";

import { env } from "@/env";

/**
 * Shared QStash signature verification for queue-job routes.
 *
 * Replaces the per-route `new Receiver(...)` + read-body + `verify(...)` + 401
 * boilerplate. Each route's exact behavior is preserved through `options`:
 * the dev-bypass, the way a verify rejection is handled, the failure message,
 * and the optional log call all stay route-specific — this util only owns the
 * common core (build the Receiver from env, read the raw body, reject a missing
 * signature, and run `receiver.verify`).
 */

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

/**
 * Whether unsigned QStash bodies may be accepted (local-dev escape hatch).
 *
 * Fail-closed by default. Bypass is allowed ONLY when BOTH hold:
 *   1. `ALLOW_UNSIGNED_QSTASH === "true"` — an explicit, intentional opt-in.
 *      The previous `NODE_ENV === "development"` check defaulted to `true`
 *      (env.ts defaults NODE_ENV to "development"), so an unconfigured prod
 *      deploy silently skipped verification. This requires a deliberate flag.
 *   2. No QStash signing keys are configured. If signing keys exist we can —
 *      and therefore must — verify, so the bypass can never weaken an
 *      environment that is actually capable of verifying signatures.
 *
 * Read from `process.env` (not the parsed `env`) for the signing keys so a dev
 * who intentionally clears them to simulate the no-key path is honored even
 * though the zod schema marks them required.
 */
export function isQstashDevBypassAllowed(
	source: Record<string, string | undefined> = process.env,
): boolean {
	if (source.ALLOW_UNSIGNED_QSTASH !== "true") return false;
	const hasSigningKeys = Boolean(
		source.QSTASH_CURRENT_SIGNING_KEY || source.QSTASH_NEXT_SIGNING_KEY,
	);
	return !hasSigningKeys;
}

/**
 * How a thrown/rejected `receiver.verify` should be handled:
 * - `"throw"`: let the rejection propagate (route had a bare `await verify`).
 * - `"false"`: swallow it and treat the request as unverified (route used
 *   `.catch(() => false)`), then fall through to the standard 401.
 * - `"respond"`: swallow it and return a 401 immediately with `errorMessage`
 *   (route wrapped `verify` in try/catch and returned its own response).
 */
type VerifyErrorMode = "throw" | "false" | "respond";

interface VerifyQstashOptions {
	/** Absolute URL the QStash message was published to (used for verification). */
	url: string;
	/**
	 * When true, skip signature verification entirely and accept the body
	 * (matches routes that bypass verification in development because QStash
	 * can't reach localhost). Pass the route's own `env.NODE_ENV === "development"`.
	 */
	devBypass?: boolean;
	/** Rejection handling strategy; defaults to `"throw"` (bare await). */
	onError?: VerifyErrorMode;
	/**
	 * Body message for the 401 returned when `verify` resolves `false`
	 * (signature present but invalid). Defaults to "Invalid signature".
	 */
	errorMessage?: string;
	/**
	 * Body message for the 401 returned by `onError: "respond"` when `verify`
	 * *throws*. Some routes distinguish this from the invalid-signature message
	 * (e.g. "Signature verification failed"). Defaults to `errorMessage`.
	 */
	verifyErrorMessage?: string;
	/** Optional logger invoked with the caught error before the 401 is built. */
	logError?: (error: unknown) => void;
}

export type VerifyQstashResult =
	| { ok: true; body: string }
	| { ok: false; response: Response };

/**
 * Reads the raw request body, verifies the `upstash-signature` header, and
 * returns either the verified body or a ready-to-return 401 `Response`. On a
 * dev bypass the body is returned without verification.
 */
export async function verifyQstash(
	request: Request,
	options: VerifyQstashOptions,
): Promise<VerifyQstashResult> {
	const {
		url,
		devBypass = false,
		onError = "throw",
		errorMessage = "Invalid signature",
		verifyErrorMessage = errorMessage,
		logError,
	} = options;

	const body = await request.text();

	if (devBypass) {
		return { ok: true, body };
	}

	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return {
			ok: false,
			response: Response.json({ error: "Missing signature" }, { status: 401 }),
		};
	}

	let valid: boolean;
	if (onError === "throw") {
		valid = await receiver.verify({ body, signature, url });
	} else {
		try {
			valid = await receiver.verify({ body, signature, url });
		} catch (error) {
			logError?.(error);
			if (onError === "respond") {
				return {
					ok: false,
					response: Response.json(
						{ error: verifyErrorMessage },
						{ status: 401 },
					),
				};
			}
			valid = false;
		}
	}

	if (!valid) {
		return {
			ok: false,
			response: Response.json({ error: errorMessage }, { status: 401 }),
		};
	}

	return { ok: true, body };
}
