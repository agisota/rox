/**
 * Drizzle-backed persistence for the transcribe-worker segment ingest (Live STT
 * Phase-2). The route's auth + validation is pure and DB-free; this is the narrow
 * seam where a validated segment becomes one `live_transcript_segments` INSERT.
 *
 * Reuses the EXACT table + row shape the Phase-1 `voice.transcribeChunk` mutation
 * writes (`packages/trpc/src/lib/voice/live-transcript.ts` →
 * `buildLiveTranscriptSegmentInsert`), so the streaming finals from the worker and
 * the Phase-1 chunked finals share ONE append-only transcript log. No new table /
 * migration — `live_transcript_segments` already exists (migration 0097).
 *
 * Mirrors `lib/mesh/drizzleDb.ts`: the route depends on the narrow
 * {@link SegmentIngestDb} port (structurally satisfied by both this real adapter
 * and the route test's fake), and `createSegmentIngestDb()` binds it to the live
 * Drizzle client.
 *
 * IDENTITY/ORG: the caller (route) resolves `organizationId` from the org-scoped
 * room name and `createdBy` from the segment's `speakerIdentity` (the LiveKit
 * identity === better-auth user id). Both are real FK targets
 * (`live_transcript_segments_organization_id_*` / `_created_by_*`), so a row only
 * lands for a real org + a real speaker.
 */

import { db } from "@rox/db/client";
import {
	type InsertLiveTranscriptSegment,
	liveTranscriptSegments,
} from "@rox/db/schema";

/** The narrow DB surface the segment ingest needs (injectable for tests). */
export interface SegmentIngestDb {
	/** Insert one finalized segment; resolves the durable row id. */
	insertSegment(row: InsertLiveTranscriptSegment): Promise<{ id: string }>;
}

/** Build the production {@link SegmentIngestDb} bound to the live Drizzle client. */
export function createSegmentIngestDb(): SegmentIngestDb {
	return {
		async insertSegment(row) {
			const [inserted] = await db
				.insert(liveTranscriptSegments)
				.values(row)
				.returning({ id: liveTranscriptSegments.id });
			if (!inserted)
				throw new Error("Failed to insert live transcript segment");
			return { id: inserted.id };
		},
	};
}
