/**
 * Minimal structured logger for the API app.
 *
 * Thin wrapper over `console.*` that preserves the existing output
 * destination and per-call arguments. Each level maps directly to the
 * matching console method so behavior is identical to a raw `console.*`
 * call; the wrapper exists so call sites go through a single seam that can
 * later be swapped for a real log sink without touching every file.
 *
 * Messages in this codebase already carry an inline `[tag]` prefix, so the
 * logger does not add one — it just forwards arguments verbatim.
 */

export interface Logger {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

export const logger: Logger = {
	debug: (...args: unknown[]) => {
		console.debug(...args);
	},
	info: (...args: unknown[]) => {
		console.info(...args);
	},
	warn: (...args: unknown[]) => {
		console.warn(...args);
	},
	error: (...args: unknown[]) => {
		console.error(...args);
	},
};
