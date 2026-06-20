import { organizationIdFromRoomName } from "@rox/rtc";
import { mintVoiceToken } from "@rox/rtc/token";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

export interface MintVoiceTokenForMemberArgs {
	/** Authenticated user id (better-auth) — becomes the participant identity. */
	userId: string;
	/** The org-scoped voice room the caller wants to join. */
	roomName: string;
	/** Display name shown to other participants. */
	displayName?: string;
	ports: {
		/**
		 * Verify the caller is an active member of the room's org and return the
		 * org id they are authorized for. The router injects
		 * `requireActiveOrgMembership`; tests inject a fake. The returned org is
		 * cross-checked against the room name inside `mintVoiceToken`.
		 */
		requireMembership: () => Promise<string>;
		/** Injected LiveKit credentials (tests pass a fixed key/secret). */
		credentials?: { apiKey: string; apiSecret: string };
	};
}

/**
 * Pure, transport-agnostic core of `rtc.token`. Extracted (per the repo's
 * port-injection test pattern) so it can be unit-tested without a tRPC context
 * or the real environment.
 *
 * Validates the room name is org-scoped FIRST (cheap, no I/O), THEN verifies
 * membership, THEN mints the LiveKit access token.
 */
export async function mintVoiceTokenForMember({
	userId,
	roomName,
	displayName,
	ports,
}: MintVoiceTokenForMemberArgs): Promise<string> {
	const roomOrg = organizationIdFromRoomName(roomName);
	if (!roomOrg) {
		throw new Error(`Room name is not org-scoped: ${roomName}`);
	}

	const organizationId = await ports.requireMembership();

	return mintVoiceToken({
		userId,
		organizationId,
		roomName,
		displayName,
		credentials: ports.credentials,
	});
}

export const rtcRouter = {
	/**
	 * Mint a short-lived LiveKit access token granting `roomJoin` for an
	 * org-scoped voice room. The caller never sees `LIVEKIT_API_KEY` /
	 * `LIVEKIT_API_SECRET`; the token is granted only when the caller is a
	 * verified active member of the room's org.
	 *
	 * Room names are `org:{organizationId}:voice:{channelId}` (see `@rox/rtc`
	 * `voiceRoomName`). The org is derived from the name and cross-checked against
	 * the caller's membership server-side.
	 */
	token: protectedProcedure
		.input(z.object({ roomName: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const token = await mintVoiceTokenForMember({
				userId: ctx.session.user.id,
				roomName: input.roomName,
				displayName: ctx.session.user.name ?? ctx.session.user.email ?? "",
				ports: {
					requireMembership: () => requireActiveOrgMembership(ctx),
				},
			});
			return { token };
		}),
} satisfies TRPCRouterRecord;
