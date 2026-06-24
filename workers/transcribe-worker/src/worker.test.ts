import { describe, expect, test } from "bun:test";

import type { DeepgramLiveStream } from "./deepgram";
import type { DeepgramTranscriptResult } from "./mapping";
import type {
	RoomAudioSource,
	RoomAudioTrack,
	RoomSpeaker,
} from "./room-source";
import type { SegmentPersistPayload, SegmentWriter } from "./segment-writer";
import { TRANSCRIPT_DATA_TOPIC, type TranscriptWireSegment } from "./wire";
import { runTranscribeWorker } from "./worker";

const silentLogger = { info() {}, warn() {}, error() {} };

/** A controllable fake Deepgram stream: capture sent frames, emit scripted results. */
class FakeDeepgramStream implements DeepgramLiveStream {
	sent: Uint8Array[] = [];
	finished = false;
	private results: Array<(r: DeepgramTranscriptResult) => void> = [];
	private errors: Array<(e: unknown) => void> = [];
	private closes: Array<() => void> = [];

	sendAudio(frame: Uint8Array): void {
		this.sent.push(frame);
	}
	onResult(handler: (r: DeepgramTranscriptResult) => void): void {
		this.results.push(handler);
	}
	onError(handler: (e: unknown) => void): void {
		this.errors.push(handler);
	}
	onClose(handler: () => void): void {
		this.closes.push(handler);
	}
	async finish(): Promise<void> {
		this.finished = true;
		for (const h of this.closes) h();
	}
	/** Test hook: push a Deepgram result through the registered handlers. */
	emit(result: DeepgramTranscriptResult): void {
		for (const h of this.results) h(result);
	}
	emitError(error: unknown): void {
		for (const h of this.errors) h(error);
	}
}

interface PublishCall {
	bytes: Uint8Array;
	opts: { reliable: boolean; topic: string };
}

/**
 * A fake room that yields the supplied tracks. Each track's `frames` async
 * iterable emits the scripted PCM frames AND, interleaved, drives the matching
 * fake Deepgram stream's results so the orchestrator sees results while pumping.
 */
function fakeRoom(
	roomName: string,
	tracks: RoomAudioTrack[],
): { room: RoomAudioSource; publishes: PublishCall[]; closed: () => boolean } {
	const publishes: PublishCall[] = [];
	let isClosed = false;
	const room: RoomAudioSource = {
		roomName,
		async *audioTracks() {
			for (const t of tracks) yield t;
		},
		async publishData(bytes, opts) {
			publishes.push({ bytes, opts });
		},
		async close() {
			isClosed = true;
		},
	};
	return { room, publishes, closed: () => isClosed };
}

function track(
	speaker: RoomSpeaker,
	frames: Uint8Array[],
	onFrame?: (i: number) => void,
	streamStartedAtMs = 0,
): RoomAudioTrack {
	return {
		speaker,
		streamStartedAtMs,
		frames: (async function* () {
			for (let i = 0; i < frames.length; i += 1) {
				onFrame?.(i);
				yield frames[i] as Uint8Array;
			}
		})(),
	};
}

function decode(bytes: Uint8Array): TranscriptWireSegment {
	return JSON.parse(new TextDecoder().decode(bytes)) as TranscriptWireSegment;
}

/** Decode the single expected publish, asserting exactly one was captured. */
function onlyPublished(publishes: PublishCall[]): TranscriptWireSegment {
	expect(publishes).toHaveLength(1);
	const first = publishes[0];
	if (!first) throw new Error("expected exactly one publish");
	return decode(first.bytes);
}

describe("runTranscribeWorker orchestration", () => {
	test("streams frames to Deepgram, persists + fans out each FINAL with the exact envelope", async () => {
		const stream = new FakeDeepgramStream();
		const persisted: SegmentPersistPayload[] = [];
		const writeSegment: SegmentWriter = async (p) => {
			persisted.push(p);
			return { status: 200, ok: true, id: "row-1" };
		};

		const frames = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
		// Emit a FINAL result after the first frame is pumped.
		const t = track({ identity: "user-7", name: "Ада" }, frames, (i) => {
			if (i === 1) {
				stream.emit({
					type: "Results",
					is_final: true,
					start: 0,
					duration: 1,
					channel: { alternatives: [{ transcript: "привет команда" }] },
				});
			}
		});

		const { room, publishes } = fakeRoom("org:o1:voice:c1", [t]);

		const handle = runTranscribeWorker({
			room,
			openDeepgram: async () => stream,
			writeSegment,
			deepgram: {
				apiKey: "dg",
				model: "nova-3",
				language: "ru",
				sampleRate: 48000,
			},
			logger: silentLogger,
		});
		await handle.done;

		// All PCM frames reached Deepgram, and the stream was flushed.
		expect(stream.sent).toEqual(frames);
		expect(stream.finished).toBe(true);

		// The final was persisted with the room + speaker + mapped text.
		expect(persisted).toHaveLength(1);
		expect(persisted[0]?.roomName).toBe("org:o1:voice:c1");
		expect(persisted[0]?.segment.text).toBe("привет команда");
		expect(persisted[0]?.segment.speakerIdentity).toBe("user-7");
		// capturedAt anchored to streamStartedAtMs(0) + (start+duration)s = 1000ms.
		expect(persisted[0]?.segment.capturedAt).toBe(1000);

		// Exactly one fan-out, under the SAME topic, reliable, carrying the SAME text.
		expect(publishes[0]?.opts).toEqual({
			reliable: true,
			topic: TRANSCRIPT_DATA_TOPIC,
		});
		const sent = onlyPublished(publishes);
		expect(sent.text).toBe("привет команда");
		// The persisted row id rides the fan-out (replaces the fallback) for dedupe.
		expect(sent.id).toBe("row-1");
		expect(sent.language).toBe("ru");
	});

	test("drops interim partials AND silence — neither persisted nor fanned out", async () => {
		const stream = new FakeDeepgramStream();
		const persisted: SegmentPersistPayload[] = [];
		const writeSegment: SegmentWriter = async (p) => {
			persisted.push(p);
			return { status: 200, ok: true, id: null };
		};

		const t = track(
			{ identity: "u", name: "N" },
			[new Uint8Array([9])],
			(i) => {
				if (i === 0) {
					// interim partial
					stream.emit({
						type: "Results",
						is_final: false,
						channel: { alternatives: [{ transcript: "час" }] },
					});
					// final but empty (silence)
					stream.emit({
						type: "Results",
						is_final: true,
						channel: { alternatives: [{ transcript: "   " }] },
					});
				}
			},
		);

		const { room, publishes } = fakeRoom("org:o1:voice:c1", [t]);
		const handle = runTranscribeWorker({
			room,
			openDeepgram: async () => stream,
			writeSegment,
			deepgram: {
				apiKey: "dg",
				model: "nova-3",
				language: "multi",
				sampleRate: 48000,
			},
			logger: silentLogger,
		});
		await handle.done;

		expect(persisted).toHaveLength(0);
		expect(publishes).toHaveLength(0);
	});

	test("a failed persist STILL fans out (clients must see words live)", async () => {
		const stream = new FakeDeepgramStream();
		const writeSegment: SegmentWriter = async () => {
			throw new Error("api down");
		};

		const t = track(
			{ identity: "u", name: "N" },
			[new Uint8Array([1])],
			(i) => {
				if (i === 0) {
					stream.emit({
						type: "Results",
						is_final: true,
						start: 0,
						duration: 0,
						channel: { alternatives: [{ transcript: "всё равно слышно" }] },
					});
				}
			},
		);

		const { room, publishes } = fakeRoom("org:o1:voice:c1", [t]);
		const handle = runTranscribeWorker({
			room,
			openDeepgram: async () => stream,
			writeSegment,
			deepgram: {
				apiKey: "dg",
				model: "nova-3",
				language: "ru",
				sampleRate: 48000,
			},
			logger: silentLogger,
		});
		await handle.done;

		// Persist threw, yet the segment was still broadcast with its fallback id.
		const sent = onlyPublished(publishes);
		expect(sent.text).toBe("всё равно слышно");
		expect(sent.id).toBe("u:0:final");
	});

	test("runs multiple speaker tracks and fans out each independently", async () => {
		const streamA = new FakeDeepgramStream();
		const streamB = new FakeDeepgramStream();
		const streams = [streamA, streamB];
		let opened = 0;

		const writeSegment: SegmentWriter = async () => ({
			status: 200,
			ok: true,
			id: null,
		});

		const tA = track(
			{ identity: "a", name: "Alice" },
			[new Uint8Array([1])],
			(i) => {
				if (i === 0)
					streamA.emit({
						type: "Results",
						is_final: true,
						start: 0,
						duration: 0,
						channel: { alternatives: [{ transcript: "from A" }] },
					});
			},
		);
		const tB = track(
			{ identity: "b", name: "Bob" },
			[new Uint8Array([2])],
			(i) => {
				if (i === 0)
					streamB.emit({
						type: "Results",
						is_final: true,
						start: 0,
						duration: 0,
						channel: { alternatives: [{ transcript: "from B" }] },
					});
			},
		);

		const { room, publishes } = fakeRoom("org:o1:voice:c1", [tA, tB]);
		const handle = runTranscribeWorker({
			room,
			openDeepgram: async () => streams[opened++] as DeepgramLiveStream,
			writeSegment,
			deepgram: {
				apiKey: "dg",
				model: "nova-3",
				language: "multi",
				sampleRate: 48000,
			},
			logger: silentLogger,
		});
		await handle.done;

		const texts = publishes.map((p) => decode(p.bytes).text).sort();
		expect(texts).toEqual(["from A", "from B"]);
		const identities = publishes
			.map((p) => decode(p.bytes).speakerIdentity)
			.sort();
		expect(identities).toEqual(["a", "b"]);
	});

	test("stop() closes the room transport", async () => {
		const { room, closed } = fakeRoom("org:o1:voice:c1", []);
		const handle = runTranscribeWorker({
			room,
			openDeepgram: async () => new FakeDeepgramStream(),
			writeSegment: async () => ({ status: 200, ok: true, id: null }),
			deepgram: {
				apiKey: "dg",
				model: "nova-3",
				language: "multi",
				sampleRate: 48000,
			},
			logger: silentLogger,
		});
		await handle.done;
		await handle.stop();
		expect(closed()).toBe(true);
	});

	test("a Deepgram error on one track does not reject done", async () => {
		const stream = new FakeDeepgramStream();
		const t = track(
			{ identity: "u", name: "N" },
			[new Uint8Array([1])],
			(i) => {
				if (i === 0) stream.emitError(new Error("dg socket blip"));
			},
		);
		const { room } = fakeRoom("org:o1:voice:c1", [t]);
		const handle = runTranscribeWorker({
			room,
			openDeepgram: async () => stream,
			writeSegment: async () => ({ status: 200, ok: true, id: null }),
			deepgram: {
				apiKey: "dg",
				model: "nova-3",
				language: "multi",
				sampleRate: 48000,
			},
			logger: silentLogger,
		});
		// Must resolve, not reject.
		await expect(handle.done).resolves.toBeUndefined();
	});
});
