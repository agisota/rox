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
	useLiveTranscript,
	useVoiceRoom,
} from "@rox/rtc/client";
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
	 * Live transcript (Streaming-STT Phase-1): finalized speech segments captured
	 * from the local mic in N-second chunks via Groq Whisper and persisted to
	 * `live_transcript_segments`. Empty while disconnected or when server-side STT
	 * (GROQ_API_KEY) is not configured.
	 */
	transcript: LiveTranscript;
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

	// THE SWAP SEAM: Phase-1 binds the Groq chunked source to the cloud
	// `voice.transcribeChunk` mutation (which transcribes + persists each chunk).
	// Swapping to LiveKit Agents later is a different `TranscriptSource` here only.
	const transcriptSource = useMemo<TranscriptSource | null>(() => {
		if (!sttConfigured) return null;
		return createGroqChunkedTranscriptSource((payload) =>
			apiTrpcClient.voice.transcribeChunk.mutate(payload),
		);
	}, [sttConfigured]);

	const localIdentity = room?.localParticipant.identity ?? "";
	const localName = room?.localParticipant.name ?? localIdentity;

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

	const transcript = useLiveTranscript({
		room,
		source: transcriptSource,
		speakerIdentity: localIdentity,
		speakerName: localName,
		listSegments,
	});

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

	return { ...voice, roomName, participantCount, roomActivity, transcript };
}
