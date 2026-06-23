import { db } from "@rox/db/client";
import { liveTranscriptSegments, voiceTranscriptions } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	buildLiveTranscriptSegmentInsert,
	resolveTranscriptRoomOrg,
} from "../../lib/voice/live-transcript";
import { postprocessPrompt } from "../../lib/voice/postprocess";
import { isVoiceConfigured, transcribeAudio } from "../../lib/voice/whisper";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

export const voiceRouter = {
	/** Whether server-side dictation (Groq Whisper) is available. */
	isConfigured: protectedProcedure.query(() => ({
		configured: isVoiceConfigured(),
	})),

	/**
	 * Transcribe a dictated audio clip with Groq Whisper (auto-language), then
	 * optionally R1-post-process it into formatted RU/EN prompts. Records the
	 * result in voice_transcriptions for the session history.
	 */
	transcribe: protectedProcedure
		.input(
			z.object({
				audioBase64: z.string().min(1).max(15_000_000),
				mimeType: z.string().default("audio/webm"),
				durationMs: z.number().int().nonnegative().optional(),
				postprocess: z.boolean().default(true),
				/**
				 * Free-text context the user supplied in advance (Settings → Voice →
				 * "Контекст для агента"). Appended to the post-process system prompt
				 * so the model can resolve names/jargon/intent. Optional.
				 */
				voiceAgentContext: z.string().max(10_000).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const buffer = Buffer.from(input.audioBase64, "base64");

			const transcription = await transcribeAudio(buffer, input.mimeType);
			const processed = input.postprocess
				? await postprocessPrompt(transcription.text, input.voiceAgentContext)
				: null;

			const [row] = await db
				.insert(voiceTranscriptions)
				.values({
					organizationId,
					createdBy: ctx.session.user.id,
					rawText: transcription.text,
					processedRu: processed?.ru ?? null,
					processedEn: processed?.en ?? null,
					language: transcription.language,
					durationMs: input.durationMs ?? null,
					status: processed ? "processed" : "transcribed",
				})
				.returning({ id: voiceTranscriptions.id });

			return {
				id: row?.id ?? "",
				rawText: transcription.text,
				language: transcription.language,
				processed,
			};
		}),

	/**
	 * Live Transcript Phase-1 — transcribe ONE mic chunk from a live voice room
	 * and persist the finalized segment to `live_transcript_segments`.
	 *
	 * Reuses the existing Groq Whisper path (`transcribeAudio`) — no new infra.
	 * The client slices its own microphone into N-second chunks and calls this per
	 * chunk; the room name is verified to encode the caller's active org so a
	 * participant can only write into their own org's room. Silence (empty text)
	 * is not persisted and returns `{ id: "", text: "" }` so the client can skip
	 * folding it. Returns the row id so clients dedupe on fan-out.
	 */
	transcribeChunk: protectedProcedure
		.input(
			z.object({
				roomName: z.string().min(1).max(512),
				audioBase64: z.string().min(1).max(15_000_000),
				mimeType: z.string().default("audio/webm"),
				speakerIdentity: z.string().min(1).max(256),
				speakerName: z.string().max(256).default(""),
				/** Epoch ms when the chunk's recording window ended. */
				capturedAt: z.number().int().nonnegative(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			// Never trust the client's room name: require it to encode the caller's
			// verified active org (rejects malformed + cross-org writes).
			const roomOrg = resolveTranscriptRoomOrg(input.roomName, organizationId);
			if (!roomOrg) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Room name does not match your active organization.",
				});
			}

			const buffer = Buffer.from(input.audioBase64, "base64");
			const transcription = await transcribeAudio(buffer, input.mimeType);

			const insert = buildLiveTranscriptSegmentInsert(
				transcription.text,
				transcription.language,
				{
					organizationId,
					createdBy: ctx.session.user.id,
					roomName: input.roomName,
					speakerIdentity: input.speakerIdentity,
					speakerName: input.speakerName,
					capturedAt: input.capturedAt,
				},
			);

			// Silence/noise → nothing to persist; the client drops an empty segment.
			if (!insert) {
				return { id: "", text: "", language: transcription.language };
			}

			const [row] = await db
				.insert(liveTranscriptSegments)
				.values(insert)
				.returning({ id: liveTranscriptSegments.id });

			return {
				id: row?.id ?? "",
				text: insert.text,
				language: transcription.language,
			};
		}),

	/**
	 * Replay a live room's finalized transcript segments (oldest → newest). Lets a
	 * late-joining participant backfill the panel from durable storage; capped and
	 * scoped to the caller's active org (the room name must encode that org).
	 */
	listSegments: protectedProcedure
		.input(
			z.object({
				roomName: z.string().min(1).max(512),
				limit: z.number().int().min(1).max(500).default(200),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const roomOrg = resolveTranscriptRoomOrg(input.roomName, organizationId);
			if (!roomOrg) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Room name does not match your active organization.",
				});
			}

			return db
				.select({
					id: liveTranscriptSegments.id,
					roomName: liveTranscriptSegments.roomName,
					speakerIdentity: liveTranscriptSegments.speakerIdentity,
					speakerName: liveTranscriptSegments.speakerName,
					text: liveTranscriptSegments.text,
					language: liveTranscriptSegments.language,
					capturedAt: liveTranscriptSegments.capturedAt,
				})
				.from(liveTranscriptSegments)
				.where(
					and(
						eq(liveTranscriptSegments.organizationId, organizationId),
						eq(liveTranscriptSegments.roomName, input.roomName),
					),
				)
				.orderBy(asc(liveTranscriptSegments.capturedAt))
				.limit(input.limit);
		}),

	/** List the signed-in user's dictation history, newest first. */
	listHistory: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(100).default(50) })
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return db
				.select()
				.from(voiceTranscriptions)
				.where(
					and(
						eq(voiceTranscriptions.organizationId, organizationId),
						eq(voiceTranscriptions.createdBy, ctx.session.user.id),
					),
				)
				.orderBy(desc(voiceTranscriptions.createdAt))
				.limit(input?.limit ?? 50);
		}),
} satisfies TRPCRouterRecord;
