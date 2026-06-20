import { voiceRoomName } from "@rox/rtc";
import { RoomEvent, type UseVoiceRoom, useVoiceRoom } from "@rox/rtc/client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
}

/**
 * Desktop glue around `@rox/rtc`'s `useVoiceRoom`: derives the org-scoped room
 * name, mints the access token through the cloud `rtc.token` mutation (the
 * client never holds `LIVEKIT_API_SECRET`), and tracks a live participant count
 * by subscribing to the connected `Room`.
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

	const [participantCount, setParticipantCount] = useState(0);

	useEffect(() => {
		if (!room) {
			setParticipantCount(0);
			return;
		}
		// `numParticipants` counts remotes; the local participant is always present
		// while connected, so add one for an accurate "people in the room" total.
		const sync = () => setParticipantCount(room.numParticipants + 1);
		sync();
		room
			.on(RoomEvent.ParticipantConnected, sync)
			.on(RoomEvent.ParticipantDisconnected, sync)
			.on(RoomEvent.ConnectionStateChanged, sync);
		return () => {
			room
				.off(RoomEvent.ParticipantConnected, sync)
				.off(RoomEvent.ParticipantDisconnected, sync)
				.off(RoomEvent.ConnectionStateChanged, sync);
		};
	}, [room]);

	return { ...voice, roomName, participantCount };
}
