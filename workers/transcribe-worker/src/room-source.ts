/**
 * RoomAudioSource — the LiveKit room-join + audio-subscribe + data-publish seam.
 *
 * Joining a LiveKit room as a hidden server participant and pulling per-track PCM
 * is implemented here with the LiveKit realtime Node SDK (`@livekit/rtc-node`) plus
 * a server-minted join token (`livekit-server-sdk` `AccessToken`). The worker is
 * STANDALONE (its own package.json + bun.lock, NOT in the bun/turbo workspace), so
 * `@livekit/rtc-node`'s native FFI bindings install + run here without touching the
 * frozen, `--ignore-scripts` root CI install — exactly like `workers/mesh-relay-watcher`
 * carries `nostr-tools`/`ws` as standalone runtime deps.
 *
 * Layering, so everything is unit-testable WITHOUT a live SFU or native socket:
 *   - PURE adapters — `audioFrameToPcm16` (LiveKit `AudioFrame` → PCM16 bytes) and
 *     `buildWorkerJoinGrant` / `mintWorkerJoinToken` (the hidden-subscriber token) —
 *     are tested directly.
 *   - The rtc-node transport is injected behind `LivekitRoomDriver`. The PRODUCTION
 *     driver (`connectLivekitRoomDriver`) is a thin shim that *dynamically* imports
 *     `@livekit/rtc-node` only when a real connection is opened, so importing this
 *     module (and the worker tests) never loads the native binding.
 *   - `createLivekitRoomAudioSource` wires a driver into the `RoomAudioSource`
 *     interface the worker orchestration drives; tests pass a FAKE driver and assert
 *     the source emits the exact `RoomAudioTrack` shape + forwards `publishData`.
 *
 * SECURITY: the LiveKit API key/secret are used ONLY to mint the join JWT and are
 * never logged. The Deepgram key never reaches this module.
 */

import { AccessToken } from "livekit-server-sdk";

import type { TranscriptWireSegment } from "./wire";
import { encodeTranscriptSegment, TRANSCRIPT_DATA_TOPIC } from "./wire";

/** A speaker whose audio track the worker subscribes to. */
export interface RoomSpeaker {
	/** Stable LiveKit participant identity. */
	identity: string;
	/** Display name (falls back to identity). */
	name: string;
}

/**
 * A live audio track surfaced by the room: a speaker + an async stream of PCM16
 * frames. The orchestrator opens one Deepgram connection per track and pumps these
 * frames into it. `streamStartedAtMs` anchors media-relative result times to wall
 * clock for `capturedAt`.
 */
export interface RoomAudioTrack {
	speaker: RoomSpeaker;
	/** Epoch ms when this track's audio capture started. */
	streamStartedAtMs: number;
	/** PCM16 (linear16) mono frames, in capture order, until the track ends. */
	frames: AsyncIterable<Uint8Array>;
}

/**
 * The room transport the orchestrator drives. `audioTracks()` yields each remote
 * speaker's track as it is subscribed; `publishData()` broadcasts bytes on the
 * room data channel (the worker uses it to fan out finals under
 * `TRANSCRIPT_DATA_TOPIC`); `close()` leaves the room.
 */
export interface RoomAudioSource {
	/** Org-scoped room name the source is joined to. */
	readonly roomName: string;
	/** Each subscribed remote audio track, as it becomes available. */
	audioTracks(): AsyncIterable<RoomAudioTrack>;
	/** Publish bytes to the room data channel (reliable, topic-scoped). */
	publishData(
		data: Uint8Array,
		opts: { reliable: boolean; topic: string },
	): Promise<void>;
	/** Leave the room and release the connection. */
	close(): Promise<void>;
}

/**
 * Publish ONE finalized wire segment to the room over the data channel using the
 * EXACT Phase-1 envelope (`encodeTranscriptSegment` bytes, reliable,
 * `rox.live.transcript` topic), so every shipped client merges it unchanged. Kept
 * as a standalone helper so the orchestrator and tests share one publish path.
 */
export async function publishTranscriptFinal(
	source: Pick<RoomAudioSource, "publishData">,
	segment: TranscriptWireSegment,
): Promise<void> {
	await source.publishData(encodeTranscriptSegment(segment), {
		reliable: true,
		topic: TRANSCRIPT_DATA_TOPIC,
	});
}

// ───────────────────────────── PCM frame adaptation ──────────────────────────

/**
 * The fields of a LiveKit `@livekit/rtc-node` `AudioFrame` this module reads. Kept
 * structural (not an SDK import) so the PCM adapter + its tests don't pull the
 * native binding. The real frames carry interleaved PCM16 in `data`.
 */
export interface LivekitAudioFrameLike {
	/** Interleaved signed 16-bit PCM samples. */
	data: Int16Array;
	/** Frames-per-second of `data` (LiveKit decodes Opus to this rate). */
	sampleRate: number;
	/** Channel count (the worker requests mono). */
	channels: number;
	/** Samples per channel in this frame. */
	samplesPerChannel: number;
}

/**
 * Convert one LiveKit `AudioFrame` to a standalone PCM16 (linear16) little-endian
 * byte buffer — the exact wire Deepgram expects with `encoding=linear16`.
 *
 * Correctness notes:
 *  - We copy ONLY this frame's bytes via `byteOffset`/`byteLength`. LiveKit reuses /
 *    sub-views a shared backing `ArrayBuffer` across frames, so reading the whole
 *    `.buffer` (or `.buffer.slice(0)`) would splice in neighbouring frames' samples
 *    (the documented "massive chunks of noise" hazard). The copy also detaches the
 *    bytes from the SDK's recycled buffer so a later frame can't mutate them.
 *  - Returned as a fresh `Uint8Array` (its own ArrayBuffer) so the async pump can
 *    hold/queue it safely; PCM16 is already little-endian on every platform Bun
 *    runs on, matching Deepgram `linear16`.
 */
export function audioFrameToPcm16(frame: LivekitAudioFrameLike): Uint8Array {
	const { data } = frame;
	const out = new Uint8Array(data.byteLength);
	out.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
	return out;
}

// ───────────────────────────── join-token mint ───────────────────────────────

/** The grant a hidden transcription worker needs: subscribe + data, NEVER publish. */
export interface WorkerJoinGrant {
	room: string;
	roomJoin: true;
	/** Pull remote audio to transcribe. */
	canSubscribe: true;
	/** Fan finals back out on the data channel. */
	canPublishData: true;
	/** The worker is a HIDDEN listener — it must never publish media. */
	canPublish: false;
}

/**
 * Build the LiveKit grant for the worker's join token. Pure + asserted in tests so
 * the security posture (subscribe + data only, no media publish, scoped to exactly
 * this room) is provable without minting a real JWT.
 */
export function buildWorkerJoinGrant(roomName: string): WorkerJoinGrant {
	return {
		room: roomName,
		roomJoin: true,
		canSubscribe: true,
		canPublishData: true,
		canPublish: false,
	};
}

/** Stable identity for the worker participant in a room (used by the token). */
export function workerParticipantIdentity(roomName: string): string {
	return `rox-transcribe-worker:${roomName}`;
}

export interface MintWorkerJoinTokenArgs {
	roomName: string;
	apiKey: string;
	apiSecret: string;
	/** Token TTL (seconds or a zeit/ms span). Defaults to 6h for long meetings. */
	ttl?: number | string;
}

/**
 * Mint the hidden-participant join JWT with `livekit-server-sdk` `AccessToken`,
 * mirroring `@rox/rtc`'s `mintVoiceToken` (same SDK, same grant shape) but
 * subscribe-only. `toJwt()` is async in server-sdk v2. The secret is used solely to
 * sign the JWT and is never logged.
 */
export async function mintWorkerJoinToken(
	args: MintWorkerJoinTokenArgs,
): Promise<string> {
	const token = new AccessToken(args.apiKey, args.apiSecret, {
		identity: workerParticipantIdentity(args.roomName),
		name: "Rox Transcriber",
		ttl: args.ttl ?? 60 * 60 * 6,
	});
	token.addGrant(buildWorkerJoinGrant(args.roomName));
	return token.toJwt();
}

// ───────────────────────────── room driver seam ──────────────────────────────

/**
 * The minimal LiveKit transport the source drives, injected so the source is
 * unit-tested with a fake (no native FFI, no live SFU). The PRODUCTION driver
 * (`connectLivekitRoomDriver`) is the `@livekit/rtc-node` adapter.
 */
export interface LivekitRoomDriver {
	/** Remote audio tracks, yielded as each is subscribed, until the room ends. */
	audioTracks(): AsyncIterable<RoomAudioTrack>;
	/** Forward to `room.localParticipant.publishData`. */
	publishData(
		data: Uint8Array,
		opts: { reliable: boolean; topic: string },
	): Promise<void>;
	/** Disconnect + release native resources. */
	close(): Promise<void>;
}

/** Opens a connected driver for one room (injectable; real one connects rtc-node). */
export type LivekitRoomConnector = (opts: {
	roomName: string;
	url: string;
	token: string;
}) => Promise<LivekitRoomDriver>;

/**
 * The PCM sample rate the worker forwards to Deepgram. LiveKit decodes Opus and the
 * `AudioStream` is asked to resample to this fixed mono rate, so every frame handed
 * to Deepgram matches `index.ts`'s `sampleRate: 48000` regardless of the publisher.
 */
export const WORKER_PCM_SAMPLE_RATE = 48000;
const WORKER_PCM_CHANNELS = 1;

/**
 * PRODUCTION driver — connect to the SFU with `@livekit/rtc-node` as a hidden
 * participant and surface each remote AUDIO track as a `RoomAudioTrack` of PCM16
 * frames (via `AudioStream`, resampled to mono `WORKER_PCM_SAMPLE_RATE`).
 *
 * `@livekit/rtc-node` is imported DYNAMICALLY here so neither importing this module
 * nor the test suite loads the native binding — only an actual live connect does.
 * The audio-track queue is fed by `RoomEvent.TrackSubscribed`; the generator drains
 * it and terminates on `RoomEvent.Disconnected`.
 */
export const connectLivekitRoomDriver: LivekitRoomConnector = async ({
	url,
	token,
}) => {
	type Rtc = typeof import("@livekit/rtc-node");
	type RemoteTrack = import("@livekit/rtc-node").RemoteTrack;
	type RemoteTrackPublication =
		import("@livekit/rtc-node").RemoteTrackPublication;
	type RemoteParticipant = import("@livekit/rtc-node").RemoteParticipant;

	const rtc: Rtc = await import("@livekit/rtc-node");
	const { Room, RoomEvent, TrackKind, AudioStream, dispose } = rtc;

	const room = new Room();

	// A bounded async queue: TrackSubscribed pushes, audioTracks() pulls.
	const pending: RoomAudioTrack[] = [];
	let notify: (() => void) | null = null;
	let ended = false;
	const wake = () => {
		const n = notify;
		notify = null;
		n?.();
	};

	/**
	 * Drain one remote audio track to PCM16 frames. `AudioStream` is a
	 * `ReadableStream<AudioFrame>`; we pull via an explicit reader (typed under DOM)
	 * rather than `for await`, so the adapter does not depend on the optional
	 * `ReadableStream[Symbol.asyncIterator]` lib augmentation being enabled.
	 */
	const trackFrames = (track: RemoteTrack): AsyncIterable<Uint8Array> => {
		const stream = new AudioStream(
			track,
			WORKER_PCM_SAMPLE_RATE,
			WORKER_PCM_CHANNELS,
		);
		const reader = stream.getReader();
		return {
			async *[Symbol.asyncIterator]() {
				try {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) return;
						if (value) yield audioFrameToPcm16(value);
					}
				} finally {
					reader.releaseLock();
				}
			},
		};
	};

	room.on(
		RoomEvent.TrackSubscribed,
		(
			track: RemoteTrack,
			_pub: RemoteTrackPublication,
			participant: RemoteParticipant,
		) => {
			// `kind` is `TrackKind | undefined`; only audio tracks are transcribed.
			if (track.kind !== TrackKind.KIND_AUDIO) return;
			pending.push({
				speaker: {
					identity: participant.identity,
					name: participant.name || participant.identity,
				},
				streamStartedAtMs: Date.now(),
				frames: trackFrames(track),
			});
			wake();
		},
	);
	room.on(RoomEvent.Disconnected, () => {
		ended = true;
		wake();
	});

	await room.connect(url, token, { autoSubscribe: true, dynacast: false });

	return {
		async *audioTracks() {
			for (;;) {
				while (pending.length > 0) {
					const next = pending.shift();
					if (next) yield next;
				}
				if (ended) return;
				await new Promise<void>((resolve) => {
					notify = resolve;
				});
			}
		},
		async publishData(data, opts) {
			await room.localParticipant?.publishData(data, {
				reliable: opts.reliable,
				topic: opts.topic,
			});
		},
		async close() {
			ended = true;
			wake();
			await room.disconnect();
			// Release native FFI handles so the worker process can exit cleanly.
			await dispose();
		},
	};
};

// ───────────────────────────── public factory ────────────────────────────────

/**
 * Build the live `RoomAudioSource`: mint the hidden-subscriber join token, connect
 * the LiveKit transport (real rtc-node driver by default), and expose the room's
 * audio tracks + data-publish to the worker orchestration.
 *
 * Connection is LAZY: the SFU connect (and the rtc-node native import) happens on
 * the first `audioTracks()` / `publishData()` call, so constructing the source —
 * e.g. in `main()` before the deploy invocation actually streams — never opens a
 * socket. `connector` is injectable; production uses `connectLivekitRoomDriver`.
 */
export function createLivekitRoomAudioSource(opts: {
	roomName: string;
	livekit: { apiKey: string; apiSecret: string; url: string };
	connector?: LivekitRoomConnector;
}): RoomAudioSource {
	const connector = opts.connector ?? connectLivekitRoomDriver;
	let driverPromise: Promise<LivekitRoomDriver> | null = null;

	const driver = (): Promise<LivekitRoomDriver> => {
		if (!driverPromise) {
			driverPromise = (async () => {
				const token = await mintWorkerJoinToken({
					roomName: opts.roomName,
					apiKey: opts.livekit.apiKey,
					apiSecret: opts.livekit.apiSecret,
				});
				return connector({
					roomName: opts.roomName,
					url: opts.livekit.url,
					token,
				});
			})();
		}
		return driverPromise;
	};

	return {
		roomName: opts.roomName,
		async *audioTracks() {
			const d = await driver();
			yield* d.audioTracks();
		},
		async publishData(data, publishOpts) {
			const d = await driver();
			await d.publishData(data, publishOpts);
		},
		async close() {
			// Only close if we actually connected; never force a connect just to close.
			if (!driverPromise) return;
			const d = await driverPromise;
			await d.close();
		},
	};
}
