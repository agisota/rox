/**
 * Live transcript chunk → segment mapping — Streaming-STT Phase-1.
 *
 * Pure helpers shared by the `voice.transcribeChunk` mutation: they validate the
 * room name and shape a transcription result into the `live_transcript_segments`
 * insert row + the client return payload. Kept side-effect-free (no DB, no Groq)
 * so the mapping is unit-testable on its own; the router supplies the transcribed
 * text + the resolved org/user and persists the returned row.
 */

import type { InsertLiveTranscriptSegment } from "@rox/db/schema";
import { organizationIdFromRoomName } from "@rox/rtc";

/** Resolved identity/context the router attaches to a persisted segment. */
export interface LiveTranscriptChunkContext {
	organizationId: string;
	createdBy: string;
	roomName: string;
	speakerIdentity: string;
	speakerName: string;
	/** Epoch ms when the chunk's recording window ended (client-supplied). */
	capturedAt: number;
}

/**
 * Validate that `roomName` is a well-formed org-scoped voice room AND that its
 * embedded org matches the caller's active org. Returns the parsed org id, or
 * `null` when the name is malformed or cross-org (the router rejects on null).
 *
 * This is the security seam: a client could send any `roomName`, so we never
 * trust it — the persisted org is the caller's verified active org, and we
 * additionally require the room name to encode that SAME org so a participant
 * cannot write segments into another org's room.
 */
export function resolveTranscriptRoomOrg(
	roomName: string,
	activeOrganizationId: string,
): string | null {
	const roomOrg = organizationIdFromRoomName(roomName);
	if (!roomOrg) return null;
	if (roomOrg !== activeOrganizationId) return null;
	return roomOrg;
}

/** Trim + collapse a speaker name, falling back to the identity when blank. */
export function normalizeSpeakerName(
	speakerName: string,
	speakerIdentity: string,
): string {
	const trimmed = speakerName.trim();
	return trimmed.length > 0 ? trimmed : speakerIdentity;
}

/**
 * Build the `live_transcript_segments` insert row from a transcription result and
 * the resolved chunk context. Returns `null` when the transcribed text is empty
 * (silence/noise) so the caller skips the insert and reports an empty segment.
 */
export function buildLiveTranscriptSegmentInsert(
	rawText: string,
	language: string | null,
	ctx: LiveTranscriptChunkContext,
): InsertLiveTranscriptSegment | null {
	const text = rawText.trim();
	if (text.length === 0) return null;
	return {
		organizationId: ctx.organizationId,
		roomName: ctx.roomName,
		speakerIdentity: ctx.speakerIdentity,
		speakerName: normalizeSpeakerName(ctx.speakerName, ctx.speakerIdentity),
		text,
		language,
		createdBy: ctx.createdBy,
		capturedAt: new Date(ctx.capturedAt),
	};
}
