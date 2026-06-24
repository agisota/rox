/**
 * Deepgram realtime `Results` → transcript wire segment (Phase-2 mapping).
 *
 * Vendored to mirror `@rox/rtc`'s `mapDeepgramResultToWire` (the canonical,
 * CI-tested version). Pure: only stable FINALS with non-empty text become a wire
 * segment; INTERIM partials and silence map to `null` so the shared reducer never
 * logs a line that later changes — identical drop semantics to the Phase-1 chunked
 * Groq source. Speaker diarization (`words[].speaker`) is surfaced as a `#N` suffix
 * only; the real LiveKit identity is always used for dedupe + persistence.
 */

import type { TranscriptWireSegment } from "./wire";

/** One alternative inside a Deepgram `Results` event (only read fields modelled). */
export interface DeepgramAlternative {
	transcript: string;
	words?: Array<{
		word?: string;
		speaker?: number;
		start?: number;
		end?: number;
	}>;
}

/** The subset of a Deepgram realtime `Results` message the mapping consumes. */
export interface DeepgramTranscriptResult {
	type?: string;
	is_final?: boolean;
	channel?: { alternatives?: DeepgramAlternative[] };
	start?: number;
	duration?: number;
}

/** Identity + context the worker threads onto each mapped segment. */
export interface ServerTranscriptContext {
	/** Org-scoped room name the worker joined. */
	roomName: string;
	/** LiveKit participant identity whose track produced the audio. */
	speakerIdentity: string;
	/** Display name for that participant (falls back to identity if blank). */
	speakerName: string;
	/** ISO-639 language the Deepgram connection was opened with (or null). */
	language?: string | null;
	/** Epoch ms of the audio stream's t=0 (anchors media-relative `start`). */
	streamStartedAtMs?: number;
	/** Durable id (persisted row id) — else a deterministic fallback is derived. */
	segmentId?: string;
	/** Injectable clock for deterministic tests; defaults to `Date.now`. */
	now?: () => number;
}

/** Pick the diarization speaker cluster that contributed the most words. */
function dominantSpeaker(alt: DeepgramAlternative | undefined): number | null {
	if (!alt?.words || alt.words.length === 0) return null;
	const counts = new Map<number, number>();
	for (const w of alt.words) {
		if (typeof w.speaker === "number") {
			counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
		}
	}
	let best: number | null = null;
	let bestCount = -1;
	for (const [speaker, count] of counts) {
		if (count > bestCount) {
			best = speaker;
			bestCount = count;
		}
	}
	return best;
}

/** Wall-clock instant the spoken words ended (media `start`+`duration` anchored). */
export function deepgramCapturedAt(
	result: DeepgramTranscriptResult,
	ctx: Pick<ServerTranscriptContext, "streamStartedAtMs" | "now">,
): number {
	const now = ctx.now ?? Date.now;
	if (typeof ctx.streamStartedAtMs !== "number") return now();
	const start = typeof result.start === "number" ? result.start : 0;
	const duration = typeof result.duration === "number" ? result.duration : 0;
	return Math.round(ctx.streamStartedAtMs + (start + duration) * 1000);
}

/**
 * PURE mapping: Deepgram `Results` → `TranscriptWireSegment`, or `null` for an
 * interim partial / empty transcript. The worker fans out + persists only the
 * non-null finals.
 */
export function mapDeepgramResultToWire(
	result: DeepgramTranscriptResult,
	ctx: ServerTranscriptContext,
): TranscriptWireSegment | null {
	if (!result.is_final) return null;

	const alt = result.channel?.alternatives?.[0];
	const text = (alt?.transcript ?? "").trim();
	if (text.length === 0) return null;

	const capturedAt = deepgramCapturedAt(result, ctx);
	const baseName =
		ctx.speakerName.trim().length > 0
			? ctx.speakerName.trim()
			: ctx.speakerIdentity;
	const speaker = dominantSpeaker(alt);
	const speakerName = speaker !== null ? `${baseName} #${speaker}` : baseName;

	const id =
		ctx.segmentId && ctx.segmentId.length > 0
			? ctx.segmentId
			: `${ctx.speakerIdentity}:${capturedAt}:final`;

	return {
		id,
		speakerIdentity: ctx.speakerIdentity,
		speakerName,
		text,
		language: ctx.language ?? null,
		capturedAt,
	};
}
