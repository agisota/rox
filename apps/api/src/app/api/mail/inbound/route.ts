/**
 * POST /api/mail/inbound — the Cloudflare Email Worker ingest endpoint (D3 P3).
 *
 * The Worker streams the raw `.eml` + attachments to R2, then POSTs a compact,
 * HMAC-signed JSON envelope here. This route:
 *   1. verifies the HMAC signature + timestamp skew + single-use nonce;
 *   2. resolves the recipient handle → owning rox user;
 *   3. spam-scores (SPF/DKIM/DMARC + heuristics) → received vs quarantined;
 *   4. upserts `mail_threads` + `mail_messages` + `mail_attachments` (pointers);
 *   5. emits a unified-inbox (D1) envelope for accepted, non-quarantined mail.
 *
 * GATED: inert without `MAIL_INBOUND_SECRET`. With no secret configured the
 * route fails closed (503) rather than accepting unauthenticated mail — mirrors
 * how the dv.net webhook fails closed while disabled.
 *
 * Response contract (D3 §"Worker contract"):
 *   200 {accepted:true}     401 bad-sig / replay
 *   202 {quarantined:true}  404 no-such-handle
 *   409 {duplicate:true}    503 not configured
 */

import { apiError } from "@/lib/api-response";
import { createMailIngestDb } from "@/lib/mail/drizzleDb";
import { ingestInboundMail } from "@/lib/mail/ingest";
import { sharedNonceStore } from "@/lib/mail/nonceStore";
import { parseInboundEnvelope } from "@/lib/mail/parse";
import { readMailHeaders, verifyMailSignature } from "@/lib/mail/verify";

function getInboundSecret(): string | null {
	const secret = process.env.MAIL_INBOUND_SECRET;
	return secret && secret.length > 0 ? secret : null;
}

export async function POST(request: Request) {
	const secret = getInboundSecret();
	if (!secret) {
		// No secret configured → the route is not provisioned. Fail closed so an
		// unauthenticated POST can never write mail.
		return apiError("Inbound mail is not configured", 503);
	}

	// Read the raw body BEFORE parsing — the HMAC is over the exact bytes.
	const rawBody = await request.text();

	const verification = await verifyMailSignature({
		secret,
		body: rawBody,
		headers: readMailHeaders(request.headers),
	});
	if (!verification.ok) {
		const status = verification.reason === "missing_headers" ? 401 : 401;
		return apiError(`Rejected: ${verification.reason}`, status);
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

	const parsed = parseInboundEnvelope(json);
	if (!parsed.ok) {
		return apiError(`Invalid envelope: ${parsed.error}`, 400);
	}

	const result = await ingestInboundMail(createMailIngestDb(), parsed.envelope);

	switch (result.kind) {
		case "accepted":
			return Response.json(
				{ accepted: true, messageId: result.messageId },
				{ status: 200 },
			);
		case "quarantined":
			return Response.json(
				{ quarantined: true, messageId: result.messageId },
				{ status: 202 },
			);
		case "duplicate":
			return Response.json(
				{ duplicate: true, messageId: result.messageId },
				{ status: 409 },
			);
		case "no_such_handle":
			return apiError("No such handle", 404);
	}
}
