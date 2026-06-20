import { logger } from "renderer/lib/logger";
import { env } from "../env.renderer";

let sentryInitialized = false;

export async function initSentry(): Promise<void> {
	if (sentryInitialized) return;

	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}

	try {
		// Dynamic import to avoid bundler issues
		const Sentry = await import("@sentry/electron/renderer");

		Sentry.init({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			tracesSampleRate: 0.1,
		});

		sentryInitialized = true;
		logger.info("[sentry] Initialized in renderer process");
	} catch (error) {
		logger.error("[sentry] Failed to initialize in renderer:", error);
	}
}
