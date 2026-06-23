import { describe, expect, test } from "bun:test";

import {
	createGroqChunkedTranscriptSource,
	createTranscriptCollector,
	decodeTranscriptSegment,
	EMPTY_LIVE_TRANSCRIPT,
	encodeTranscriptSegment,
	type LiveTranscript,
	reduceTranscript,
	TRANSCRIPT_DATA_TOPIC,
	TRANSCRIPT_LOG_LIMIT,
	type TranscribeChunkEndpoint,
	type TranscriptChunk,
	type TranscriptSegment,
	type TranscriptSource,
	transcriptSegmentToWire,
	wireToTranscriptSegment,
} from "./transcript";

/** A finalized segment with sensible defaults overridable per-test. */
function segment(
	p: Partial<TranscriptSegment> & { id: string },
): TranscriptSegment {
	return {
		roomName: "org:o1:voice:c1",
		speakerIdentity: "me",
		speakerName: "Ада",
		text: "привет",
		language: "ru",
		capturedAt: 1_000,
		...p,
	};
}

/** A raw chunk handed to the source. */
function chunk(p: Partial<TranscriptChunk> = {}): TranscriptChunk {
	return {
		roomName: "org:o1:voice:c1",
		audio: new Uint8Array([1, 2, 3, 4]),
		mimeType: "audio/webm",
		speakerIdentity: "me",
		speakerName: "Ада",
		capturedAt: 2_000,
		...p,
	};
}

describe("createGroqChunkedTranscriptSource", () => {
	test("base64-encodes the chunk and maps the endpoint result to a segment", async () => {
		const calls: Parameters<TranscribeChunkEndpoint>[0][] = [];
		const endpoint: TranscribeChunkEndpoint = async (input) => {
			calls.push(input);
			return { id: "row-1", text: "  привет мир  ", language: "ru" };
		};
		const source = createGroqChunkedTranscriptSource(endpoint);

		const out = await source.transcribe(
			chunk({ audio: new Uint8Array([72, 105]) }), // "Hi"
		);

		expect(source.id).toBe("groq-chunked");
		const received = calls[0];
		// Audio is forwarded as base64 of the bytes, not the raw array.
		expect(received?.audioBase64).toBe(btoa("Hi"));
		expect(received?.speakerIdentity).toBe("me");
		expect(received?.roomName).toBe("org:o1:voice:c1");
		// Text is trimmed; identity/room/capturedAt are threaded onto the segment.
		expect(out).toEqual({
			id: "row-1",
			roomName: "org:o1:voice:c1",
			speakerIdentity: "me",
			speakerName: "Ада",
			text: "привет мир",
			language: "ru",
			capturedAt: 2_000,
		});
	});

	test("returns null when the chunk transcribes to empty text (silence)", async () => {
		const source = createGroqChunkedTranscriptSource(async () => ({
			id: "row-empty",
			text: "   ",
			language: null,
		}));
		expect(await source.transcribe(chunk())).toBeNull();
	});

	test("propagates endpoint errors to the caller", async () => {
		const source = createGroqChunkedTranscriptSource(async () => {
			throw new Error("groq 500");
		});
		await expect(source.transcribe(chunk())).rejects.toThrow("groq 500");
	});
});

describe("reduceTranscript", () => {
	test("appends a finalized segment to an empty log", () => {
		const next = reduceTranscript(EMPTY_LIVE_TRANSCRIPT, segment({ id: "a" }));
		expect(next.segments).toHaveLength(1);
		expect(next.segments[0]?.id).toBe("a");
		// Pure: the input state is not mutated.
		expect(EMPTY_LIVE_TRANSCRIPT.segments).toHaveLength(0);
	});

	test("ignores null and empty-text segments (silence never logs)", () => {
		const start: LiveTranscript = { segments: [segment({ id: "a" })] };
		expect(reduceTranscript(start, null)).toBe(start);
		expect(reduceTranscript(start, segment({ id: "b", text: "   " }))).toBe(
			start,
		);
	});

	test("dedupes by segment id (idempotent fan-out)", () => {
		const first = reduceTranscript(EMPTY_LIVE_TRANSCRIPT, segment({ id: "a" }));
		// Re-folding the SAME id (e.g. a re-broadcast) is a no-op.
		const second = reduceTranscript(
			first,
			segment({ id: "a", text: "другое" }),
		);
		expect(second).toBe(first);
		expect(second.segments).toHaveLength(1);
	});

	test("keeps segments in chronological capture order even out-of-order", () => {
		let state = reduceTranscript(
			EMPTY_LIVE_TRANSCRIPT,
			segment({ id: "late", capturedAt: 3_000, text: "потом" }),
		);
		state = reduceTranscript(
			state,
			segment({ id: "early", capturedAt: 1_000, text: "сначала" }),
		);
		expect(state.segments.map((s) => s.id)).toEqual(["early", "late"]);
	});

	test("caps the ring buffer at the limit, dropping the oldest", () => {
		let state: LiveTranscript = EMPTY_LIVE_TRANSCRIPT;
		for (let i = 0; i < TRANSCRIPT_LOG_LIMIT + 25; i += 1) {
			state = reduceTranscript(
				state,
				segment({ id: `s${i}`, capturedAt: 1_000 + i }),
			);
		}
		expect(state.segments).toHaveLength(TRANSCRIPT_LOG_LIMIT);
		// Oldest 25 dropped → first retained is s25.
		expect(state.segments[0]?.id).toBe("s25");
		expect(state.segments.at(-1)?.id).toBe(`s${TRANSCRIPT_LOG_LIMIT + 24}`);
	});
});

/** A source backed by a queue of canned results (or errors), one per chunk. */
function scriptedSource(
	results: (TranscriptSegment | null | Error)[],
): TranscriptSource {
	let i = 0;
	return {
		id: "scripted",
		async transcribe() {
			const next = results[i] ?? null;
			i += 1;
			if (next instanceof Error) throw next;
			return next;
		},
	};
}

describe("createTranscriptCollector", () => {
	test("transcribes each chunk through the source and notifies onChange", async () => {
		const updates: LiveTranscript[] = [];
		const collector = createTranscriptCollector({
			source: scriptedSource([
				segment({ id: "a", capturedAt: 1, text: "раз" }),
				segment({ id: "b", capturedAt: 2, text: "два" }),
			]),
			onChange: (t) => updates.push(t),
		});

		await collector.ingest(chunk());
		await collector.ingest(chunk());

		expect(collector.current().segments.map((s) => s.id)).toEqual(["a", "b"]);
		expect(updates).toHaveLength(2);
	});

	test("silence (null segment) does not notify or grow the log", async () => {
		const updates: LiveTranscript[] = [];
		const collector = createTranscriptCollector({
			source: scriptedSource([null]),
			onChange: (t) => updates.push(t),
		});
		await collector.ingest(chunk());
		expect(collector.current().segments).toHaveLength(0);
		expect(updates).toHaveLength(0); // reducer returned same ref → no notify
	});

	test("a failed chunk is reported via onError and the loop survives", async () => {
		const errors: unknown[] = [];
		const collector = createTranscriptCollector({
			source: scriptedSource([
				new Error("groq down"),
				segment({ id: "after", text: "после" }),
			]),
			onChange: () => {},
			onError: (e) => errors.push(e),
		});

		await collector.ingest(chunk()); // throws → caught
		await collector.ingest(chunk()); // succeeds

		expect(errors).toHaveLength(1);
		expect((errors[0] as Error).message).toBe("groq down");
		expect(collector.current().segments.map((s) => s.id)).toEqual(["after"]);
	});

	test("seed backfills from durable storage and reset clears", async () => {
		const updates: LiveTranscript[] = [];
		const collector = createTranscriptCollector({
			source: scriptedSource([]),
			onChange: (t) => updates.push(t),
		});

		collector.seed([
			segment({ id: "s1", capturedAt: 10, text: "история" }),
			segment({ id: "s2", capturedAt: 20, text: "ещё" }),
		]);
		expect(collector.current().segments.map((s) => s.id)).toEqual(["s1", "s2"]);

		collector.reset();
		expect(collector.current().segments).toHaveLength(0);
	});

	test("onSegment fires for each NEW local final (for data-channel fan-out)", async () => {
		const fanned: TranscriptSegment[] = [];
		const collector = createTranscriptCollector({
			source: scriptedSource([
				segment({ id: "a", text: "раз" }),
				segment({ id: "b", text: "два" }),
			]),
			onChange: () => {},
			onSegment: (s) => fanned.push(s),
		});

		await collector.ingest(chunk());
		await collector.ingest(chunk());

		// Exactly the new finals are offered to the fan-out, with full payload.
		expect(fanned.map((s) => s.id)).toEqual(["a", "b"]);
		expect(fanned[0]).toMatchObject({
			id: "a",
			speakerIdentity: "me",
			text: "раз",
		});
	});

	test("onSegment does NOT fire for silence or a deduped local final", async () => {
		const fanned: TranscriptSegment[] = [];
		const collector = createTranscriptCollector({
			source: scriptedSource([
				segment({ id: "a", text: "раз" }),
				null, // silence → no new segment
				segment({ id: "a", text: "раз" }), // duplicate id → dedupe-dropped
			]),
			onChange: () => {},
			onSegment: (s) => fanned.push(s),
		});

		await collector.ingest(chunk());
		await collector.ingest(chunk());
		await collector.ingest(chunk());

		// Only the first genuinely-new final is broadcast; silence + dedupe are not.
		expect(fanned.map((s) => s.id)).toEqual(["a"]);
	});

	test("mergeRemote folds a remote final and never re-emits onSegment (no echo)", async () => {
		const fanned: TranscriptSegment[] = [];
		const updates: LiveTranscript[] = [];
		const collector = createTranscriptCollector({
			source: scriptedSource([
				segment({ id: "local", capturedAt: 1, text: "моё" }),
			]),
			onChange: (t) => updates.push(t),
			onSegment: (s) => fanned.push(s),
		});

		await collector.ingest(chunk()); // local final → fanned out
		collector.mergeRemote(
			segment({
				id: "remote",
				capturedAt: 2,
				text: "чужое",
				speakerIdentity: "u2",
			}),
		);

		// Both segments are visible; the remote merge did NOT echo back to the wire.
		expect(collector.current().segments.map((s) => s.id)).toEqual([
			"local",
			"remote",
		]);
		expect(fanned.map((s) => s.id)).toEqual(["local"]);
	});

	test("mergeRemote dedupes a remote final that duplicates a local one (by id)", async () => {
		const collector = createTranscriptCollector({
			source: scriptedSource([segment({ id: "shared", text: "слово" })]),
			onChange: () => {},
		});

		await collector.ingest(chunk()); // local "shared"
		collector.mergeRemote(segment({ id: "shared", text: "слово" })); // echo of same id

		// Local + remote of the SAME id collapse to one entry (idempotent fan-out).
		expect(collector.current().segments).toHaveLength(1);
	});
});

describe("transcript data-channel wire codec", () => {
	test("encode → decode round-trips a segment, reattaching the observed room", () => {
		const seg = segment({
			id: "w1",
			speakerIdentity: "u2",
			speakerName: "Борис",
			text: "привет",
			language: "ru",
			capturedAt: 4_242,
			roomName: "org:o1:voice:c1",
		});

		const bytes = encodeTranscriptSegment(seg);
		expect(bytes).toBeInstanceOf(Uint8Array);

		// The receiver never trusts the wire for the room — it reattaches its own.
		const decoded = decodeTranscriptSegment(bytes, "org:o1:voice:OBSERVED");
		expect(decoded).toEqual({
			id: "w1",
			roomName: "org:o1:voice:OBSERVED",
			speakerIdentity: "u2",
			speakerName: "Борис",
			text: "привет",
			language: "ru",
			capturedAt: 4_242,
		});
	});

	test("transcriptSegmentToWire drops roomName; wireToTranscriptSegment restores it", () => {
		const wire = transcriptSegmentToWire(
			segment({ id: "w2", roomName: "org:o1:voice:c1" }),
		);
		expect(wire).not.toHaveProperty("roomName");
		const back = wireToTranscriptSegment(wire, "org:o1:voice:other");
		expect(back.roomName).toBe("org:o1:voice:other");
		expect(back.id).toBe("w2");
	});

	test("decode returns null for malformed bytes (a bad frame must not throw)", () => {
		const room = "org:o1:voice:c1";
		expect(
			decodeTranscriptSegment(new TextEncoder().encode("not json"), room),
		).toBeNull();
		expect(
			decodeTranscriptSegment(new TextEncoder().encode("123"), room),
		).toBeNull();
		// Missing required fields → rejected (no partial segment leaks into the log).
		expect(
			decodeTranscriptSegment(
				new TextEncoder().encode(JSON.stringify({ id: "x", text: "hi" })),
				room,
			),
		).toBeNull();
	});

	test("decode tolerates a missing language (→ null)", () => {
		const wire = {
			id: "w3",
			speakerIdentity: "u2",
			speakerName: "Борис",
			text: "ок",
			capturedAt: 7,
		};
		const decoded = decodeTranscriptSegment(
			new TextEncoder().encode(JSON.stringify(wire)),
			"org:o1:voice:c1",
		);
		expect(decoded?.language).toBeNull();
		expect(decoded?.id).toBe("w3");
	});
});

/**
 * Minimal fake LiveKit `Room` data-channel: an event bus + a `publishData` spy
 * that, like a real SFU, delivers every published frame to all OTHER subscribers.
 * Lets us drive the exact publish → DataReceived → merge path the hook wires,
 * with no WebSocket, DOM, or React.
 */
function fakeDataChannelRoom(name: string) {
	type DataListener = (
		payload: Uint8Array,
		_p?: unknown,
		_k?: unknown,
		topic?: string,
	) => void;
	const listeners = new Set<DataListener>();
	const published: { bytes: Uint8Array; topic?: string }[] = [];
	return {
		name,
		on(listener: DataListener) {
			listeners.add(listener);
		},
		off(listener: DataListener) {
			listeners.delete(listener);
		},
		/** Simulate a remote participant publishing — fan out to all subscribers. */
		emitRemote(bytes: Uint8Array, topic?: string) {
			for (const l of listeners) l(bytes, undefined, undefined, topic);
		},
		localParticipant: {
			async publishData(bytes: Uint8Array, options?: { topic?: string }) {
				published.push({ bytes, topic: options?.topic });
			},
		},
		published,
	};
}

describe("data-channel fan-out (fake-room DataReceived path)", () => {
	test("a local final is published with the transcript topic, then a remote final merges on receive", async () => {
		const room = fakeDataChannelRoom("org:o1:voice:c1");

		// Wire a collector exactly as `useLiveTranscript` does: local finals publish
		// to the room; received frames decode + merge through the same reducer.
		const collector = createTranscriptCollector({
			source: scriptedSource([
				segment({
					id: "mine",
					capturedAt: 1,
					speakerIdentity: "me",
					text: "моё слово",
				}),
			]),
			onChange: () => {},
			onSegment: (seg) => {
				void room.localParticipant.publishData(encodeTranscriptSegment(seg), {
					topic: TRANSCRIPT_DATA_TOPIC,
				});
			},
		});
		const onData = (
			payload: Uint8Array,
			_p?: unknown,
			_k?: unknown,
			topic?: string,
		) => {
			if (topic && topic !== TRANSCRIPT_DATA_TOPIC) return;
			const seg = decodeTranscriptSegment(payload, room.name);
			if (seg) collector.mergeRemote(seg);
		};
		room.on(onData);

		// 1) Local capture → folded locally AND broadcast on the data channel.
		await collector.ingest(chunk());
		expect(room.published).toHaveLength(1);
		expect(room.published[0]?.topic).toBe(TRANSCRIPT_DATA_TOPIC);
		expect(collector.current().segments.map((s) => s.id)).toEqual(["mine"]);

		// 2) A remote participant publishes its OWN final → arrives via DataReceived
		// and merges into the SAME log (chronological by capturedAt).
		const remote = segment({
			id: "theirs",
			capturedAt: 2,
			speakerIdentity: "u2",
			speakerName: "Борис",
			text: "их слово",
			roomName: "ignored-on-wire",
		});
		room.emitRemote(encodeTranscriptSegment(remote), TRANSCRIPT_DATA_TOPIC);

		expect(collector.current().segments.map((s) => s.id)).toEqual([
			"mine",
			"theirs",
		]);
		// The merged remote segment carries the OBSERVED room, not the wire's.
		expect(collector.current().segments[1]?.roomName).toBe("org:o1:voice:c1");
		// Receiving did not re-broadcast (still exactly the one local publish).
		expect(room.published).toHaveLength(1);
	});

	test("late joiner: listSegments backfill seeds the log, then live remote finals merge + dedupe", () => {
		const room = fakeDataChannelRoom("org:o1:voice:c1");
		const collector = createTranscriptCollector({
			source: scriptedSource([]),
			onChange: () => {},
		});
		const onData = (
			payload: Uint8Array,
			_p?: unknown,
			_k?: unknown,
			topic?: string,
		) => {
			if (topic && topic !== TRANSCRIPT_DATA_TOPIC) return;
			const seg = decodeTranscriptSegment(payload, room.name);
			if (seg) collector.mergeRemote(seg);
		};
		room.on(onData);

		// On connect, the hook backfills the room's prior finals from durable storage
		// (the `voice.listSegments` query) via `collector.seed`.
		collector.seed([
			segment({
				id: "old1",
				capturedAt: 10,
				speakerName: "Ада",
				text: "раньше",
			}),
			segment({
				id: "old2",
				capturedAt: 20,
				speakerName: "Борис",
				text: "тоже раньше",
			}),
		]);
		expect(collector.current().segments.map((s) => s.id)).toEqual([
			"old1",
			"old2",
		]);

		// A live remote final arrives AFTER the backfill → appended chronologically.
		room.emitRemote(
			encodeTranscriptSegment(
				segment({
					id: "new1",
					capturedAt: 30,
					speakerIdentity: "u3",
					text: "сейчас",
				}),
			),
			TRANSCRIPT_DATA_TOPIC,
		);
		expect(collector.current().segments.map((s) => s.id)).toEqual([
			"old1",
			"old2",
			"new1",
		]);

		// A re-broadcast of a SEGMENT ALREADY BACKFILLED is deduped (no double-log).
		room.emitRemote(
			encodeTranscriptSegment(
				segment({ id: "old2", capturedAt: 20, text: "тоже раньше" }),
			),
			TRANSCRIPT_DATA_TOPIC,
		);
		expect(collector.current().segments).toHaveLength(3);
	});

	test("frames on an unrelated topic are ignored by the receive handler", () => {
		const room = fakeDataChannelRoom("org:o1:voice:c1");
		const collector = createTranscriptCollector({
			source: scriptedSource([]),
			onChange: () => {},
		});
		const onData = (
			payload: Uint8Array,
			_p?: unknown,
			_k?: unknown,
			topic?: string,
		) => {
			if (topic && topic !== TRANSCRIPT_DATA_TOPIC) return;
			const seg = decodeTranscriptSegment(payload, room.name);
			if (seg) collector.mergeRemote(seg);
		};
		room.on(onData);

		// A valid transcript payload but published under a DIFFERENT topic → dropped.
		room.emitRemote(
			encodeTranscriptSegment(segment({ id: "other-feature" })),
			"rox.other.feature",
		);
		expect(collector.current().segments).toHaveLength(0);
	});
});
