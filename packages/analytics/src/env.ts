/**
 * OpenPanel configuration resolved from the environment. Kept dependency-light
 * (no `@t3-oss/env-core`) so this package can be imported from both browser and
 * server bundles. Apps validate the same vars in their own `env.ts`.
 */

export interface OpenPanelEnv {
	/** Public client id — safe to expose to the browser. */
	clientId: string | undefined;
	/** Server-only secret used for the export/ingest API. */
	clientSecret: string | undefined;
	/** OpenPanel API base URL (self-hosted or cloud). */
	apiUrl: string;
}

const DEFAULT_OPENPANEL_API_URL = "https://api.openpanel.dev";

function read(key: string): string | undefined {
	const value = typeof process !== "undefined" ? process.env?.[key] : undefined;
	return value && value.length > 0 ? value : undefined;
}

export function resolveOpenPanelEnv(): OpenPanelEnv {
	return {
		clientId: read("NEXT_PUBLIC_OPENPANEL_CLIENT_ID"),
		clientSecret: read("OPENPANEL_CLIENT_SECRET"),
		apiUrl: read("OPENPANEL_API_URL") ?? DEFAULT_OPENPANEL_API_URL,
	};
}

/** True when OpenPanel is configured enough to emit server-side events. */
export function isOpenPanelServerEnabled(env: OpenPanelEnv): boolean {
	return Boolean(env.clientId && env.clientSecret);
}

/** True when OpenPanel is configured enough to init in the browser. */
export function isOpenPanelClientEnabled(env: OpenPanelEnv): boolean {
	return Boolean(env.clientId);
}
