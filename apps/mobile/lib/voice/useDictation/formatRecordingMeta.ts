/** Mime type expo-audio's HIGH_QUALITY preset produces on iOS/Android. */
export const MOBILE_AUDIO_MIME = "audio/m4a";

export interface RecordingMeta {
	mimeType: string;
	durationMs: number;
}

/**
 * Normalize raw recorder output into the `voice.transcribe` argument shape.
 *
 * Pure (no native deps) so the contract is unit-testable. The server input is
 * `durationMs: z.number().int().nonnegative().optional()`, so we round to a
 * non-negative integer; a missing/NaN/negative duration collapses to 0.
 */
export function formatRecordingMeta(
	durationMillis: number | null | undefined,
	mimeType: string = MOBILE_AUDIO_MIME,
): RecordingMeta {
	const raw = typeof durationMillis === "number" ? durationMillis : 0;
	const durationMs = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
	return { mimeType: mimeType || MOBILE_AUDIO_MIME, durationMs };
}
