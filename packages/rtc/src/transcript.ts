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

// ============================================================================
// Streaming-STT Phase-2 — server-side `livekit-deepgram` source (THE SAME SEAM).
// ----------------------------------------------------------------------------
// Phase-1 transcribes the LOCAL mic in N-second CHUNKS on the client. Phase-2 is
// the server-side STREAMING upgrade: a hidden worker participant
// (`workers/transcribe-worker`) joins the voice room, subscribes to the audio
// tracks, streams PCM to Deepgram realtime, and emits each transcript event back
// to the room through the EXISTING fan-out — `encodeTranscriptSegment` under
// `TRANSCRIPT_DATA_TOPIC`, the SAME envelope `reduceTranscript` already merges. So
// every already-shipped client folds the worker's words via the wired
// `DataReceived` → `decodeTranscriptSegment` → `mergeRemote` path with ZERO client
// changes — Phase-2 swaps the STT engine behind the one `TranscriptSource` seam,
// exactly as the seam's contract promised.
//
// This block is the ISOMORPHIC half that belongs in CI: the stable source id, the
// Deepgram-result envelope shape, and the PURE mapping from a Deepgram `Results`
// event to the existing `TranscriptWireSegment`. The heavy runtime (LiveKit room
// join, the live Deepgram websocket, the signed persistence POST) lives in the
// standalone deploy-gated worker, which imports this mapping so the bytes it
// publishes are byte-identical to what the client decodes.
// ============================================================================

/**
 * Stable telemetry/debug id for the Phase-2 server streaming source. Registered
 * as a `TranscriptSource.id` so logs/metrics can tell the chunked Groq path
 * (`"groq-chunked"`) apart from the streaming LiveKit+Deepgram path.
 */
export const SERVER_TRANSCRIPT_SOURCE_ID = "livekit-deepgram";

/**
 * Topic the worker publishes finals under — identical to the client fan-out topic
 * so receivers do not special-case the server source. Re-exported as an explicit
 * alias to make the worker's intent self-documenting at the call site.
 */
export const SERVER_TRANSCRIPT_DATA_TOPIC = TRANSCRIPT_DATA_TOPIC;

/**
 * One alternative inside a Deepgram `Results` event. Only the fields the mapping
 * actually reads are modelled (Deepgram sends more); `words` carries per-word
 * diarization (`speaker` is a small integer cluster index) used to label the
 * speaker when track identity is not 1:1 with a person.
 */
export interface DeepgramAlternative {
	transcript: string;
	words?: Array<{
		word?: string;
		speaker?: number;
		start?: number;
		end?: number;
	}>;
}

/**
 * The subset of a Deepgram realtime `Results` message the mapping consumes.
 * `is_final` distinguishes a stable final from an interim partial;
 * `channel.alternatives[0]` is the best hypothesis; `start`/`duration` are the
 * media-time window (seconds) used to derive a capture instant.
 */
export interface DeepgramTranscriptResult {
	type?: string;
	is_final?: boolean;
	channel?: { alternatives?: DeepgramAlternative[] };
	start?: number;
	duration?: number;
}

/** Identity the worker attaches to every segment it derives for one audio track. */
export interface ServerTranscriptSpeaker {
	/** LiveKit participant identity whose track produced the audio. */
	speakerIdentity: string;
	/** Display name for that participant (falls back to identity if blank). */
	speakerName: string;
}

/** Context threaded onto each mapped segment (room + when the stream started). */
export interface ServerTranscriptContext extends ServerTranscriptSpeaker {
	/** Org-scoped room name the worker joined (`org:{org}:voice:{channelId}`). */
	roomName: string;
	/**
	 * Epoch ms of the audio stream's t=0, so a Deepgram media-relative `start`
	 * (seconds) maps to a wall-clock `capturedAt`. Defaults to "now" per call when
	 * omitted (used by tests / when no stream anchor is available).
	 */
	streamStartedAtMs?: number;
	/**
	 * Stable id for the mapped segment. Deepgram does not mint durable ids, so the
	 * worker supplies one (e.g. the persisted row id, else a deterministic
	 * `${trackSid}:${start}` key) to keep fan-out dedupe (`reduceTranscript`)
	 * idempotent across a re-publish. When omitted a `${speaker}:${start}:final`
	 * fallback is derived so the same final never double-logs.
	 */
	segmentId?: string;
	/** Injectable clock for deterministic tests; defaults to `Date.now`. */
	now?: () => number;
}

/** Pick the speaker cluster that contributed the most words (diarization label). */
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

/**
 * Derive the wall-clock capture instant for a Deepgram result. A realtime result
 * carries a media-relative `start` (+ `duration`) in seconds; anchoring it to the
 * stream's `streamStartedAtMs` yields the absolute instant the spoken WORDS ended
 * — which is what `reduceTranscript` sorts on so server + client finals interleave
 * chronologically. Falls back to the injected clock when no anchor is available.
 */
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
 * PURE Phase-2 mapping: a Deepgram realtime `Results` event → the EXISTING
 * `TranscriptWireSegment` (the wire `encodeTranscriptSegment` serializes and the
 * client's `decodeTranscriptSegment` already merges). Returns `null` for an
 * INTERIM partial or an empty/whitespace transcript, so the worker only fans out
 * + persists stable FINALS (silence and partials never enter the log) — mirroring
 * `createGroqChunkedTranscriptSource`, which also drops empty chunks.
 *
 * Speaker label: the worker subscribes one track per participant, so it passes the
 * track's `speakerIdentity`/`speakerName`; Deepgram diarization (`words[].speaker`)
 * is surfaced as a `#N` suffix only when a single stream carries multiple speakers,
 * never overriding the real LiveKit identity used for dedupe + persistence.
 */
export function mapDeepgramResultToWire(
	result: DeepgramTranscriptResult,
	ctx: ServerTranscriptContext,
): TranscriptWireSegment | null {
	// Only stable finals are fanned out; interim partials are dropped here so the
	// shared reducer never logs a line that later changes underneath the user.
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
		// Deepgram realtime is single-language per connection; the worker sets the
		// connection language (e.g. multi/ru/en) and threads it on via the source.
		language: null,
		capturedAt,
	};
}

/**
 * A Phase-2 server source: the SAME `id` contract as a `TranscriptSource`, plus a
 * streaming `mapResult` (Deepgram event → wire segment) the worker drives per
 * Deepgram message. It is NOT chunk-shaped (`transcribe(chunk)`) because the server
 * path consumes a continuous PCM stream, not discrete client chunks — so it exposes
 * the streaming mapping instead, while keeping the stable `id` so telemetry treats
 * it uniformly with `createGroqChunkedTranscriptSource`.
 */
export interface ServerTranscriptSource {
	readonly id: string;
	/** Map one Deepgram realtime result to a wire segment (or null to drop). */
	mapResult(
		result: DeepgramTranscriptResult,
		ctx: ServerTranscriptContext,
	): TranscriptWireSegment | null;
	/** Encode a mapped wire segment to the SAME data-channel bytes clients merge. */
	encode(wire: TranscriptWireSegment, roomName: string): Uint8Array;
}

/**
 * Register the Phase-2 `livekit-deepgram` source behind the Phase-1 seam. Bundles
 * the stable id, the pure Deepgram→wire mapping, and the canonical encoder so the
 * worker's published bytes are guaranteed byte-identical to what every shipped
 * client already decodes (`encodeTranscriptSegment` ∘ `wireToTranscriptSegment`).
 * No I/O, no Deepgram import — the live websocket + room join live in the worker.
 */
export function createLivekitDeepgramServerSource(): ServerTranscriptSource {
	return {
		id: SERVER_TRANSCRIPT_SOURCE_ID,
		mapResult: mapDeepgramResultToWire,
		encode(wire, roomName) {
			// Reattach the room the worker joined (never trusted off the wire) and
			// reuse the EXACT Phase-1 encoder so client merge stays a no-op upgrade.
			return encodeTranscriptSegment(wireToTranscriptSegment(wire, roomName));
		},
	};
}
