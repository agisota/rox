import { describe, expect, test } from "bun:test";

import {
	type AudioPump,
	buildDeepgramListenUrl,
	type CreateAudioPump,
	type CreateStreamSocket,
	createDeepgramStreamingTranscript,
	type DeepgramStreamArgs,
	downsampleToPcm16,
	type StreamSocket,
	type StreamTokenGrant,
} from "./deepgram-stream";
import {
	type DeepgramTranscriptResult,
	decodeTranscriptSegment,
	type LiveTranscript,
} from "./transcript";

/** A controllable fake `StreamSocket`: records sends + drives lifecycle events. */
class FakeSocket implements StreamSocket {
	readonly sent: Array<ArrayBufferView | string> = [];
	closed = false;
	readonly url: string;
	readonly token: string;
	private listeners = new Map<string, Array<(e: { data?: unknown }) => void>>();

	constructor(url: string, token: string) {
		this.url = url;
		this.token = token;
	}

	send(data: ArrayBufferView | string) {
		this.sent.push(data);
	}
	close() {
		this.closed = true;
		this.emit("close", {});
	}
	addEventListener(
		type: "open" | "message" | "error" | "close",
		listener: (e: { data?: unknown }) => void,
	) {
		const arr = this.listeners.get(type) ?? [];
		arr.push(listener);
		this.listeners.set(type, arr);
	}
	removeEventListener(
		type: "open" | "message" | "error" | "close",
		listener: (e: { data?: unknown }) => void,
	) {
		const arr = this.listeners.get(type);
		if (arr)
			this.listeners.set(
				type,
				arr.filter((l) => l !== listener),
			);
	}
	/** Test driver: fire a lifecycle/message event into the orchestrator. */
	emit(
		type: "open" | "message" | "error" | "close",
		event: { data?: unknown },
	) {
		for (const l of this.listeners.get(type) ?? []) l(event);
	}
	/** How many binary (PCM frame) sends have been recorded. */
	binarySends(): number {
		return this.sent.filter((s) => typeof s !== "string").length;
	}
	/** Whether a JSON control message of `type` was sent. */
	sentControl(type: string): boolean {
		return this.sent.some(
			(s) =>
				typeof s === "string" &&
				(JSON.parse(s) as { type?: string }).type === type,
		);
	}
}

/** A fake audio pump that captures the `onFrame` callback so a test can pump. */
class FakePump implements AudioPump {
	stopped = false;
	constructor(readonly onFrame: (frame: Int16Array) => void) {}
	stop() {
		this.stopped = true;
	}
	/** Test driver: deliver one PCM16 frame as if the mic produced it. */
	feed(frame: Int16Array) {
		this.onFrame(frame);
	}
}

/** A fake mic track (the orchestrator only passes it to the pump factory). */
const FAKE_TRACK = {} as unknown as MediaStreamTrack;

/** A scripted final-result event for `org:o1:voice:c1`. */
function finalResult(text: string, start = 0): DeepgramTranscriptResult {
	return {
		type: "Results",
		is_final: true,
		start,
		duration: 1,
		channel: { alternatives: [{ transcript: text }] },
	};
}

/** An interim (partial) result — must be dropped (never fanned out/persisted). */
function interimResult(text: string): DeepgramTranscriptResult {
	return {
		type: "Results",
		is_final: false,
		channel: { alternatives: [{ transcript: text }] },
	};
}

interface Harness {
	sockets: FakeSocket[];
	pumps: FakePump[];
	published: Uint8Array[];
	persisted: Array<{ text: string; id: string }>;
	changes: LiveTranscript[];
	mintCalls: number;
	timers: Array<{ fn: () => void; ms: number }>;
	clock: { value: number };
	runTimers: () => void;
	start: (
		overrides?: Partial<DeepgramStreamArgs>,
	) => ReturnType<typeof createDeepgramStreamingTranscript>;
}

/** Build a fully-faked orchestrator harness (no real ws / mic / timers / clock). */
function makeHarness(tokenTtlMs = 60_000): Harness {
	const sockets: FakeSocket[] = [];
	const pumps: FakePump[] = [];
	const published: Uint8Array[] = [];
	const persisted: Array<{ text: string; id: string }> = [];
	const changes: LiveTranscript[] = [];
	const timers: Array<{ fn: () => void; ms: number }> = [];
	const clock = { value: 1_000_000 };
	let mintCalls = 0;

	const createSocket: CreateStreamSocket = (url, token) => {
		const s = new FakeSocket(url, token);
		sockets.push(s);
		return s;
	};
	const createAudioPump: CreateAudioPump = (_track, onFrame) => {
		const p = new FakePump(onFrame);
		pumps.push(p);
		return p;
	};

	const start = (overrides?: Partial<DeepgramStreamArgs>) =>
		createDeepgramStreamingTranscript({
			roomName: "org:o1:voice:c1",
			micTrack: FAKE_TRACK,
			speakerIdentity: "me",
			speakerName: "Ада",
			mintToken: async (): Promise<StreamTokenGrant> => {
				mintCalls += 1;
				return {
					token: `tok-${mintCalls}`,
					expiresAt: clock.value + tokenTtlMs,
				};
			},
			publish: (bytes) => published.push(bytes),
			persist: async (segment) => {
				persisted.push({ text: segment.text, id: segment.id });
			},
			onChange: (t) => changes.push(t),
			createSocket,
			createAudioPump,
			now: () => clock.value,
			setTimer: (fn: () => void, ms: number) => {
				timers.push({ fn, ms });
				return timers.length as unknown as ReturnType<typeof setTimeout>;
			},
			clearTimer: () => {},
			...overrides,
		});

	return {
		sockets,
		pumps,
		published,
		persisted,
		changes,
		get mintCalls() {
			return mintCalls;
		},
		timers,
		clock,
		runTimers: () => {
			const pending = timers.splice(0);
			for (const t of pending) t.fn();
		},
		start,
	};
}

/** Let the orchestrator's pending `await mintToken()` microtask settle. */
async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("buildDeepgramListenUrl", () => {
	test("encodes PCM16 mono streaming params", () => {
		const url = buildDeepgramListenUrl("nova-3", "multi");
		expect(url).toContain("wss://api.deepgram.com/v1/listen?");
		expect(url).toContain("model=nova-3");
		expect(url).toContain("language=multi");
		expect(url).toContain("encoding=linear16");
		expect(url).toContain("sample_rate=16000");
		expect(url).toContain("channels=1");
		expect(url).toContain("interim_results=true");
	});
});

describe("downsampleToPcm16", () => {
	test("halves the frame count at 2:1 (picks every other sample) and clamps", () => {
		// ratio = 2 → out[i] = input[2i]: picks indices 0, 2, 4, 6.
		const input = new Float32Array([1.5, 0, -1.5, 0, 0.5, 0, -0.5, 0]); // 8 @ 32k
		const out = downsampleToPcm16(input, 32_000, 16_000);
		expect(out.length).toBe(4);
		expect(out[0]).toBe(32767); // input[0]=1.5 clamped to +1 → 0x7fff
		expect(out[1]).toBe(-32768); // input[2]=-1.5 clamped to -1 → -0x8000
		expect(out[2]).toBe(16383); // input[4]=0.5 → round(0.5*0x7fff)
		expect(out[3]).toBe(-16384); // input[6]=-0.5 → 0.5*-0x8000
	});

	test("empty / invalid rates yield an empty buffer", () => {
		expect(downsampleToPcm16(new Float32Array(0), 16_000, 16_000).length).toBe(
			0,
		);
		expect(downsampleToPcm16(new Float32Array([0.1]), 0, 16_000).length).toBe(
			0,
		);
	});
});

describe("createDeepgramStreamingTranscript", () => {
	test("mints a token, opens a socket with the bearer token, and pumps mic frames", async () => {
		const h = makeHarness();
		h.start();
		await flush();

		expect(h.mintCalls).toBe(1);
		expect(h.sockets.length).toBe(1);
		const socket = h.sockets[0] as FakeSocket;
		expect(socket.token).toBe("tok-1");
		expect(socket.url).toContain("model=nova-3");

		// No pump until the socket opens.
		expect(h.pumps.length).toBe(0);
		socket.emit("open", {});
		expect(h.pumps.length).toBe(1);

		// A mic frame is forwarded to the socket as a binary PCM send.
		(h.pumps[0] as FakePump).feed(new Int16Array([1, 2, 3, 4]));
		expect(socket.binarySends()).toBe(1);
	});

	test("routes a FINAL through fan-out (publish) + persist + local fold", async () => {
		const h = makeHarness();
		h.start();
		await flush();
		const socket = h.sockets[0] as FakeSocket;
		socket.emit("open", {});

		socket.emit("message", { data: JSON.stringify(finalResult("привет")) });

		// Fanned out exactly once, as the EXISTING wire envelope (decodes back).
		expect(h.published.length).toBe(1);
		const decoded = decodeTranscriptSegment(
			h.published[0] as Uint8Array,
			"org:o1:voice:c1",
		);
		expect(decoded?.text).toBe("привет");
		expect(decoded?.speakerIdentity).toBe("me");

		// Persisted once with the same text.
		expect(h.persisted.length).toBe(1);
		expect(h.persisted[0]?.text).toBe("привет");

		// Folded into the local transcript (surfaced via onChange).
		const last = h.changes.at(-1);
		expect(last?.segments.map((s) => s.text)).toEqual(["привет"]);
	});

	test("drops interim partials and empty finals (no fan-out / persist)", async () => {
		const h = makeHarness();
		h.start();
		await flush();
		const socket = h.sockets[0] as FakeSocket;
		socket.emit("open", {});

		socket.emit("message", { data: JSON.stringify(interimResult("при")) });
		socket.emit("message", { data: JSON.stringify(finalResult("   ")) });
		socket.emit("message", { data: JSON.stringify({ type: "Metadata" }) });

		expect(h.published.length).toBe(0);
		expect(h.persisted.length).toBe(0);
	});

	test("dedupes a re-broadcast final by id (fan-out + persist happen once)", async () => {
		const h = makeHarness();
		h.start();
		await flush();
		const socket = h.sockets[0] as FakeSocket;
		socket.emit("open", {});

		// Same speaker + same media start → same derived id → second is a dedupe no-op.
		const evt = JSON.stringify(finalResult("привет", 0));
		socket.emit("message", { data: evt });
		socket.emit("message", { data: evt });

		expect(h.published.length).toBe(1);
		expect(h.persisted.length).toBe(1);
	});

	test("re-mints + reconnects when the re-mint timer fires (token refresh)", async () => {
		const h = makeHarness();
		h.start();
		await flush();
		expect(h.sockets.length).toBe(1);
		expect(h.timers.length).toBe(1);

		// Fire the scheduled re-mint: a NEW token is minted and a NEW socket opens.
		h.runTimers();
		await flush();

		expect(h.mintCalls).toBe(2);
		expect(h.sockets.length).toBe(2);
		expect((h.sockets[1] as FakeSocket).token).toBe("tok-2");
		// The old socket was gracefully closed (CloseStream flush) by the re-mint.
		expect((h.sockets[0] as FakeSocket).sentControl("CloseStream")).toBe(true);
	});

	test("stop() tears down the socket (CloseStream) + pump idempotently", async () => {
		const h = makeHarness();
		const stream = h.start();
		await flush();
		const socket = h.sockets[0] as FakeSocket;
		socket.emit("open", {});
		const pump = h.pumps[0] as FakePump;

		stream.stop();
		expect(socket.sentControl("CloseStream")).toBe(true);
		expect(socket.closed).toBe(true);
		expect(pump.stopped).toBe(true);

		// Idempotent: a second stop() does nothing (no throw, no extra effects).
		expect(() => stream.stop()).not.toThrow();

		// Frames after stop are not forwarded.
		const before = socket.binarySends();
		pump.feed(new Int16Array([9]));
		expect(socket.binarySends()).toBe(before);
	});

	test("a mint failure surfaces via onError and opens no socket (Phase-1 fallback)", async () => {
		const h = makeHarness();
		const errors: unknown[] = [];
		h.start({
			mintToken: async () => {
				throw new Error("no token");
			},
			onError: (e) => errors.push(e),
		});
		await flush();

		expect(h.sockets.length).toBe(0);
		expect(errors.length).toBe(1);
	});

	test("when the audio pump is unavailable the socket is torn down (no half-open)", async () => {
		const h = makeHarness();
		const errors: unknown[] = [];
		h.start({
			createAudioPump: () => null,
			onError: (e) => errors.push(e),
		});
		await flush();
		const socket = h.sockets[0] as FakeSocket;
		socket.emit("open", {});

		expect(socket.closed).toBe(true);
		expect(errors.length).toBe(1);
	});
});
