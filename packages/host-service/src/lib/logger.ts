/**
 * Minimal structured logger for @rox/host-service.
 *
 * Thin wrapper around the console.* methods. Each level maps 1:1 to the
 * matching console method, preserving the call signature (message + args)
 * so behavior is identical to the previous direct console.* usage. This
 * gives a single seam for future routing/formatting without changing any
 * call sites again.
 */
export interface Logger {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

export const logger: Logger = {
	debug: (...args: unknown[]): void => {
		console.debug(...args);
	},
	info: (...args: unknown[]): void => {
		console.info(...args);
	},
	warn: (...args: unknown[]): void => {
		console.warn(...args);
	},
	error: (...args: unknown[]): void => {
		console.error(...args);
	},
};
