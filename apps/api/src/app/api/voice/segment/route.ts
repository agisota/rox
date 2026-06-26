/**
 * POST /api/voice/segment — the transcribe-worker FINAL-segment ingest endpoint
 * (Live STT Phase-2).
 *
 * The trusted standalone `workers/transcribe-worker` process streams a live voice
 * room through Deepgram and, per FINAL segment, relays it here as a compact,
 * HMAC-signed JSON envelope (`workers/transcribe-worker/src/segment-writer.ts`).
 * This route — MIRRORING the shipped `/api/mesh/inbound` D5 ingress:
 *   1. verifies the HMAC signature + timestamp skew + single-use nonce
 *      (transcript-namespaced `x-rox-transcript-*` headers, independent secret);
 *   2. validates the body with zod (`{ roomName, segment{...} }`);
 *   3. derives the org from the org-scoped room name (never trusts a body org);
 *   4. defense-in-depth: confirms the speaker (`created_by`) is an ACTIVE MEMBER
 *      of that org (mirrors Phase-1 `requireActiveOrgMembership`) — a valid-but-
 *      foreign user id is rejected (403) before any write, since its `users.id`
 *      FK is independent of the org's membership table;
 *   5. inserts one row into `live_transcript_segments` (the SAME table Phase-1
 *      `voice.transcribeChunk` persists to) with `created_by` = the speaker's
 *      LiveKit identity (=== better-auth user id);
 *   6. echoes `{ id }` so the worker's fan-out can dedupe on the durable id.
 *
 * GATED: inert without `TRANSCRIBE_INGEST_SECRET`. With no secret configured the
 * route fails CLOSED (503) rather than accepting unauthenticated writes — exactly
 * how `/api/mesh/inbound` fails closed while its bridge secret is unprovisioned.
 *
 * Response contract:
 *   200 {accepted:true, id}   401 bad-sig / replay / stale / missing headers
 *   400 malformed / invalid   403 speaker not a member   503 not configured
 */

import { apiError } from "@/lib/api-response";
import { sharedSegmentNonceStore } from "@/lib/voice/nonceStore";
import { parseSegmentIngestBody } from "@/lib/voice/parse";
import { createSegmentIngestDb } from "@/lib/voice/persist";
import {
	organizationIdFromRoomName,
	readSegmentHeaders,
	verifySegmentSignature,
} from "@/lib/voice/verify";

function getIngestSecret(): string | null {
	const secret = process.env.TRANSCRIBE_INGEST_SECRET;
	return secret && secret.length > 0 ? secret : null;
}

/** Trim a speaker name, falling back to the identity when blank (Phase-1 parity). */
function normalizeSpeakerName(
	speakerName: string,
	speakerIdentity: string,
): string {
	const trimmed = speakerName.trim();
	return trimmed.length > 0 ? trimmed : speakerIdentity;
}

export async function POST(request: Request) {
	const secret = getIngestSecret();
	if (!secret) {
		// No secret configured → the bridge is not provisioned. Fail closed so an
		// unauthenticated POST can never write a transcript row.
		return apiError("Transcript ingest bridge is not configured", 503);
	}

	// Read the raw body BEFORE parsing — the HMAC is over the exact bytes.
	const rawBody = await request.text();

	const verification = await verifySegmentSignature({
		secret,
		body: rawBody,
		headers: readSegmentHeaders(request.headers),
	});
	if (!verification.ok) {
		return apiError(`Rejected: ${verification.reason}`, 401);
	}

	// Single-use nonce replay guard (inside the timestamp skew window).
	if (!(await sharedSegmentNonceStore.checkAndRecord(verification.nonce))) {
		return apiError("Replay detected", 401);
	}

	let json: unknown;
	try {
		json = JSON.parse(rawBody);
	} catch {
		return apiError("Malformed JSON body", 400);
	}

	const parsed = parseSegmentIngestBody(json);
	if (!parsed.ok) {
		return apiError(`Invalid body: ${parsed.error}`, 400);
	}

	// SECURITY: the persisted org is taken from the org-scoped room name, never a
	// body-supplied field — a forged org cannot ride in on the wire. A room name
	// that does not encode an org is malformed input.
	const organizationId = organizationIdFromRoomName(parsed.body.roomName);
	if (!organizationId) {
		return apiError(
			"Invalid body: roomName is not an org-scoped voice room",
			400,
		);
	}

	// Empty/whitespace text is silence — not persisted (Phase-1 parity).
	const text = parsed.body.segment.text.trim();
	if (text.length === 0) {
		return apiError("Invalid body: segment.text is empty", 400);
	}

	const { segment } = parsed.body;
	const ingestDb = createSegmentIngestDb();

	// DEFENSE-IN-DEPTH: the HMAC secret is the primary boundary, but `createdBy`
	// is the speaker's LiveKit identity (=== a better-auth user id) and its
	// `users.id` FK is independent of the org's membership table — a valid-but-
	// FOREIGN user id would still satisfy the row's FKs. Mirror Phase-1's
	// `requireActiveOrgMembership`: the speaker MUST be an active member of the
	// org the room belongs to, or we reject (403) and never persist the row.
	const isMember = await ingestDb.isActiveOrgMember(
		segment.speakerIdentity,
		organizationId,
	);
	if (!isMember) {
		return apiError(
			"Speaker is not an active member of this organization",
			403,
		);
	}

	const { id } = await ingestDb.insertSegment({
		organizationId,
		roomName: parsed.body.roomName,
		speakerIdentity: segment.speakerIdentity,
		speakerName: normalizeSpeakerName(
			segment.speakerName,
			segment.speakerIdentity,
		),
		text,
		language: segment.language,
		// The LiveKit identity is the better-auth user id (`@rox/rtc` mints
		// `identity: userId`), so it is the honest `created_by` for the row.
		createdBy: segment.speakerIdentity,
		capturedAt: new Date(segment.capturedAt),
	});

	return Response.json({ accepted: true, id }, { status: 200 });
}
