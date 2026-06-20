/**
 * Structured logger for the Electron main process.
 *
 * Thin wrapper over `electron-log/main` (already the established logging
 * dependency in this app — see auto-updater, persistence, windows/main).
 * Exposes the standard `debug`/`info`/`warn`/`error` levels and forwards every
 * argument verbatim, so stdout/file/DevTools output is preserved exactly as
 * with the previous raw `console.*` calls.
 *
 * Use this logger from `src/main/**`. Renderer code must use
 * `renderer/lib/logger` instead — `electron-log/main` is main-process only.
 */
import log from "electron-log/main";

export const logger = {
	debug: (...args: unknown[]): void => log.debug(...args),
	info: (...args: unknown[]): void => log.info(...args),
	warn: (...args: unknown[]): void => log.warn(...args),
	error: (...args: unknown[]): void => log.error(...args),
};

export default logger;
