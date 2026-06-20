/**
 * Parse + validate the JSON event the XMPP bridge POSTs to `/api/xmpp/inbound`.
 *
 * The bridge has already destructured a `<message>` stanza into fields; this
 * narrows the untrusted body into the typed {@link XmppRawInbound} the pure
 * `@rox/comms-core` {@link XmppAdapter} consumes. Mirrors `lib/mail/parse.ts`:
 * a discriminated result so the route returns a 400 with a precise reason rather
 * than throwing on a malformed payload.
 */

import type { XmppRawInbound } from "@rox/comms-core";

export type ParseResult =
	| { ok: true; envelope: XmppRawInbound }
	| { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function optString(v: unknown): string | null {
	return typeof v === "string" && v.length > 0 ? v : null;
}

export function parseInboundXmppEnvelope(json: unknown): ParseResult {
	if (!isObject(json)) return { ok: false, error: "body is not an object" };

	const from = json.from;
	const to = json.to;
	const body = json.body;
	if (typeof from !== "string" || from.length === 0) {
		return { ok: false, error: "missing from" };
	}
	if (typeof to !== "string" || to.length === 0) {
		return { ok: false, error: "missing to" };
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
			from,
			to,
			body,
			stanzaId: optString(json.stanzaId),
			thread: optString(json.thread),
			replyToStanzaId: optString(json.replyToStanzaId),
			subject: optString(json.subject),
			stanzaType: optString(json.stanzaType),
			...(sentAt !== undefined ? { sentAt } : {}),
		},
	};
}
