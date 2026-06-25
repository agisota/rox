/**
 * Text-to-speech router (FN-043 / #486).
 *
 * Powers the "Прослушать" button on every agent reply with free edge-TTS neural
 * voices. `synthesize` runs the read-aloud socket in the main process and hands
 * the renderer mp3 bytes to play; `listVoices`/`getVoice`/`setVoice` drive the
 * Settings → Voice picker. The chosen voice is persisted in the local settings
 * table so it survives restarts and works offline-first like the other prefs.
 */

import { settings } from "@rox/local-db";
import {
	DEFAULT_TTS_VOICE,
	isKnownTtsVoice,
	TTS_VOICES,
} from "@rox/shared/tts";
import { TRPCError } from "@trpc/server";
import { synthesizeSpeech } from "main/lib/edge-tts";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

function readTtsVoice(): string {
	const row = localDb.select().from(settings).get();
	const stored = row?.ttsVoice ?? null;
	return stored && isKnownTtsVoice(stored) ? stored : DEFAULT_TTS_VOICE;
}

export const createTtsRouter = () => {
	return router({
		/** Curated free edge-TTS voices for the Settings picker. */
		listVoices: publicProcedure.query(() => TTS_VOICES),

		/** Currently selected TTS voice (falls back to the default). */
		getVoice: publicProcedure.query(() => readTtsVoice()),

		/** Persist the selected TTS voice. */
		setVoice: publicProcedure
			.input(z.object({ voice: z.string() }))
			.mutation(({ input }) => {
				if (!isKnownTtsVoice(input.voice)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Unknown TTS voice: ${input.voice}`,
					});
				}
				localDb
					.insert(settings)
					.values({ id: 1, ttsVoice: input.voice })
					.onConflictDoUpdate({
						target: settings.id,
						set: { ttsVoice: input.voice },
					})
					.run();
				return { success: true };
			}),

		/**
		 * Synthesize agent-reply text to mp3 with the selected (or overridden)
		 * voice. Returns base64 audio the renderer plays via an <audio> element.
		 */
		synthesize: publicProcedure
			.input(
				z.object({
					text: z.string().min(1).max(8000),
					/** Optional per-call override; defaults to the saved voice. */
					voice: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const voice = input.voice ?? readTtsVoice();
				return synthesizeSpeech({ text: input.text, voice });
			}),
	});
};
