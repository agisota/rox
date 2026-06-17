import { db } from "@rox/db/client";
import { voiceTranscriptions } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
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
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const buffer = Buffer.from(input.audioBase64, "base64");

			const transcription = await transcribeAudio(buffer, input.mimeType);
			const processed = input.postprocess
				? await postprocessPrompt(transcription.text)
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
