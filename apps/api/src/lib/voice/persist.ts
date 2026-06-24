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
	members,
} from "@rox/db/schema";
import { and, eq } from "drizzle-orm";

/** The narrow DB surface the segment ingest needs (injectable for tests). */
export interface SegmentIngestDb {
	/**
	 * Defense-in-depth: is `userId` an active member of `organizationId`?
	 *
	 * The HMAC secret is the primary boundary, but the route derives `createdBy`
	 * from the speaker's LiveKit identity, whose `users.id` FK is independent of
	 * the org's `members` table — a valid-but-FOREIGN user id would otherwise
	 * satisfy `live_transcript_segments`' FKs and land a row attributed to a user
	 * who never belonged to that org. This gate mirrors Phase-1's
	 * `findOrgMembership` (`@rox/db/utils`): membership is presence of a `members`
	 * row for the `(organizationId, userId)` pair (there is no `status`/`active`
	 * column — a row IS the active membership). Returns `false` (fail closed) when
	 * no such row exists.
	 */
	isActiveOrgMember(userId: string, organizationId: string): Promise<boolean>;
	/** Insert one finalized segment; resolves the durable row id. */
	insertSegment(row: InsertLiveTranscriptSegment): Promise<{ id: string }>;
}

/** Build the production {@link SegmentIngestDb} bound to the live Drizzle client. */
export function createSegmentIngestDb(): SegmentIngestDb {
	return {
		async isActiveOrgMember(userId, organizationId) {
			// Mirrors Phase-1 `findOrgMembership`: an `auth.members` row for the
			// (org, user) pair IS the membership. Presence ⇒ active; absence ⇒ reject.
			const [row] = await db
				.select({ id: members.id })
				.from(members)
				.where(
					and(
						eq(members.organizationId, organizationId),
						eq(members.userId, userId),
					),
				)
				.limit(1);
			return Boolean(row);
		},

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
