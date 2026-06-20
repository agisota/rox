/**
 * Parse + validate the JSON event the mesh relay-watcher POSTs to
 * `/api/mesh/inbound`.
 *
 * The relay-watcher has already destructured a Nostr event (and unwrapped the
 * NIP-17 gift-wrap) into fields; this narrows the untrusted body into the typed
 * {@link MeshRawInbound} the pure `@rox/comms-core` {@link MeshAdapter} consumes.
 * Mirrors `lib/xmpp/parse.ts`: a discriminated result so the route returns a 400
 * with a precise reason rather than throwing on a malformed payload.
 */

import type { MeshRawInbound } from "@rox/comms-core";

export type ParseResult =
	| { ok: true; envelope: MeshRawInbound }
	| { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function optString(v: unknown): string | null {
	return typeof v === "string" && v.length > 0 ? v : null;
}

function optNumber(v: unknown): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function parseInboundMeshEnvelope(json: unknown): ParseResult {
	if (!isObject(json)) return { ok: false, error: "body is not an object" };

	const fromPubkey = json.fromPubkey;
	const toPubkey = json.toPubkey;
	const body = json.body;
	if (typeof fromPubkey !== "string" || fromPubkey.length === 0) {
		return { ok: false, error: "missing fromPubkey" };
	}
	if (typeof toPubkey !== "string" || toPubkey.length === 0) {
		return { ok: false, error: "missing toPubkey" };
	}
	if (typeof body !== "string") {
		return { ok: false, error: "missing body" };
	}

	const sentAtRaw = json.sentAt;
	const sentAt =
		typeof sentAtRaw === "number" || typeof sentAtRaw === "string"
			? sentAtRaw
			: undefined;

	return {
		ok: true,
		envelope: {
			fromPubkey,
			toPubkey,
			body,
			eventId: optString(json.eventId),
			thread: optString(json.thread),
			replyToEventId: optString(json.replyToEventId),
			subject: optString(json.subject),
			kind: optNumber(json.kind),
			relayUrl: optString(json.relayUrl),
			...(sentAt !== undefined ? { sentAt } : {}),
		},
	};
}
