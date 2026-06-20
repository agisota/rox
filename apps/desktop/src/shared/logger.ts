/**
 * Structured logger for code under `src/lib/**` (Electron main-process tRPC
 * routers and helpers).
 *
 * These modules run in the main process, but their barrel
 * (`lib/trpc/routers`) is type-imported by the renderer for `AppRouter`. To
 * keep that type graph free of any main-only runtime dependency, this logger is
 * a thin, behavior-preserving wrapper around `console.*` rather than
 * `electron-log/main`. Every argument is forwarded verbatim to the matching
 * `console` method, so stdout output is identical to the previous raw
 * `console.*` calls.
 */
export const logger = {
	debug: (...args: unknown[]): void => console.debug(...args),
	info: (...args: unknown[]): void => console.info(...args),
	warn: (...args: unknown[]): void => console.warn(...args),
	error: (...args: unknown[]): void => console.error(...args),
};

export default logger;
