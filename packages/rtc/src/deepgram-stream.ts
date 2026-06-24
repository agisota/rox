/**
 * In-App Streaming STT — browser Deepgram realtime SOURCE (Streaming-STT Phase-3).
 *
 * Phase-1 chunks the LOCAL mic with `MediaRecorder` and POSTs each clip to Groq
 * (≈5s latency). Phase-2 runs a deployed server worker. THIS phase is the
 * lowest-latency, NO-INFRA path: the desktop renderer streams the user's OWN
 * microphone straight to Deepgram's realtime `/v1/listen` websocket and shows
 * SUB-SECOND words — with no deployed worker and without ever holding the real
 * `DEEPGRAM_API_KEY` (the backend mints a SHORT-LIVED token the renderer presents).
 *
 * It is a SOURCE behind the SAME Phase-1 surface, NOT a new UI. Each Deepgram
 * FINAL is mapped with the EXISTING `mapDeepgramResultToWire` (no fork) and routed
 * through the EXISTING fan-out + persist + reducer: published to the LiveKit data
 * channel under `TRANSCRIPT_DATA_TOPIC` (so other participants merge it via their
 * already-wired `DataReceived` → `decodeTranscriptSegment` → `mergeRemote`),
 * persisted via the injected `persist` callback (the `voice.persistTranscriptSegment`
 * mutation), and folded locally through `reduceTranscript` — exactly the
 * Phase-1/Phase-2 contract, so every shipped client renders the words with ZERO
 * client changes.
 *
 * This module is the ISOMORPHIC orchestration core (pure control flow + a
 * Web-Audio PCM pump that is browser-guarded and fully injectable): the websocket,
 * the token mint, and the audio tap are all seams a test replaces with fakes, so
 * "mint → open ws → stream mic frames → on final fan-out + persist + fold →
 * cleanup → re-mint on expiry" is unit-testable without a real mic, socket, or key.
 */

import {
	type DeepgramTranscriptResult,
	encodeTranscriptSegment,
	type LiveTranscript,
	mapDeepgramResultToWire,
	reduceTranscript,
	type TranscriptSegment,
	wireToTranscriptSegment,
} from "./transcript";

/** Deepgram realtime STT websocket endpoint. */
const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";

/** PCM sample rate (Hz) the audio pump emits; Deepgram is told to expect this. */
export const DEEPGRAM_STREAM_SAMPLE_RATE = 16_000;

/** Default realtime model — Nova-3 with multilingual code-switching. */
export const DEEPGRAM_STREAM_MODEL = "nova-3";

/** Default language — `multi` enables Nova-3 multilingual code-switching. */
export const DEEPGRAM_STREAM_LANGUAGE = "multi";

/**
 * A short-lived Deepgram token minted by the backend. `token` is presented to the
 * `/v1/listen` websocket via the `Sec-WebSocket-Protocol` (browser handshakes
 * cannot set arbitrary headers); `expiresAt` (epoch ms) drives the re-mint timer.
 */
export interface StreamTokenGrant {
	token: string;
	expiresAt: number;
}

/**
 * Mints a short-lived Deepgram token. In the app this wraps the
 * `voice.deepgramStreamToken` tRPC mutation; injected so the orchestrator never
 * imports tRPC and a test can supply a fake (and assert re-mint on expiry).
 */
export type MintStreamToken = () => Promise<StreamTokenGrant>;

/**
 * Persists ONE already-transcribed streaming FINAL. In the app this wraps the
 * `voice.persistTranscriptSegment` mutation; injected so durability is exercised
 * in tests with a fake. Optional — when omitted the words still fan out + render
 * live, they just are not durably stored (used when the procedure is unavailable).
 */
export type PersistStreamSegment = (
	segment: TranscriptSegment,
) => Promise<void>;

/**
 * The minimal websocket surface the orchestrator drives. A subset of the DOM
 * `WebSocket` so the production factory returns a real one and tests pass a fake.
 * `send` carries either a binary PCM frame or a JSON control message
 * (`Finalize`/`CloseStream`/`KeepAlive`).
 */
export interface StreamSocket {
	send(data: ArrayBufferView | string): void;
	close(): void;
	addEventListener(
		type: "open" | "message" | "error" | "close",
		listener: (event: { data?: unknown }) => void,
	): void;
	removeEventListener(
		type: "open" | "message" | "error" | "close",
		listener: (event: { data?: unknown }) => void,
	): void;
}

/**
 * Opens a `StreamSocket` to Deepgram for a freshly-minted token. The default
 * production factory constructs a browser `WebSocket(url, ["bearer", token])` —
 * the bearer sub-protocol is how a browser passes a short-lived token (the only
 * header a browser may set on a WS handshake). Injected so tests never open a
 * real socket.
 */
export type CreateStreamSocket = (url: string, token: string) => StreamSocket;

/**
 * A running audio tap over the local mic track: it emits PCM16 frames (mono,
 * {@link DEEPGRAM_STREAM_SAMPLE_RATE}) to `onFrame` and is stopped on cleanup.
 * The default production pump uses Web Audio; tests pass a fake that feeds
 * scripted frames, so the orchestrator's "pump → ws.send" path is asserted
 * without a real `AudioContext`.
 */
export interface AudioPump {
	stop(): void;
}

/**
 * Starts an {@link AudioPump} over `track`, delivering PCM16 frames to `onFrame`.
 * Injected so the orchestrator stays isomorphic + testable. The default factory
 * ({@link createWebAudioPump}) is browser-only (Web Audio) and returns `null`
 * when Web Audio is unavailable, which disables streaming (Phase-1 fallback).
 */
export type CreateAudioPump = (
	track: MediaStreamTrack,
	onFrame: (frame: Int16Array) => void,
) => AudioPump | null;

export interface DeepgramStreamArgs {
	/** Org-scoped room name (`org:{org}:voice:{channelId}`) for fan-out + persist. */
	roomName: string;
	/** The LOCAL participant's mic `MediaStreamTrack` (teed from LiveKit). */
	micTrack: MediaStreamTrack;
	/** Local participant identity — the speaker tag on every captured segment. */
	speakerIdentity: string;
	/** Local participant display name (falls back to identity). */
	speakerName: string;
	/** Mint a short-lived Deepgram token (re-invoked on expiry/reconnect). */
	mintToken: MintStreamToken;
	/**
	 * Fan a LOCAL final out to every participant. In the app this publishes to the
	 * LiveKit data channel under `TRANSCRIPT_DATA_TOPIC` (the EXISTING envelope), so
	 * remotes merge it with no change. Receives the encoded bytes ready to publish.
	 */
	publish: (bytes: Uint8Array) => void;
	/** Persist a final durably (optional — omit to skip durable storage). */
	persist?: PersistStreamSegment;
	/** Called with the new `LiveTranscript` whenever the local log changes. */
	onChange: (transcript: LiveTranscript) => void;
	/** Optional error sink (the stream keeps running across a transient error). */
	onError?: (error: unknown) => void;
	/** Deepgram model; defaults to {@link DEEPGRAM_STREAM_MODEL}. */
	model?: string;
	/** Deepgram language; defaults to {@link DEEPGRAM_STREAM_LANGUAGE}. */
	language?: string;
	/** Injected ws factory — defaults to a real browser `WebSocket`. */
	createSocket?: CreateStreamSocket;
	/** Injected audio-pump factory — defaults to {@link createWebAudioPump}. */
	createAudioPump?: CreateAudioPump;
	/** Injectable clock (re-mint scheduling); defaults to `Date.now`. */
	now?: () => number;
	/** Injectable timer set; defaults to `setTimeout`. */
	setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
	/** Injectable timer clear; defaults to `clearTimeout`. */
	clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

/** A running stream; `stop()` tears down the ws + pump + timers idempotently. */
export interface DeepgramStream {
	stop(): void;
}

/** Build the `/v1/listen` query string for the fixed PCM16 mono input. */
export function buildDeepgramListenUrl(
	model: string,
	language: string,
): string {
	const params = new URLSearchParams({
		model,
		language,
		encoding: "linear16",
		sample_rate: String(DEEPGRAM_STREAM_SAMPLE_RATE),
		channels: "1",
		punctuate: "true",
		interim_results: "true",
		smart_format: "true",
	});
	return `${DEEPGRAM_LISTEN_URL}?${params.toString()}`;
}

/**
 * Re-mint this many ms BEFORE a token's `expiresAt`, so a fresh socket is opened
 * before the live one's token lapses (Deepgram closes a socket when its token
 * expires). Clamped to a sane floor so a near-instant-expiry token still schedules.
 */
const REMINT_LEAD_MS = 10_000;
/** Never schedule a re-mint sooner than this (avoids a tight mint loop). */
const REMINT_MIN_DELAY_MS = 1_000;

/**
 * Start an in-app Deepgram streaming transcript over `micTrack`. Mints a token,
 * opens a realtime socket, pumps PCM16 frames in, and on each stable FINAL maps it
 * with the EXISTING `mapDeepgramResultToWire`, then fans it out (`publish`),
 * persists it (`persist`), and folds it locally (`reduceTranscript` → `onChange`).
 * Re-mints + reconnects before the token expires. Returns a handle whose `stop()`
 * tears everything down (ws closed with a graceful `CloseStream`, pump stopped,
 * timers cleared) — idempotent and safe to call on call-end or token expiry.
 *
 * Reuse note: this NEVER forks the wire format or the reducer. The bytes it
 * publishes are `encodeTranscriptSegment(wireToTranscriptSegment(...))` — byte
 * identical to the Phase-1/Phase-2 fan-out — so the receive path is unchanged.
 */
export function createDeepgramStreamingTranscript(
	args: DeepgramStreamArgs,
): DeepgramStream {
	const {
		roomName,
		micTrack,
		speakerIdentity,
		speakerName,
		mintToken,
		publish,
		persist,
		onChange,
		onError,
		model = DEEPGRAM_STREAM_MODEL,
		language = DEEPGRAM_STREAM_LANGUAGE,
		createSocket = defaultCreateSocket,
		createAudioPump = createWebAudioPump,
		now = Date.now,
		setTimer = setTimeout,
		clearTimer = clearTimeout,
	} = args;

	let stopped = false;
	let state: LiveTranscript = { segments: [] };
	let socket: StreamSocket | null = null;
	let pump: AudioPump | null = null;
	let remintTimer: ReturnType<typeof setTimeout> | null = null;
	// Anchor for media-relative Deepgram `start` → wall-clock `capturedAt`.
	const streamStartedAtMs = now();

	const fail = (error: unknown) => {
		try {
			onError?.(error);
		} catch {
			// An error sink must never throw back into the stream loop.
		}
	};

	/** Tear down the current socket + pump (but not the whole stream / timers). */
	const teardownConnection = () => {
		if (pump) {
			try {
				pump.stop();
			} catch (error) {
				fail(error);
			}
			pump = null;
		}
		if (socket) {
			try {
				// Graceful close so Deepgram flushes any buffered final.
				socket.send(JSON.stringify({ type: "CloseStream" }));
			} catch {
				// Socket may already be closing; the explicit close below still runs.
			}
			try {
				socket.close();
			} catch (error) {
				fail(error);
			}
			socket = null;
		}
	};

	/** Fold + fan-out + persist one mapped FINAL (skips silence/dedupe no-ops). */
	const handleResult = (result: DeepgramTranscriptResult) => {
		// REUSE the canonical mapping: interim partials + empty text → null (dropped).
		const wire = mapDeepgramResultToWire(result, {
			roomName,
			speakerIdentity,
			speakerName,
			streamStartedAtMs,
			now,
		});
		if (!wire) return;

		const segment = wireToTranscriptSegment(wire, roomName);
		const next = reduceTranscript(state, segment);
		// A same-ref result means dedupe/silence — never re-fan-out or re-persist.
		if (next === state) return;
		state = next;
		onChange(state);

		// Fan out the EXACT Phase-1 bytes so remotes merge with no change.
		try {
			publish(encodeTranscriptSegment(segment));
		} catch (error) {
			fail(error);
		}
		// Durable persist (best-effort — a failed persist must not break the stream).
		if (persist) {
			void persist(segment).catch(fail);
		}
	};

	/** Open one socket for a freshly-minted token + (re)schedule the next re-mint. */
	const openConnection = async () => {
		if (stopped) return;
		let grant: StreamTokenGrant;
		try {
			grant = await mintToken();
		} catch (error) {
			// No token → no streaming this attempt; surface so the caller can fall
			// back to Phase-1. We do NOT auto-retry (the hook re-runs on dependency
			// change); a tight mint-retry loop would hammer the backend.
			fail(error);
			return;
		}
		if (stopped) return;

		const ws = createSocket(
			buildDeepgramListenUrl(model, language),
			grant.token,
		);
		socket = ws;

		const onOpen = () => {
			if (stopped) return;
			// Start pumping mic PCM only once the socket is open.
			pump = createAudioPump(micTrack, (frame) => {
				if (stopped || ws !== socket) return;
				try {
					// Deepgram expects raw little-endian PCM16 bytes.
					ws.send(
						new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength),
					);
				} catch (error) {
					fail(error);
				}
			});
			if (!pump) {
				// No Web Audio → cannot stream; tear this socket down so the caller's
				// Phase-1 fallback is the only active path (no half-open socket).
				fail(new Error("Web Audio is unavailable — cannot stream microphone."));
				teardownConnection();
			}
		};

		const onMessage = (event: { data?: unknown }) => {
			if (stopped || ws !== socket) return;
			const parsed = parseSocketMessage(event.data);
			if (parsed && parsed.type === "Results") handleResult(parsed);
		};

		const onSocketError = (event: { data?: unknown }) => {
			fail(event?.data ?? new Error("Deepgram websocket error"));
		};

		const onClose = () => {
			// A close that is not part of our teardown means the token lapsed or the
			// network dropped; if we are still live, re-open with a fresh token.
			if (stopped || ws !== socket) return;
			socket = null;
			if (pump) {
				try {
					pump.stop();
				} catch (error) {
					fail(error);
				}
				pump = null;
			}
			void openConnection();
		};

		ws.addEventListener("open", onOpen);
		ws.addEventListener("message", onMessage);
		ws.addEventListener("error", onSocketError);
		ws.addEventListener("close", onClose);

		// Schedule a proactive re-mint+reconnect BEFORE this token expires so words
		// never stop mid-conversation. Opening the new socket triggers `onClose` on
		// the old one (we swap `socket`), which our guard (`ws !== socket`) ignores.
		const lead = Math.max(
			REMINT_MIN_DELAY_MS,
			grant.expiresAt - now() - REMINT_LEAD_MS,
		);
		if (remintTimer) clearTimer(remintTimer);
		remintTimer = setTimer(() => {
			if (stopped) return;
			// Detach the old socket first so its imminent `onClose` is a no-op, then
			// gracefully close it and open a fresh one.
			const old = socket;
			socket = null;
			if (pump) {
				try {
					pump.stop();
				} catch (error) {
					fail(error);
				}
				pump = null;
			}
			if (old) {
				try {
					old.send(JSON.stringify({ type: "CloseStream" }));
				} catch {
					// best-effort flush
				}
				try {
					old.close();
				} catch (error) {
					fail(error);
				}
			}
			void openConnection();
		}, lead);
	};

	void openConnection();

	return {
		stop() {
			if (stopped) return;
			stopped = true;
			if (remintTimer) {
				clearTimer(remintTimer);
				remintTimer = null;
			}
			teardownConnection();
		},
	};
}

/** Parse a ws message (string or bytes) to a Deepgram result, or null. */
function parseSocketMessage(data: unknown): DeepgramTranscriptResult | null {
	try {
		let text: string | null = null;
		if (typeof data === "string") {
			text = data;
		} else if (data instanceof Uint8Array) {
			text = new TextDecoder().decode(data);
		} else if (data instanceof ArrayBuffer) {
			text = new TextDecoder().decode(new Uint8Array(data));
		} else if (data && typeof data === "object") {
			// Some fakes / runtimes hand the already-parsed object straight through.
			return data as DeepgramTranscriptResult;
		}
		if (text === null) return null;
		return JSON.parse(text) as DeepgramTranscriptResult;
	} catch {
		// A malformed frame must never throw into the socket's message handler.
		return null;
	}
}

/**
 * Default production ws factory: a browser `WebSocket` authenticated with the
 * short-lived token via the `bearer` sub-protocol (the only handshake header a
 * browser may set). Adapts the DOM `WebSocket` to the {@link StreamSocket} shape.
 */
const defaultCreateSocket: CreateStreamSocket = (url, token) => {
	const ws = new WebSocket(url, ["bearer", token]);
	ws.binaryType = "arraybuffer";
	return ws as unknown as StreamSocket;
};

/**
 * Default production audio pump: tap the mic `MediaStreamTrack` with Web Audio,
 * downsample to PCM16 mono at {@link DEEPGRAM_STREAM_SAMPLE_RATE}, and deliver
 * frames to `onFrame`. Browser-only — returns `null` when Web Audio is
 * unavailable (which disables streaming and leaves the Phase-1 fallback active).
 *
 * Uses a `ScriptProcessorNode`: deprecated but universally available in
 * Electron/Chromium without shipping a separate AudioWorklet module file, which
 * keeps this a single dependency-free source. The node is disconnected on `stop`.
 */
export const createWebAudioPump: CreateAudioPump = (track, onFrame) => {
	const AudioCtx =
		typeof globalThis !== "undefined"
			? ((
					globalThis as unknown as {
						AudioContext?: typeof AudioContext;
						webkitAudioContext?: typeof AudioContext;
					}
				).AudioContext ??
				(
					globalThis as unknown as {
						webkitAudioContext?: typeof AudioContext;
					}
				).webkitAudioContext)
			: undefined;
	if (!AudioCtx || typeof MediaStream === "undefined") return null;

	const context = new AudioCtx();
	const source = context.createMediaStreamSource(new MediaStream([track]));
	// 4096-frame window ≈ 85ms at the context rate; balances latency vs. overhead.
	const processor = context.createScriptProcessor(4096, 1, 1);
	const inputRate = context.sampleRate;
	const targetRate = DEEPGRAM_STREAM_SAMPLE_RATE;

	processor.onaudioprocess = (event: AudioProcessingEvent) => {
		const input = event.inputBuffer.getChannelData(0);
		const frame = downsampleToPcm16(input, inputRate, targetRate);
		if (frame.length > 0) onFrame(frame);
	};

	source.connect(processor);
	// ScriptProcessor only fires while connected to a destination; route to it but
	// the audio is the mic the user already hears, so there is no echo concern.
	processor.connect(context.destination);

	return {
		stop() {
			try {
				processor.disconnect();
				source.disconnect();
				processor.onaudioprocess = null;
				void context.close();
			} catch {
				// Closing an already-closed context throws; ignore on teardown.
			}
		},
	};
};

/**
 * Downsample a Float32 mono buffer to Int16 PCM at `targetRate`. PURE (no audio
 * APIs) so it is unit-testable on its own. Uses simple linear decimation — enough
 * for speech STT and cheap on the audio thread. Clamps to the Int16 range.
 */
export function downsampleToPcm16(
	input: Float32Array,
	inputRate: number,
	targetRate: number,
): Int16Array {
	if (inputRate <= 0 || targetRate <= 0 || input.length === 0) {
		return new Int16Array(0);
	}
	if (targetRate >= inputRate) {
		// No downsample needed (or upsampling unsupported) — just convert in place.
		const out = new Int16Array(input.length);
		for (let i = 0; i < input.length; i += 1) {
			out[i] = floatToInt16(input[i] as number);
		}
		return out;
	}
	const ratio = inputRate / targetRate;
	const outLength = Math.floor(input.length / ratio);
	const out = new Int16Array(outLength);
	for (let i = 0; i < outLength; i += 1) {
		out[i] = floatToInt16(input[Math.floor(i * ratio)] as number);
	}
	return out;
}

/** Clamp a Float32 sample (−1..1) to Int16 (−32768..32767). */
function floatToInt16(sample: number): number {
	const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
	return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}
