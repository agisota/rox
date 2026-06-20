/**
 * Structured logger for the Electron renderer process.
 *
 * Thin, behavior-preserving wrapper around `console.*`. Renderer code must stay
 * browser-compatible (no Node builtins, no `electron-log/main`), so this logger
 * forwards every argument verbatim to the matching `console` method — identical
 * DevTools output to the previous raw `console.*` calls.
 *
 * Use this logger from `src/renderer/**`.
 */
export const logger = {
	debug: (...args: unknown[]): void => console.debug(...args),
	info: (...args: unknown[]): void => console.info(...args),
	warn: (...args: unknown[]): void => console.warn(...args),
	error: (...args: unknown[]): void => console.error(...args),
};

export default logger;
