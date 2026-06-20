/**
 * Structured logger for the Electron main process.
 *
 * Thin wrapper over `console.*` that forwards every argument verbatim, so the
 * stdout/stderr output is byte-identical to the previous raw `console.*` calls
 * this replaced (behavior-preserving). Deliberately does NOT import
 * `electron-log/main`: that module evaluates `electron`'s `app` at load time,
 * which breaks any unit test that imports a main-process module, and would also
 * change output behavior (file logging) versus the original console calls.
 *
 * Use this logger from `src/main/**`.
 */
export const logger = {
	debug: (...args: unknown[]): void => console.debug(...args),
	info: (...args: unknown[]): void => console.info(...args),
	warn: (...args: unknown[]): void => console.warn(...args),
	error: (...args: unknown[]): void => console.error(...args),
};

export default logger;
