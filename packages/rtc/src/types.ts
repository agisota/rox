/**
 * Shared types + room-name helpers for `@rox/rtc` (LiveKit voice).
 *
 * Note: distinct from `packages/db/src/schema/voice.ts` (`voice_transcriptions`),
 * which is per-user voice DICTATION (Whisper/R1), not realtime media. `@rox/rtc`
 * is the realtime audio/video/screenshare transport.
 */

/** Connection lifecycle state surfaced by `useVoiceRoom`. */
export type VoiceConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

/**
 * Voice room-name factory. Org/channel-scoped so a server can authorize a token
 * from the name alone (`org:{organizationId}:voice:{channelId}`).
 */
export function voiceRoomName(
	organizationId: string,
	channelId: string,
): string {
	return `org:${organizationId}:voice:${channelId}`;
}

/** Parse the organization id back out of a voice room name. */
export function organizationIdFromRoomName(roomName: string): string | null {
	const match = /^org:([^:]+):voice:/.exec(roomName);
	return match ? (match[1] ?? null) : null;
}
