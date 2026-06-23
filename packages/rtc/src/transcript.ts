/**
 * Live Transcript — Streaming-STT Phase-1.
 *
 * Turns a live voice room's local mic into WORDS in the activity panel WITHOUT
 * new infra: the client slices its own microphone into N-second audio chunks and
 * sends each to a transcription `TranscriptSource`; finals are stitched into a
 * per-speaker, capped transcript log and FANNED OUT to every participant over the
 * LiveKit DATA CHANNEL (each final is broadcast with `encodeTranscriptSegment` and
 * merged on receive through the same reducer, which dedupes by id). So every
 * speaker transcribes only its OWN audio once, yet all clients see the full
 * multi-speaker transcript live — no server fan-out infra and no N² re-decode.
 *
 * The design is staged behind ONE seam — `TranscriptSource` — so the STT engine
 * can later swap (Groq chunked → LiveKit Agents streaming) by adding a single new
 * implementation, with zero changes to the reducer, the panel, or the hook.
 *
 * This module is isomorphic (types + a pure reducer + wire codec + a thin
 * fetch-shaped source factory; no React, no DOM, no `MediaRecorder`). The
 * browser-only chunk capture loop, the data-channel publish/subscribe, and the
 * late-joiner backfill live in `@rox/rtc/client` (`useLiveTranscript`); durable
 * persistence lives in the `voice.transcribeChunk` tRPC mutation. Kept parallel to
 * `activity.ts` so both feed the same shared `@rox/ui` panel.
 */

/** Max number of finalized segments retained in the in-memory ring buffer. */
export const TRANSCRIPT_LOG_LIMIT = 200;

/**
 * One audio chunk handed to a `TranscriptSource`: the raw bytes, their MIME type,
 * and the speaker (LiveKit identity + display name) plus the room it belongs to.
 * `capturedAt` is the wall-clock instant the chunk's recording window ended.
 */
export interface TranscriptChunk {
	/** Org-scoped room name (`org:{org}:voice:{channelId}`). */
	roomName: string;
	/** Encoded audio bytes for this window (e.g. webm/opus from MediaRecorder). */
	audio: Uint8Array;
	/** MIME type of `audio` (e.g. `audio/webm`). */
	mimeType: string;
	/** Stable LiveKit identity of the speaker who produced the audio. */
	speakerIdentity: string;
	/** Human-friendly speaker name (falls back to identity). */
	speakerName: string;
	/** Epoch ms when this chunk's recording window ended. */
	capturedAt: number;
}

/** A finalized transcript segment returned by a `TranscriptSource`. */
export interface TranscriptSegment {
	/** Stable id (server row id when persisted, else a client-minted fallback). */
	id: string;
	roomName: string;
	speakerIdentity: string;
	speakerName: string;
	/** Stitched FINAL text for this segment (empty if the chunk had no speech). */
	text: string;
	/** ISO-639 code detected for the chunk (e.g. "ru"), or null. */
	language: string | null;
	capturedAt: number;
}

/**
 * THE SWAP SEAM. A transcript source consumes one audio `TranscriptChunk` and
 * returns the finalized `TranscriptSegment` for it. Phase-1 ships exactly one
 * implementation (`GroqChunkedTranscriptSource`); a future LiveKit Agents source
 * implements the same interface so callers (hook + reducer + panel) never change.
 *
 * `transcribe` MAY return `null` to signal "no speech in this chunk" (silence),
 * which the reducer drops instead of logging an empty line.
 */
export interface TranscriptSource {
	/** Stable id for telemetry / debugging (e.g. "groq-chunked"). */
	readonly id: string;
	transcribe(chunk: TranscriptChunk): Promise<TranscriptSegment | null>;
}

/**
 * The transport `GroqChunkedTranscriptSource` calls per chunk. In the app this is
 * the `voice.transcribeChunk` tRPC mutation wrapped as a plain async callback, so
 * `@rox/rtc` never imports tRPC and stays isomorphic + unit-testable with a fake.
 * It receives a base64 chunk + speaker context and returns the persisted segment.
 */
export type TranscribeChunkEndpoint = (input: {
	roomName: string;
	audioBase64: string;
	mimeType: string;
	speakerIdentity: string;
	speakerName: string;
	capturedAt: number;
}) => Promise<{
	id: string;
	text: string;
	language: string | null;
}>;

/** Encode raw audio bytes to base64 without assuming a Node `Buffer`. */
function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i] as number);
	}
	// `btoa` exists in browsers and modern runtimes (incl. Bun); the source is
	// only ever invoked client-side, but this keeps it environment-agnostic.
	return btoa(binary);
}

/**
 * Phase-1 transcript source: POST each chunk to the existing Groq Whisper path
 * (via the injected `voice.transcribeChunk` endpoint), which transcribes and
 * persists the final segment. `$0` new infra — it reuses `transcribeAudio`.
 *
 * Returns `null` when the chunk transcribed to empty text (silence/noise) so the
 * reducer never logs a blank segment.
 */
export function createGroqChunkedTranscriptSource(
	endpoint: TranscribeChunkEndpoint,
): TranscriptSource {
	return {
		id: "groq-chunked",
		async transcribe(chunk) {
			const result = await endpoint({
				roomName: chunk.roomName,
				audioBase64: toBase64(chunk.audio),
				mimeType: chunk.mimeType,
				speakerIdentity: chunk.speakerIdentity,
				speakerName: chunk.speakerName,
				capturedAt: chunk.capturedAt,
			});
			const text = result.text.trim();
			if (text.length === 0) return null;
			return {
				id: result.id,
				roomName: chunk.roomName,
				speakerIdentity: chunk.speakerIdentity,
				speakerName: chunk.speakerName,
				text,
				language: result.language,
				capturedAt: chunk.capturedAt,
			};
		},
	};
}

/**
 * THE FAN-OUT WIRE FORMAT. When a participant finalizes a segment from its OWN
 * mic, it broadcasts this payload to the room's LiveKit DATA CHANNEL so every
 * other client folds the same words into its panel — no server fan-out infra and
 * no N² re-transcription (each speaker transcribes only itself, once).
 *
 * `roomName` is intentionally omitted: the receiver already knows which room the
 * packet arrived on (`room.name`) and reattaches it, so it never has to trust a
 * client-supplied room on the wire. Kept minimal + JSON-serializable.
 */
export interface TranscriptWireSegment {
	id: string;
	speakerIdentity: string;
	speakerName: string;
	text: string;
	language: string | null;
	capturedAt: number;
}

/**
 * Topic the transcript fan-out publishes under on the LiveKit data channel, so a
 * receiver can ignore unrelated data messages (other features sharing the
 * channel) by checking the packet topic before decoding.
 */
export const TRANSCRIPT_DATA_TOPIC = "rox.live.transcript";

/** Project a finalized segment to its minimal data-channel wire payload. */
export function transcriptSegmentToWire(
	segment: TranscriptSegment,
): TranscriptWireSegment {
	return {
		id: segment.id,
		speakerIdentity: segment.speakerIdentity,
		speakerName: segment.speakerName,
		text: segment.text,
		language: segment.language,
		capturedAt: segment.capturedAt,
	};
}

/**
 * Reconstruct a full `TranscriptSegment` from a received wire payload, attaching
 * the `roomName` the receiver observed the packet on (never trusting the wire for
 * it). Returns the segment ready to fold through `reduceTranscript`.
 */
export function wireToTranscriptSegment(
	wire: TranscriptWireSegment,
	roomName: string,
): TranscriptSegment {
	return {
		id: wire.id,
		roomName,
		speakerIdentity: wire.speakerIdentity,
		speakerName: wire.speakerName,
		text: wire.text,
		language: wire.language,
		capturedAt: wire.capturedAt,
	};
}

/** Encode a finalized segment to data-channel bytes (UTF-8 JSON of the wire). */
export function encodeTranscriptSegment(
	segment: TranscriptSegment,
): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify(transcriptSegmentToWire(segment)),
	);
}

/**
 * Decode data-channel bytes back into a full `TranscriptSegment` (reattaching the
 * observed `roomName`). Returns `null` for any malformed packet — a bad frame
 * from the wire must never throw into the room's `DataReceived` handler.
 */
export function decodeTranscriptSegment(
	data: Uint8Array,
	roomName: string,
): TranscriptSegment | null {
	try {
		const parsed = JSON.parse(new TextDecoder().decode(data)) as unknown;
		if (!parsed || typeof parsed !== "object") return null;
		const wire = parsed as Partial<TranscriptWireSegment>;
		if (
			typeof wire.id !== "string" ||
			typeof wire.speakerIdentity !== "string" ||
			typeof wire.speakerName !== "string" ||
			typeof wire.text !== "string" ||
			typeof wire.capturedAt !== "number"
		) {
			return null;
		}
		return wireToTranscriptSegment(
			{
				id: wire.id,
				speakerIdentity: wire.speakerIdentity,
				speakerName: wire.speakerName,
				text: wire.text,
				language: typeof wire.language === "string" ? wire.language : null,
				capturedAt: wire.capturedAt,
			},
			roomName,
		);
	} catch {
		return null;
	}
}

/** The render-ready live transcript model surfaced to the UI. */
export interface LiveTranscript {
	/** Finalized segments, oldest → newest (capped ring buffer). */
	segments: TranscriptSegment[];
}

/** Empty transcript (used before connect / after disconnect). */
export const EMPTY_LIVE_TRANSCRIPT: LiveTranscript = { segments: [] };

/**
 * Fold a finalized `TranscriptSegment` into the transcript log, returning a NEW
 * `LiveTranscript` (new array) so React re-renders cleanly. Pure: no clocks, no
 * I/O. Dedupes by segment `id` (a retried/re-broadcast final must not double-log)
 * and caps the ring buffer at `TRANSCRIPT_LOG_LIMIT`, dropping the oldest.
 *
 * `null`/empty-text segments are ignored so silence never enters the log.
 */
export function reduceTranscript(
	state: LiveTranscript,
	segment: TranscriptSegment | null,
	limit: number = TRANSCRIPT_LOG_LIMIT,
): LiveTranscript {
	if (!segment || segment.text.trim().length === 0) return state;
	// Dedupe: a segment with the same id was already folded (idempotent fan-out).
	if (state.segments.some((s) => s.id === segment.id)) return state;

	const segments = [...state.segments, segment];
	// Keep chronological by capture instant so out-of-order arrivals still read
	// top-to-bottom; stable for equal timestamps (insertion order preserved).
	segments.sort((a, b) => a.capturedAt - b.capturedAt);
	if (segments.length > limit) {
		segments.splice(0, segments.length - limit);
	}
	return { segments };
}

/**
 * A small stateful coordinator that owns the live transcript reducer state and
 * drives a `TranscriptSource` per audio chunk. The browser-only `MediaRecorder`
 * loop (in `@rox/rtc/client`) just calls `ingest(chunk)` as each window closes;
 * this collector transcribes it through the source, folds the final via
 * `reduceTranscript`, and notifies `onChange` with the new render model.
 *
 * Extracted as a plain factory (no React, no DOM) so the stitch pipeline —
 * source call → fold → dedupe → cap → notify — is unit-testable with a fake
 * source, exactly like `reduceRoomActivity` is testable with a fake room.
 */
export interface TranscriptCollector {
	/** Transcribe + fold one chunk; resolves once the segment (if any) is added. */
	ingest(chunk: TranscriptChunk): Promise<void>;
	/**
	 * Fold a segment received from ANOTHER participant's fan-out broadcast. Folds
	 * through the same `reduceTranscript` (dedupe by id) so local+remote merge
	 * cleanly, and never re-emits `onSegment` (a remote final must not rebroadcast).
	 */
	mergeRemote(segment: TranscriptSegment | null): void;
	/** Seed the log from durable storage (e.g. late-joiner backfill). */
	seed(segments: TranscriptSegment[]): void;
	/** Current render-ready transcript. */
	current(): LiveTranscript;
	/** Reset to empty (e.g. on room change / disconnect). */
	reset(): void;
}

export interface CreateTranscriptCollectorArgs {
	source: TranscriptSource;
	/** Called with the new `LiveTranscript` whenever the log changes. */
	onChange: (transcript: LiveTranscript) => void;
	/** Ring-buffer cap; defaults to `TRANSCRIPT_LOG_LIMIT`. */
	limit?: number;
	/** Optional error sink for a failed chunk transcription (loop keeps going). */
	onError?: (error: unknown, chunk: TranscriptChunk) => void;
	/**
	 * Called with each LOCAL final the moment it is folded (and only when it is
	 * actually new — silence and dedupe-drops never fire). The hook uses this to
	 * fan the segment out to the room's data channel so every other participant
	 * sees it. NOT fired for remote merges (`mergeRemote`) or seed backfill.
	 */
	onSegment?: (segment: TranscriptSegment) => void;
}

export function createTranscriptCollector({
	source,
	onChange,
	limit = TRANSCRIPT_LOG_LIMIT,
	onError,
	onSegment,
}: CreateTranscriptCollectorArgs): TranscriptCollector {
	let state: LiveTranscript = EMPTY_LIVE_TRANSCRIPT;

	const commit = (next: LiveTranscript) => {
		if (next === state) return; // reducer returned the same ref → no-op
		state = next;
		onChange(state);
	};

	return {
		async ingest(chunk) {
			try {
				const segment = await source.transcribe(chunk);
				const next = reduceTranscript(state, segment, limit);
				// Fan out ONLY genuinely-new local finals: a same-ref result means the
				// segment was silence or a dedupe-drop, which must not be rebroadcast.
				if (next !== state && segment) onSegment?.(segment);
				commit(next);
			} catch (error) {
				// One bad chunk must not kill the stream; surface + keep going.
				onError?.(error, chunk);
			}
		},
		mergeRemote(segment) {
			// Same reducer as local (dedupe by id) — no `onSegment`, so a received
			// final is never echoed back onto the wire.
			commit(reduceTranscript(state, segment, limit));
		},
		seed(segments) {
			let next = state;
			for (const segment of segments) {
				next = reduceTranscript(next, segment, limit);
			}
			commit(next);
		},
		current() {
			return state;
		},
		reset() {
			commit(EMPTY_LIVE_TRANSCRIPT);
		},
	};
}
