"use client";

import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import { Room } from "livekit-client";
import { type ReactNode, useCallback, useRef, useState } from "react";

import { resolveLivekitEnv } from "./env";
import type { VoiceConnectionState } from "./types";

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
