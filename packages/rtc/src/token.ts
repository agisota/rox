import { AccessToken } from "livekit-server-sdk";

import { requireLivekitServerCredentials } from "./env";
import { organizationIdFromRoomName } from "./types";

export interface MintVoiceTokenArgs {
	/** Authenticated user id (better-auth) — becomes the participant identity. */
	userId: string;
	/** Organization the caller is an active member of. */
	organizationId: string;
	/** Org-scoped room name (`org:{organizationId}:voice:{channelId}`). */
	roomName: string;
	/** Display name shown to other participants. */
	displayName?: string;
	/** Token TTL (seconds or a zeit/ms span). Defaults to 1 hour. */
	ttl?: number | string;
	/**
	 * Optional injected credentials — tests pass fixed key/secret so they never
	 * read the real environment. Defaults to the env-resolved credentials.
	 */
	credentials?: { apiKey: string; apiSecret: string };
}

/**
 * Mint a LiveKit access token granting `roomJoin` for a single org-scoped room.
 *
 * Authorization is id-derived: the room name carries its org
 * (`org:{organizationId}:voice:...`); we grant only when the room's org matches
 * the caller's verified org. The caller (the tRPC `rtc.token` procedure) proves
 * the user actually belongs to `organizationId`.
 */
export async function mintVoiceToken({
	userId,
	organizationId,
	roomName,
	displayName,
	ttl = 60 * 60,
	credentials,
}: MintVoiceTokenArgs): Promise<string> {
	if (!organizationId) {
		throw new Error("organizationId is required to mint a voice token");
	}
	const roomOrg = organizationIdFromRoomName(roomName);
	if (!roomOrg) {
		throw new Error(`Room name is not org-scoped: ${roomName}`);
	}
	if (roomOrg !== organizationId) {
		throw new Error(
			`Room ${roomName} belongs to org ${roomOrg}, not ${organizationId}`,
		);
	}

	const { apiKey, apiSecret } =
		credentials ?? requireLivekitServerCredentials();

	const token = new AccessToken(apiKey, apiSecret, {
		identity: userId,
		name: displayName,
		ttl,
	});
	token.addGrant({
		room: roomName,
		roomJoin: true,
		canPublish: true,
		canSubscribe: true,
		canPublishData: true,
	});
	return token.toJwt();
}
