/**
 * Structured logger for the Electron main process.
 *
 * Thin wrapper over `console.*` that forwards every (scrubbed) argument, so the
 * stdout/stderr output is byte-identical to the previous raw `console.*` calls
 * this replaced for non-secret logs (behavior-preserving). Deliberately does
 * NOT import `electron-log/main`: that module evaluates `electron`'s `app` at
 * load time, which breaks any unit test that imports a main-process module, and
 * would also change output behavior (file logging) versus the original console
 * calls.
 *
 * Before forwarding, every argument is deep-scrubbed: the value of any object
 * key whose name looks like a secret (token, secret, password, apiKey,
 * authorization, accessToken, signingKey, privateKey, bearer) is replaced with
 * a redaction marker. This stops accidental secret leakage when an integration
 * config, headers object, or error is passed to a log call. Mirrors the same
 * redaction used by the API logger (`apps/api/src/lib/logger.ts`).
 *
 * Use this logger from `src/main/**`.
 */

const REDACTED = "[REDACTED]";

const SECRET_KEY_PATTERN =
	/token|secret|password|apikey|authorization|accesstoken|signingkey|privatekey|bearer/i;

/**
 * Recursively copy `value`, replacing the value of any secret-looking key with
 * `[REDACTED]`. Cycles are tracked via `seen` so a self-referential object does
 * not recurse forever. Non-plain values (primitives, functions, class
 * instances we don't special-case) are returned as-is — we only ever descend
 * into plain objects and arrays so we never mutate caller state.
 */
function scrub(value: unknown, seen: WeakSet<object>): unknown {
	if (value === null || typeof value !== "object") {
		return value;
	}

	if (seen.has(value)) {
		return value;
	}
	seen.add(value);

	if (Array.isArray(value)) {
		return value.map((item) => scrub(item, seen));
	}

	// Preserve Error objects' message/name/stack rather than flattening them.
	if (value instanceof Error) {
		return value;
	}

	const out: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(value)) {
		out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : scrub(val, seen);
	}
	return out;
}

/** Scrub one log argument, allocating a fresh `seen` set per top-level arg. */
function scrubArg(arg: unknown): unknown {
	return scrub(arg, new WeakSet());
}

export const logger = {
	debug: (...args: unknown[]): void => console.debug(...args.map(scrubArg)),
	info: (...args: unknown[]): void => console.info(...args.map(scrubArg)),
	warn: (...args: unknown[]): void => console.warn(...args.map(scrubArg)),
	error: (...args: unknown[]): void => console.error(...args.map(scrubArg)),
};

export default logger;
