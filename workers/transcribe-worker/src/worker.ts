/**
 * Transcribe-worker ORCHESTRATION (Phase-2).
 *
 * Wires the four seams into the live pipeline, end to end:
 *
 *   RoomAudioSource ──audioTracks()──▶ per speaker track
 *        │                                   │ PCM16 frames
 *        │                                   ▼
 *        │                       DeepgramLiveStream (real @deepgram/sdk)
 *        │                                   │ "Results" events
 *        │                                   ▼
 *        │                    mapDeepgramResultToWire (drop partials/silence)
 *        │                                   │ FINAL wire segment
 *        │                 ┌─────────────────┴─────────────────┐
 *        │       SegmentWriter (signed POST)        publishTranscriptFinal
 *        │       → live_transcript_segments         → publishData(rox.live.transcript)
 *        │                                          → EVERY shipped client merges (no client change)
 *        ▼
 *      close()
 *
 * Each final is PERSISTED first so the durable row id (when the API echoes one)
 * rides the fan-out as the segment `id`, keeping `reduceTranscript`'s dedupe stable
 * with the Phase-1 chunked path. A failed persist NEVER drops the fan-out (the
 * segment is still broadcast) and a failed publish never tears down the stream —
 * one bad track must not kill the room transcript.
 *
 * Pure orchestration: every dependency (room, Deepgram factory, segment writer,
 * clock) is injected, so this whole file is unit-tested with a FAKE room + FAKE
 * Deepgram stream and asserts the exact publishData + persist calls.
 */

import type { DeepgramLiveFactory } from "./deepgram";
import {
	mapDeepgramResultToWire,
	type ServerTranscriptContext,
} from "./mapping";
import {
	publishTranscriptFinal,
	type RoomAudioSource,
	type RoomAudioTrack,
} from "./room-source";
import type { SegmentPersistPayload, SegmentWriter } from "./segment-writer";
import type { TranscriptWireSegment } from "./wire";

export interface RunTranscribeWorkerOptions {
	/** The (already-joined) room transport. */
	room: RoomAudioSource;
	/** Opens one Deepgram realtime stream per track. */
	openDeepgram: DeepgramLiveFactory;
	/** Persists one final (signed POST); returns the durable id when available. */
	writeSegment: SegmentWriter;
	/** Deepgram model/language/sample rate for each stream. */
	deepgram: {
		apiKey: string;
		model: string;
		language: string;
		sampleRate: number;
	};
	/** Structured logger; NEVER receives secrets. Defaults to console. */
	logger?: Pick<Console, "info" | "warn" | "error">;
}

/** A running worker handle; `stop()` ends the run and closes the room. */
export interface TranscribeWorkerHandle {
	/** Resolves when every track stream has ended (room closed / all tracks done). */
	done: Promise<void>;
	stop(): Promise<void>;
}

/**
 * Drive ONE audio track to completion: open a Deepgram stream, register the result
 * handler (map → persist → fan-out), then pump every PCM frame in and flush. Each
 * final is handled sequentially so persist-then-publish ordering holds per segment.
 */
async function runTrack(
	track: RoomAudioTrack,
	opts: RunTranscribeWorkerOptions,
): Promise<void> {
	const log = opts.logger ?? console;
	const stream = await opts.openDeepgram({
		apiKey: opts.deepgram.apiKey,
		model: opts.deepgram.model,
		language: opts.deepgram.language,
		sampleRate: opts.deepgram.sampleRate,
	});

	const baseCtx: ServerTranscriptContext = {
		roomName: opts.room.roomName,
		speakerIdentity: track.speaker.identity,
		speakerName: track.speaker.name,
		language: opts.deepgram.language,
		streamStartedAtMs: track.streamStartedAtMs,
	};

	// Serialize final handling so a segment is persisted before it is fanned out
	// (the row id rides the broadcast for dedupe). Results can arrive faster than a
	// POST resolves, so chain them through a tail promise.
	let tail: Promise<void> = Promise.resolve();
	const handleFinal = async (wire: TranscriptWireSegment): Promise<void> => {
		const payload: SegmentPersistPayload = {
			roomName: opts.room.roomName,
			segment: wire,
		};
		// Persist first; a durable id (when echoed) replaces the fallback id so the
		// fan-out and any later replay dedupe on the same key.
		let outgoing = wire;
		try {
			const result = await opts.writeSegment(payload);
			if (result.id) outgoing = { ...wire, id: result.id };
			if (!result.ok) {
				log.warn(
					`transcribe-worker: persist returned status ${result.status} for room ${opts.room.roomName}`,
				);
			}
		} catch (err) {
			log.error(
				`transcribe-worker: persist failed for room ${opts.room.roomName}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
		// Fan out regardless of persist outcome — clients must see the words live.
		try {
			await publishTranscriptFinal(opts.room, outgoing);
		} catch (err) {
			log.error(
				`transcribe-worker: fan-out publish failed for room ${opts.room.roomName}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
	};

	stream.onError((error) => {
		log.error(
			`transcribe-worker: Deepgram error on ${track.speaker.identity}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	});

	stream.onResult((result) => {
		const wire = mapDeepgramResultToWire(result, baseCtx);
		if (!wire) return; // interim partial or silence → not logged/persisted
		tail = tail.then(() => handleFinal(wire));
	});

	// Pump PCM frames until the track ends, then flush Deepgram and drain finals.
	for await (const frame of track.frames) {
		stream.sendAudio(frame);
	}
	await stream.finish();
	await tail;
}

/**
 * Start the worker against an already-joined room. Subscribes every audio track as
 * it arrives and runs it concurrently; `done` resolves once all tracks end. A
 * single track failure is logged and isolated — it never rejects `done` or affects
 * the other speakers.
 */
export function runTranscribeWorker(
	opts: RunTranscribeWorkerOptions,
): TranscribeWorkerHandle {
	const log = opts.logger ?? console;
	let stopped = false;

	const done = (async () => {
		const running: Array<Promise<void>> = [];
		for await (const track of opts.room.audioTracks()) {
			if (stopped) break;
			log.info(
				`transcribe-worker: streaming track for ${track.speaker.identity} in ${opts.room.roomName}`,
			);
			running.push(
				runTrack(track, opts).catch((err) => {
					log.error(
						`transcribe-worker: track ${track.speaker.identity} ended with error: ${
							err instanceof Error ? err.message : String(err)
						}`,
					);
				}),
			);
		}
		await Promise.all(running);
	})();

	return {
		done,
		async stop() {
			stopped = true;
			await opts.room.close();
		},
	};
}
