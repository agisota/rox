import { voiceRoomName } from "@rox/rtc";
import {
	createRoomActivityState,
	EMPTY_ROOM_ACTIVITY,
	type RoomActivity,
	type RoomActivityState,
	reduceRoomActivity,
	snapshotRoom,
	toRoomActivity,
} from "@rox/rtc/activity";
import {
	RoomEvent,
	type UseVoiceRoom,
	useDeepgramStreamingTranscript,
	useLiveTranscript,
	useVoiceRoom,
} from "@rox/rtc/client";
import type {
	MintStreamToken,
	PersistStreamSegment,
} from "@rox/rtc/deepgram-stream";
import {
	createGroqChunkedTranscriptSource,
	type LiveTranscript,
	type TranscriptSegment,
	type TranscriptSource,
} from "@rox/rtc/transcript";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export interface UseWorkspaceVoiceRoomArgs {
	/** Active organization id — the voice room is org-scoped. */
	organizationId: string;
	/** Workspace id — used as the voice channel within the org. */
	workspaceId: string;
}

export interface UseWorkspaceVoiceRoom extends UseVoiceRoom {
	/** Stable org-scoped room name (`org:{org}:voice:{workspaceId}`). */
	roomName: string;
	/** Live participant count (local + remotes) while connected, else 0. */
	participantCount: number;
	/**
	 * Live presence/speaking model derived from the connected `Room` (roster, the
	 * currently-speaking set, and a capped activity timeline). Empty while
	 * disconnected. No STT — this is the `live.transcript` shell.
	 */
	roomActivity: RoomActivity;
	/**
	 * Live transcript: finalized speech segments shown in the room activity panel.
	 *
	 * Two SOURCES feed the SAME surface, chosen by availability (no UI difference):
	 *   - In-App STREAMING (preferred): the local mic is streamed straight to
	 *     Deepgram realtime from the renderer (sub-second words, no worker) when a
	 *     server `DEEPGRAM_API_KEY` is configured to mint short-lived tokens;
	 *   - Phase-1 CHUNKED (fallback): the local mic is sliced into N-second clips
	 *     and transcribed via Groq Whisper when streaming is unavailable.
	 *
	 * Both fan out over the LiveKit data channel + persist to `live_transcript_segments`
	 * + render through the same reducer/panel. Empty while disconnected or when no
	 * STT backend is configured.
	 */
	transcript: LiveTranscript;
	/**
	 * Which source is currently driving `transcript`: the lower-latency Deepgram
	 * `"streaming"` path or the `"chunked"` Groq fallback (`"none"` when STT is off
	 * or disconnected). Exposed for diagnostics/telemetry; the panel is identical.
	 */
	transcriptSource: "streaming" | "chunked" | "none";
}

/**
 * Re-feed cadence (ms) used to flush debounced speak transitions. LiveKit only
 * fires `ActiveSpeakersChanged` on change, so a pending speak-start/stop that is
 * waiting out its min-duration debounce needs a follow-up tick to commit. We
 * poll the room snapshot on this interval ONLY while connected; it is cheap
 * (pure getters, no network) and stops on disconnect.
 */
const ACTIVITY_FLUSH_INTERVAL_MS = 250;

/**
 * Desktop glue around `@rox/rtc`'s `useVoiceRoom`: derives the org-scoped room
 * name, mints the access token through the cloud `rtc.token` mutation (the
 * client never holds `LIVEKIT_API_SECRET`), and tracks live participant count +
 * a presence/speaking activity model by subscribing to the connected `Room`.
 */
export function useWorkspaceVoiceRoom({
	organizationId,
	workspaceId,
}: UseWorkspaceVoiceRoomArgs): UseWorkspaceVoiceRoom {
	const roomName = useMemo(
		() => voiceRoomName(organizationId, workspaceId),
		[organizationId, workspaceId],
	);

	const getToken = useCallback(async (name: string) => {
		const { token } = await apiTrpcClient.rtc.token.mutate({ roomName: name });
		return token;
	}, []);

	const voice = useVoiceRoom({ roomName, getToken });
	const { room } = voice;

	// Server-side Whisper availability — with a shared GROQ_API_KEY this is true;
	// when absent, the transcript source stays null so we never record a mic the
	// server cannot transcribe.
	const { data: voiceConfig } = useQuery({
		queryKey: ["voice", "isConfigured"],
		queryFn: () => apiTrpcClient.voice.isConfigured.query(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const sttConfigured = voiceConfig?.configured ?? false;

	// In-App STREAMING availability — true when the server has a `DEEPGRAM_API_KEY`
	// to mint short-lived tokens. When true we prefer the lower-latency Deepgram
	// stream; otherwise we fall back to the Phase-1 chunked Groq source below.
	const { data: streamConfig } = useQuery({
		queryKey: ["voice", "isStreamConfigured"],
		queryFn: () => apiTrpcClient.voice.isStreamConfigured.query(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const streamingConfigured = streamConfig?.configured ?? false;

	// THE SWAP SEAM: Phase-1 binds the Groq chunked source to the cloud
	// `voice.transcribeChunk` mutation (which transcribes + persists each chunk).
	// Used as the FALLBACK when in-app streaming is unavailable (no Deepgram key).
	const chunkedSource = useMemo<TranscriptSource | null>(() => {
		if (!sttConfigured || streamingConfigured) return null;
		return createGroqChunkedTranscriptSource((payload) =>
			apiTrpcClient.voice.transcribeChunk.mutate(payload),
		);
	}, [sttConfigured, streamingConfigured]);

	const localIdentity = room?.localParticipant.identity ?? "";
	const localName = room?.localParticipant.name ?? localIdentity;

	// Mint a short-lived Deepgram token via the backend (the renderer never holds
	// the real key). Guarded: if the procedure is unavailable (older server) the
	// thrown error disables streaming and the chunked fallback stays active.
	const mintToken = useMemo<MintStreamToken>(
		() => async () => {
			const { token, expiresAt } =
				await apiTrpcClient.voice.deepgramStreamToken.mutate();
			return { token, expiresAt };
		},
		[],
	);

	// Persist a streaming FINAL durably (already-transcribed text — no re-STT).
	// Reuses the same `live_transcript_segments` store as the chunked path so the
	// late-joiner backfill + panel read both sources identically.
	const persistSegment = useMemo<PersistStreamSegment>(
		() => async (segment) => {
			await apiTrpcClient.voice.persistTranscriptSegment.mutate({
				roomName: segment.roomName,
				text: segment.text,
				language: segment.language,
				speakerIdentity: segment.speakerIdentity,
				speakerName: segment.speakerName,
				capturedAt: segment.capturedAt,
			});
		},
		[],
	);

	// Late-joiner backfill: replay the room's prior finals from durable storage so
	// a participant who joins mid-conversation sees the transcript so far. Gated on
	// STT being configured (same signal as capture) to avoid a pointless query.
	// `captured_at` arrives as a `Date` (superjson) → normalize to epoch ms so the
	// rows fold through the same reducer as live + remote segments.
	const listSegments = useMemo(() => {
		if (!sttConfigured) return undefined;
		return async (name: string): Promise<TranscriptSegment[]> => {
			const rows = await apiTrpcClient.voice.listSegments.query({
				roomName: name,
			});
			return rows.map((row) => ({
				id: row.id,
				roomName: row.roomName,
				speakerIdentity: row.speakerIdentity,
				speakerName: row.speakerName,
				text: row.text,
				language: row.language,
				capturedAt: new Date(row.capturedAt).getTime(),
			}));
		};
	}, [sttConfigured]);

	// In-App STREAMING source (preferred): stream the local mic to Deepgram for
	// sub-second words. `enabled` only when configured + connected; when off it
	// returns an empty transcript and we render the chunked fallback instead.
	const streamingTranscript = useDeepgramStreamingTranscript({
		room,
		enabled: streamingConfigured && Boolean(room),
		speakerIdentity: localIdentity,
		speakerName: localName,
		mintToken,
		persist: persistSegment,
		listSegments,
	});

	// Phase-1 CHUNKED fallback (Groq Whisper). `chunkedSource` is null whenever
	// streaming is configured, so only ONE source ever captures the mic at a time.
	const chunkedTranscript = useLiveTranscript({
		room,
		source: chunkedSource,
		speakerIdentity: localIdentity,
		speakerName: localName,
		listSegments,
	});

	// Pick the active source. Streaming wins when configured; else the chunked
	// path; else nothing (STT not configured / disconnected). The panel is identical.
	const transcriptSource: UseWorkspaceVoiceRoom["transcriptSource"] = room
		? streamingConfigured
			? "streaming"
			: sttConfigured
				? "chunked"
				: "none"
		: "none";
	const transcript =
		transcriptSource === "streaming" ? streamingTranscript : chunkedTranscript;

	const [participantCount, setParticipantCount] = useState(0);
	const [roomActivity, setRoomActivity] =
		useState<RoomActivity>(EMPTY_ROOM_ACTIVITY);
	// Reducer state is kept in a ref so successive events fold onto each other
	// without re-subscribing; only the projected `RoomActivity` drives renders.
	const activityRef = useRef<RoomActivityState>(createRoomActivityState());

	useEffect(() => {
		if (!room) {
			setParticipantCount(0);
			setRoomActivity(EMPTY_ROOM_ACTIVITY);
			activityRef.current = createRoomActivityState();
			return;
		}
		// `numParticipants` counts remotes; the local participant is always present
		// while connected, so add one for an accurate "people in the room" total.
		const syncCount = () => setParticipantCount(room.numParticipants + 1);

		const syncActivity = () => {
			const nextState = reduceRoomActivity(
				activityRef.current,
				snapshotRoom(room),
				Date.now(),
			);
			activityRef.current = nextState;
			setRoomActivity(toRoomActivity(nextState));
		};

		const sync = () => {
			syncCount();
			syncActivity();
		};

		sync();
		room
			.on(RoomEvent.ParticipantConnected, sync)
			.on(RoomEvent.ParticipantDisconnected, sync)
			.on(RoomEvent.ConnectionStateChanged, sync)
			.on(RoomEvent.ActiveSpeakersChanged, syncActivity)
			.on(RoomEvent.TrackMuted, syncActivity)
			.on(RoomEvent.TrackUnmuted, syncActivity);

		// Flush pending (debounced) speak transitions even when no new event fires.
		const flush = setInterval(syncActivity, ACTIVITY_FLUSH_INTERVAL_MS);

		return () => {
			clearInterval(flush);
			room
				.off(RoomEvent.ParticipantConnected, sync)
				.off(RoomEvent.ParticipantDisconnected, sync)
				.off(RoomEvent.ConnectionStateChanged, sync)
				.off(RoomEvent.ActiveSpeakersChanged, syncActivity)
				.off(RoomEvent.TrackMuted, syncActivity)
				.off(RoomEvent.TrackUnmuted, syncActivity);
		};
	}, [room]);

	return {
		...voice,
		roomName,
		participantCount,
		roomActivity,
		transcript,
		transcriptSource,
	};
}
