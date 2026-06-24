/**
 * Parse + validate the JSON body the transcribe-worker POSTs to
 * `POST /api/voice/segment` (Live STT Phase-2).
 *
 * The shape MUST match the worker's `SegmentPersistPayload`
 * (`workers/transcribe-worker/src/segment-writer.ts`): a `roomName` plus the
 * `TranscriptWireSegment` the worker fans out on the LiveKit data channel —
 * `{ id, speakerIdentity, speakerName, text, language, capturedAt }`. The worker
 * persists ONLY finals, so there is no `isFinal`/partial flag on the wire; finals
 * are the only thing this table stores.
 *
 * Mirrors `lib/mesh/parse.ts`: a discriminated result so the route returns a 400
 * with a precise reason rather than throwing on a malformed payload. Validation
 * is via zod (the API's standard validator).
 *
 * SECURITY: `speakerIdentity` is the LiveKit participant identity, which is the
 * better-auth user id (`@rox/rtc` mints `identity: userId`); the route uses it as
 * the row's `created_by`, so it is constrained to a uuid here. The organization is
 * NOT taken from the body — the route derives it from the org-scoped `roomName` —
 * so a forged org can never ride in on this payload.
 */

import { z } from "zod";

/** One finalized transcript segment — byte-compatible with `TranscriptWireSegment`. */
export const transcriptWireSegmentSchema = z.object({
	id: z.string().min(1),
	// LiveKit identity === better-auth user id (becomes `created_by`).
	speakerIdentity: z.string().uuid(),
	speakerName: z.string(),
	text: z.string(),
	language: z.string().nullable(),
	// Epoch ms when the segment was captured (drives chronological ordering).
	capturedAt: z.number().finite(),
});

/** The full ingest body: room context + the wire segment. */
export const segmentIngestBodySchema = z.object({
	roomName: z.string().min(1),
	segment: transcriptWireSegmentSchema,
});

export type SegmentIngestBody = z.infer<typeof segmentIngestBodySchema>;
export type TranscriptWireSegment = z.infer<typeof transcriptWireSegmentSchema>;

export type ParseResult =
	| { ok: true; body: SegmentIngestBody }
	| { ok: false; error: string };

/** Narrow the untrusted JSON into the typed ingest body, or a 400-able reason. */
export function parseSegmentIngestBody(json: unknown): ParseResult {
	const result = segmentIngestBodySchema.safeParse(json);
	if (!result.success) {
		const first = result.error.issues[0];
		const path = first?.path.join(".") ?? "body";
		const message = first?.message ?? "invalid body";
		return { ok: false, error: `${path}: ${message}` };
	}
	return { ok: true, body: result.data };
}
