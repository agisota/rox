/**
 * Transcript fan-out WIRE FORMAT — vendored from `@rox/rtc/transcript`.
 *
 * The worker is STANDALONE (not in the bun/turbo workspace), so — exactly like
 * `workers/mesh-relay-watcher` re-implements its signing contract rather than
 * importing `@rox/api` — it vendors the minimal transcript wire codec instead of
 * importing `@rox/rtc`. The shape MUST stay byte-identical to
 * `encodeTranscriptSegment` so every already-shipped client folds the worker's
 * finals through its UNCHANGED `RoomEvent.DataReceived` → `decodeTranscriptSegment`
 * → `reduceTranscript` path. That byte-equality is asserted IN CI by
 * `packages/rtc/src/transcript.test.ts` ("encode() emits BYTE-IDENTICAL bytes to
 * the Phase-1 client encoder"), and re-asserted here against a golden vector.
 *
 * Canonical source of truth: `packages/rtc/src/transcript.ts`. If that wire format
 * changes, update this file and the golden vector test in lockstep.
 */

/** Topic the transcript fan-out publishes under on the LiveKit data channel. */
export const TRANSCRIPT_DATA_TOPIC = "rox.live.transcript";

/**
 * The minimal data-channel payload for one finalized segment. `roomName` is
 * intentionally omitted: the receiver reattaches the room it observed the packet
 * on, so a client-supplied room is never trusted on the wire.
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
 * Encode a wire segment to data-channel bytes (UTF-8 JSON). Byte-identical to
 * `@rox/rtc`'s `encodeTranscriptSegment` for the same field values + order.
 */
export function encodeTranscriptSegment(
	wire: TranscriptWireSegment,
): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify({
			id: wire.id,
			speakerIdentity: wire.speakerIdentity,
			speakerName: wire.speakerName,
			text: wire.text,
			language: wire.language,
			capturedAt: wire.capturedAt,
		}),
	);
}
