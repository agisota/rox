/**
 * Minimal structured logger for the API app.
 *
 * Thin wrapper over `console.*` that preserves the existing output
 * destination and per-call level. Each level maps directly to the matching
 * console method so behavior is identical to a raw `console.*` call; the
 * wrapper exists so call sites go through a single seam that can later be
 * swapped for a real log sink without touching every file.
 *
 * Messages in this codebase already carry an inline `[tag]` prefix, so the
 * logger does not add one — it just forwards (scrubbed) arguments verbatim.
 *
 * Before forwarding, every argument is deep-scrubbed: the value of any object
 * key whose name looks like a secret (token, secret, password, apiKey,
 * authorization, accessToken, signingKey, privateKey, bearer) is replaced with
 * a redaction marker. This stops accidental secret leakage when an integration
 * config, headers object, or error is passed to a log call.
 */

const REDACTED = "[REDACTED]";

const SECRET_KEY_PATTERN =
	/token|secret|password|apikey|authorization|accesstoken|signingkey|privatekey|bearer/i;

export interface Logger {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

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

	// Preserve Error objects' message/name/stack but scrub any enumerable
	// custom fields a secret might have been attached to.
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

export const logger: Logger = {
	debug: (...args: unknown[]) => {
		console.debug(...args.map(scrubArg));
	},
	info: (...args: unknown[]) => {
		console.info(...args.map(scrubArg));
	},
	warn: (...args: unknown[]) => {
		console.warn(...args.map(scrubArg));
	},
	error: (...args: unknown[]) => {
		console.error(...args.map(scrubArg));
	},
};
