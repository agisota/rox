/**
 * Build-time constants baked into the CLI binary via `Bun.build({ define })`
 * (see `cli.config.ts`). In dev mode, falls back to actual process.env so
 * local dev can override these.
 */

export const env = {
	RELAY_URL: process.env.RELAY_URL || "https://relay.rox.one",
	ROX_API_URL: process.env.ROX_API_URL || "https://api.rox.one",
	ROX_WEB_URL: process.env.ROX_WEB_URL || "https://app.rox.one",
	VERSION: process.env.ROX_VERSION || "0.0.0-dev",
};
