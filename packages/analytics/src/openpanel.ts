/**
 * Minimal, dependency-free OpenPanel adapter (openpanel epic).
 *
 * Rather than pull in `@openpanel/sdk` (and its transitive browser/node split),
 * this talks to the OpenPanel ingest HTTP API directly over `fetch`, which is
 * available in every Rox runtime (Node 20, Bun, Electron renderer, browsers).
 * It is intentionally fire-and-forget: failures are swallowed so analytics can
 * never break a product code path.
 */

import type { OpenPanelEnv } from "./env";
import { isOpenPanelServerEnabled, resolveOpenPanelEnv } from "./env";

export interface OpenPanelTrackPayload {
	event: string;
	distinctId?: string;
	properties?: Record<string, unknown>;
}

export interface OpenPanelIdentifyPayload {
	distinctId: string;
	traits?: Record<string, unknown>;
}

export interface OpenPanelClient {
	readonly enabled: boolean;
	track(payload: OpenPanelTrackPayload): Promise<void>;
	identify(payload: OpenPanelIdentifyPayload): Promise<void>;
}

type IngestBody =
	| { type: "track"; payload: Record<string, unknown> }
	| { type: "identify"; payload: Record<string, unknown> };

/**
 * Per-request ceiling for ingest calls. Even though `send` is fire-and-forget,
 * an unbounded `fetch` against a stalled ingest endpoint can pile up sockets;
 * `AbortSignal.timeout` caps each attempt and the failure is swallowed below.
 */
const OPENPANEL_REQUEST_TIMEOUT_MS = 10_000;

/** A no-op client used when OpenPanel is not configured. */
const NOOP_CLIENT: OpenPanelClient = {
	enabled: false,
	async track() {},
	async identify() {},
};

/**
 * Creates a server-side OpenPanel client. Returns a no-op client when the
 * required credentials are absent so callers never need to null-check.
 */
export function createOpenPanelServerClient(
	env: OpenPanelEnv = resolveOpenPanelEnv(),
): OpenPanelClient {
	if (!isOpenPanelServerEnabled(env) || !env.clientId || !env.clientSecret) {
		return NOOP_CLIENT;
	}

	const clientId = env.clientId;
	const clientSecret = env.clientSecret;
	const endpoint = `${env.apiUrl.replace(/\/$/, "")}/track`;

	async function send(body: IngestBody): Promise<void> {
		try {
			await fetch(endpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"openpanel-client-id": clientId,
					"openpanel-client-secret": clientSecret,
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(OPENPANEL_REQUEST_TIMEOUT_MS),
			});
		} catch {
			// Fire-and-forget: analytics must never throw into product code.
		}
	}

	return {
		enabled: true,
		async track({ event, distinctId, properties }) {
			await send({
				type: "track",
				payload: {
					name: event,
					profileId: distinctId,
					properties: properties ?? {},
				},
			});
		},
		async identify({ distinctId, traits }) {
			await send({
				type: "identify",
				payload: {
					profileId: distinctId,
					properties: traits ?? {},
				},
			});
		},
	};
}
