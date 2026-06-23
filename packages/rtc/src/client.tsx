"use client";

import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import { Room, RoomEvent, Track } from "livekit-client";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { resolveLivekitEnv } from "./env";
import {
	createTranscriptCollector,
	decodeTranscriptSegment,
	EMPTY_LIVE_TRANSCRIPT,
	encodeTranscriptSegment,
	type LiveTranscript,
	TRANSCRIPT_DATA_TOPIC,
	type TranscriptSegment,
	type TranscriptSource,
} from "./transcript";
import type { VoiceConnectionState } from "./types";

// Re-exported so app consumers can subscribe to room lifecycle events (e.g. a
// live participant count) without taking a direct dependency on `livekit-client`.
export { RoomEvent };
export type { Room };

export interface UseVoiceRoomArgs {
	/** Org-scoped room name (`org:{organizationId}:voice:{channelId}`). */
	roomName: string;
	/**
	 * Mints a LiveKit access token for the room. In the app this is the tRPC
	 * `rtc.token` mutation; the client never holds `LIVEKIT_API_SECRET`.
	 */
	getToken: (roomName: string) => Promise<string>;
	/** SFU URL override; defaults to `NEXT_PUBLIC_LIVEKIT_URL`. */
	serverUrl?: string;
	/**
	 * Optional injected `Room` factory — tests pass a fake so they never open a
	 * real WebSocket. Defaults to constructing a real `livekit-client` `Room`.
	 */
	createRoom?: () => Room;
}

export interface UseVoiceRoom {
	room: Room | null;
	state: VoiceConnectionState;
	isMuted: boolean;
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	toggleMute: () => Promise<void>;
}

/**
 * App-agnostic voice-room hook over `livekit-client`. Owns the `Room` lifecycle
 * (connect → mic publish → mute toggle → disconnect) and surfaces a small,
 * stable state machine the UI can render.
 */
export function useVoiceRoom({
	roomName,
	getToken,
	serverUrl,
	createRoom,
}: UseVoiceRoomArgs): UseVoiceRoom {
	const roomRef = useRef<Room | null>(null);
	const [room, setRoom] = useState<Room | null>(null);
	const [state, setState] = useState<VoiceConnectionState>("disconnected");
	const [isMuted, setIsMuted] = useState(false);

	const connect = useCallback(async () => {
		if (roomRef.current) {
			return;
		}
		setState("connecting");
		try {
			const url = serverUrl ?? resolveLivekitEnv().url;
			if (!url) {
				throw new Error(
					"NEXT_PUBLIC_LIVEKIT_URL is not set — cannot connect to a voice room.",
				);
			}
			const token = await getToken(roomName);
			const instance = createRoom ? createRoom() : new Room();
			await instance.connect(url, token);
			await instance.localParticipant.setMicrophoneEnabled(true);
			roomRef.current = instance;
			setRoom(instance);
			setIsMuted(false);
			setState("connected");
		} catch (error) {
			setState("error");
			throw error;
		}
	}, [createRoom, getToken, roomName, serverUrl]);

	const disconnect = useCallback(async () => {
		const instance = roomRef.current;
		if (!instance) {
			return;
		}
		await instance.disconnect();
		roomRef.current = null;
		setRoom(null);
		setState("disconnected");
	}, []);

	const toggleMute = useCallback(async () => {
		const instance = roomRef.current;
		if (!instance) {
			return;
		}
		const next = !isMuted;
		await instance.localParticipant.setMicrophoneEnabled(!next);
		setIsMuted(next);
	}, [isMuted]);

	return { room, state, isMuted, connect, disconnect, toggleMute };
}

/** Default mic chunk window (ms). 5s balances latency vs. Groq request count. */
export const DEFAULT_TRANSCRIPT_CHUNK_MS = 5_000;

export interface UseLiveTranscriptArgs {
	/** The connected `Room` (from `useVoiceRoom`); null disables capture. */
	room: Room | null;
	/**
	 * The STT seam. Phase-1 passes a `GroqChunkedTranscriptSource`; swapping the
	 * engine (e.g. LiveKit Agents) is a different source with no hook change.
	 * Null disables capture (e.g. when voice STT is not configured).
	 */
	source: TranscriptSource | null;
	/** Local participant identity (speaker tag on every captured segment). */
	speakerIdentity: string;
	/** Local participant display name (falls back to identity). */
	speakerName: string;
	/** Recording window per chunk; defaults to {@link DEFAULT_TRANSCRIPT_CHUNK_MS}. */
	chunkMs?: number;
	/**
	 * Optional durable backfill for a LATE JOINER: called once with the room name
	 * when capture starts; the returned finalized segments seed the panel so a
	 * participant who joins mid-conversation sees the words spoken before them. In
	 * the app this is the `voice.listSegments` tRPC query. Omitted → no backfill.
	 */
	listSegments?: (roomName: string) => Promise<TranscriptSegment[]>;
	/**
	 * Injected `MediaRecorder` factory — tests pass a fake so no real recorder or
	 * mic is needed. Defaults to the global `MediaRecorder` when available.
	 */
	createRecorder?: (
		stream: MediaStream,
		mimeType: string,
	) => MediaRecorder | null;
}

/** Pick a `MediaRecorder`-supported audio mime type, preferring webm/opus. */
function pickAudioMimeType(): string {
	const candidates = [
		"audio/webm;codecs=opus",
		"audio/webm",
		"audio/ogg;codecs=opus",
		"audio/mp4",
	];
	const Recorder =
		typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined;
	if (Recorder?.isTypeSupported) {
		for (const type of candidates) {
			if (Recorder.isTypeSupported(type)) return type;
		}
	}
	return "audio/webm";
}

/** Read the local participant's microphone `MediaStreamTrack`, if published. */
function localMicTrack(room: Room): MediaStreamTrack | null {
	const publication = room.localParticipant.getTrackPublication(
		Track.Source.Microphone,
	);
	return publication?.track?.mediaStreamTrack ?? null;
}

/**
 * Live Transcript (Streaming-STT Phase-1) capture + fan-out hook. While `room` is
 * connected and a `source` is supplied, it slices the LOCAL participant's
 * microphone into `chunkMs` windows with a `MediaRecorder`, hands each chunk to
 * the injected `TranscriptSource` (which transcribes + persists it), and folds the
 * finalized segments into a capped, render-ready `LiveTranscript`.
 *
 * CROSS-PARTICIPANT FAN-OUT: each speaker transcribes only its OWN mic once, then
 * broadcasts every final to the room's LiveKit DATA CHANNEL
 * (`room.localParticipant.publishData`, reliable). All clients subscribe to
 * `RoomEvent.DataReceived` and merge incoming remote finals through the SAME
 * reducer (dedupe by id), so everyone sees everyone's words live — no server
 * fan-out infra and no N² re-transcription. A LATE JOINER additionally backfills
 * the room's prior finals from durable storage via `listSegments` on connect.
 *
 * Returns an empty transcript when capture is not possible (no room, no source, no
 * `MediaRecorder`, mic not yet published).
 */
export function useLiveTranscript({
	room,
	source,
	speakerIdentity,
	speakerName,
	chunkMs = DEFAULT_TRANSCRIPT_CHUNK_MS,
	listSegments,
	createRecorder,
}: UseLiveTranscriptArgs): LiveTranscript {
	const [transcript, setTranscript] = useState<LiveTranscript>(
		EMPTY_LIVE_TRANSCRIPT,
	);

	useEffect(() => {
		if (!room || !source) {
			setTranscript(EMPTY_LIVE_TRANSCRIPT);
			return;
		}

		let stopped = false;

		const collector = createTranscriptCollector({
			source,
			onChange: setTranscript,
			onError: (error) => {
				console.error("[useLiveTranscript] chunk transcription failed", error);
			},
			// Fan out every LOCAL final to the room over the data channel. Reliable
			// delivery (finals must not drop); a publish failure is logged but never
			// breaks local capture, which already folded the segment.
			onSegment: (segment) => {
				if (stopped) return;
				void room.localParticipant
					.publishData(encodeTranscriptSegment(segment), {
						reliable: true,
						topic: TRANSCRIPT_DATA_TOPIC,
					})
					.catch((error) => {
						console.error("[useLiveTranscript] fan-out publish failed", error);
					});
			},
		});

		// Subscribe to remote participants' finals and merge them into the SAME log.
		const onData = (
			payload: Uint8Array,
			_participant?: unknown,
			_kind?: unknown,
			topic?: string,
		) => {
			// Ignore data messages from other features sharing the channel.
			if (topic && topic !== TRANSCRIPT_DATA_TOPIC) return;
			const segment = decodeTranscriptSegment(payload, room.name);
			if (segment) collector.mergeRemote(segment);
		};
		room.on(RoomEvent.DataReceived, onData);

		// Late-joiner backfill: seed the panel with the room's prior finals so a
		// participant who joins mid-conversation isn't staring at a blank transcript.
		if (listSegments) {
			void listSegments(room.name)
				.then((segments) => {
					if (!stopped) collector.seed(segments);
				})
				.catch((error) => {
					console.error("[useLiveTranscript] backfill failed", error);
				});
		}

		const makeRecorder =
			createRecorder ??
			((stream: MediaStream, mimeType: string) =>
				typeof MediaRecorder !== "undefined"
					? new MediaRecorder(stream, { mimeType })
					: null);

		let recorder: MediaRecorder | null = null;
		let cycle: ReturnType<typeof setInterval> | null = null;

		const start = () => {
			const track = localMicTrack(room);
			if (!track) return false;
			const mimeType = pickAudioMimeType();
			const stream = new MediaStream([track]);
			recorder = makeRecorder(stream, mimeType);
			if (!recorder) return false;

			recorder.ondataavailable = (event: BlobEvent) => {
				if (stopped || event.data.size === 0) return;
				const capturedAt = Date.now();
				void event.data.arrayBuffer().then((buffer) => {
					void collector.ingest({
						roomName: room.name,
						audio: new Uint8Array(buffer),
						mimeType,
						speakerIdentity,
						speakerName,
						capturedAt,
					});
				});
			};

			// `start(timeslice)` would emit mid-utterance fragments that decode
			// poorly; instead we cut a fresh, self-contained clip each window by
			// stop()-ing (flushes a complete blob) and immediately restarting.
			recorder.start();
			cycle = setInterval(() => {
				if (recorder && recorder.state === "recording") {
					recorder.stop();
					recorder.start();
				}
			}, chunkMs);
			return true;
		};

		// The mic may publish slightly after connect; retry until the track exists.
		let armRetry: ReturnType<typeof setInterval> | null = null;
		if (!start()) {
			armRetry = setInterval(() => {
				if (start() && armRetry) {
					clearInterval(armRetry);
					armRetry = null;
				}
			}, 500);
		}

		return () => {
			stopped = true;
			room.off(RoomEvent.DataReceived, onData);
			if (cycle) clearInterval(cycle);
			if (armRetry) clearInterval(armRetry);
			if (recorder && recorder.state !== "inactive") {
				recorder.ondataavailable = null;
				recorder.stop();
			}
			collector.reset();
		};
	}, [
		room,
		source,
		speakerIdentity,
		speakerName,
		chunkMs,
		listSegments,
		createRecorder,
	]);

	return transcript;
}

export interface RoxRoomAudioRendererProps {
	/** The connected `Room` (from `useVoiceRoom`). Renders nothing when null. */
	room: Room | null;
	children?: ReactNode;
}

/**
 * Renders the audio tracks of every remote participant in the room. Wraps the
 * LiveKit `RoomContext` so consumers don't need to thread it manually.
 */
export function RoxRoomAudioRenderer({
	room,
	children,
}: RoxRoomAudioRendererProps) {
	if (!room) {
		return null;
	}
	return (
		<RoomContext.Provider value={room}>
			<RoomAudioRenderer />
			{children}
		</RoomContext.Provider>
	);
}
