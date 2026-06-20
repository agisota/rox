/**
 * POST /api/mesh/inbound — the mesh relay-watcher ingest endpoint (D5).
 *
 * The trusted relay-watcher process (deploy wave, DEFERRED) watches the Nostr
 * relay pool, unwraps NIP-17 gift-wrapped DMs addressed to rox device keys, and
 * relays each inbound event here as a compact, HMAC-signed JSON envelope. This
 * route:
 *   1. verifies the HMAC signature + timestamp skew + single-use nonce;
 *   2. resolves the recipient device pubkey → owning rox user (active or grace);
 *   3. verifies the SENDER pubkey is a known device (anti-spam);
 *   4. dedups on `(mesh, event_id)`;
 *   5. emits a unified-inbox (D1) envelope (`comms_messages`, transport=mesh)
 *      + writes a `mesh_delivery_log` ledger row (idempotent dedup contract).
 *
 * GATED: inert without `MESH_INBOUND_SECRET`. With no secret configured the route
 * fails closed (503) rather than accepting unauthenticated events — mirrors how
 * the D4 xmpp inbound + D3 mail inbound fail closed while disabled.
 *
 * Response contract:
 *   200 {accepted:true}     401 bad-sig / replay / missing headers
 *   409 {duplicate:true}    404 no-such-pubkey
 *   400 malformed           503 not configured
 */

import { apiError } from "@/lib/api-response";
import { createMeshIngestDb } from "@/lib/mesh/drizzleDb";
import { ingestInboundMesh } from "@/lib/mesh/ingest";
import { sharedNonceStore } from "@/lib/mesh/nonceStore";
import { parseInboundMeshEnvelope } from "@/lib/mesh/parse";
import { readMeshHeaders, verifyMeshSignature } from "@/lib/mesh/verify";

function getInboundSecret(): string | null {
	const secret = process.env.MESH_INBOUND_SECRET;
	return secret && secret.length > 0 ? secret : null;
}

export async function POST(request: Request) {
	const secret = getInboundSecret();
	if (!secret) {
		// No secret configured → the route is not provisioned. Fail closed so an
		// unauthenticated POST can never write into the inbox.
		return apiError("Inbound mesh bridge is not configured", 503);
	}

	// Read the raw body BEFORE parsing — the HMAC is over the exact bytes.
	const rawBody = await request.text();

	const verification = await verifyMeshSignature({
		secret,
		body: rawBody,
		headers: readMeshHeaders(request.headers),
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

	const parsed = parseInboundMeshEnvelope(json);
	if (!parsed.ok) {
		return apiError(`Invalid envelope: ${parsed.error}`, 400);
	}

	const result = await ingestInboundMesh(createMeshIngestDb(), parsed.envelope);

	switch (result.kind) {
		case "accepted":
			return Response.json(
				{ accepted: true, messageId: result.messageId },
				{ status: 200 },
			);
		case "duplicate":
			return Response.json(
				{ duplicate: true, eventId: result.eventId },
				{ status: 409 },
			);
		case "no_such_pubkey":
			return apiError("No such mesh pubkey", 404);
	}
}
