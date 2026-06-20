/**
 * POST /api/xmpp/inbound — the XEP-0114 bridge-component ingest endpoint (D4).
 *
 * The external bridge component (deploy wave) relays an inbound `<message>`
 * stanza from the federated XMPP network here as a compact, HMAC-signed JSON
 * envelope. This route:
 *   1. verifies the HMAC signature + timestamp skew + single-use nonce;
 *   2. resolves the recipient JID (`<handle>@xmpp.rox.one`) → owning rox user;
 *   3. dedups on `(xmpp, stanza_id)`;
 *   4. emits a unified-inbox (D1) envelope (`comms_messages`, transport=xmpp)
 *      + buffers the stanza into `xmpp_offline_queue` for store-and-forward.
 *
 * GATED: inert without `XMPP_INBOUND_SECRET`. With no secret configured the
 * route fails closed (503) rather than accepting unauthenticated stanzas —
 * mirrors how the D3 mail inbound + dv.net webhook fail closed while disabled.
 *
 * Response contract:
 *   200 {accepted:true}     401 bad-sig / replay / missing headers
 *   409 {duplicate:true}    404 no-such-jid
 *   400 malformed           503 not configured
 */

import { apiError } from "@/lib/api-response";
import { createXmppIngestDb } from "@/lib/xmpp/drizzleDb";
import { ingestInboundXmpp } from "@/lib/xmpp/ingest";
import { sharedNonceStore } from "@/lib/xmpp/nonceStore";
import { parseInboundXmppEnvelope } from "@/lib/xmpp/parse";
import { readXmppHeaders, verifyXmppSignature } from "@/lib/xmpp/verify";

function getInboundSecret(): string | null {
	const secret = process.env.XMPP_INBOUND_SECRET;
	return secret && secret.length > 0 ? secret : null;
}

export async function POST(request: Request) {
	const secret = getInboundSecret();
	if (!secret) {
		// No secret configured → the route is not provisioned. Fail closed so an
		// unauthenticated POST can never write into the inbox.
		return apiError("Inbound XMPP bridge is not configured", 503);
	}

	// Read the raw body BEFORE parsing — the HMAC is over the exact bytes.
	const rawBody = await request.text();

	const verification = await verifyXmppSignature({
		secret,
		body: rawBody,
		headers: readXmppHeaders(request.headers),
	});
	if (!verification.ok) {
		return apiError(`Rejected: ${verification.reason}`, 401);
	}

	// Single-use nonce replay guard (inside the timestamp skew window). DB-backed
	// so replay protection holds across horizontally-scaled API instances.
	if (!(await sharedNonceStore.checkAndRecord(verification.nonce))) {
		return apiError("Replay detected", 401);
	}

	let json: unknown;
	try {
		json = JSON.parse(rawBody);
	} catch {
		return apiError("Malformed JSON body", 400);
	}

	const parsed = parseInboundXmppEnvelope(json);
	if (!parsed.ok) {
		return apiError(`Invalid envelope: ${parsed.error}`, 400);
	}

	const result = await ingestInboundXmpp(createXmppIngestDb(), parsed.envelope);

	switch (result.kind) {
		case "accepted":
			return Response.json(
				{ accepted: true, messageId: result.messageId },
				{ status: 200 },
			);
		case "duplicate":
			return Response.json(
				{ duplicate: true, stanzaId: result.stanzaId },
				{ status: 409 },
			);
		case "no_such_jid":
			return apiError("No such JID", 404);
	}
}
