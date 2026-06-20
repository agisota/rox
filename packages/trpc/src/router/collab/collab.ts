import { organizationIdFromRoomId, type RoxUserMeta } from "@rox/collab";
import { authorizeRoom, type LiveblocksRoomClient } from "@rox/collab/auth";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

/**
 * Public-facing presence info attached to the minted LiveBlocks session.
 * `organizationId` is added by `authorizeRoom` itself, so the router only
 * supplies the display fields.
 */
type RoomUserInfo = Omit<RoxUserMeta["info"], "organizationId">;

export interface AuthorizeRoomForMemberArgs {
	/** Authenticated user id (better-auth). */
	userId: string;
	/** The org-scoped room the caller wants to enter. */
	roomId: string;
	/** Display info attached to the session for presence. */
	userInfo: RoomUserInfo;
	ports: {
		/**
		 * Verify the caller is an active member of the room's org and return the
		 * org id they are actually authorized for. The router injects
		 * `requireActiveOrgMembership`; tests inject a fake. The returned org is
		 * cross-checked against the room id inside `authorizeRoom`, so a mismatch
		 * (member of a different org than the room) is denied.
		 */
		requireMembership: () => Promise<string>;
		/** Injected LiveBlocks node client (tests pass a fake). */
		liveblocks?: LiveblocksRoomClient;
	};
}

/**
 * Pure, transport-agnostic core of `collab.authRoom`. Extracted (per the repo's
 * port-injection test pattern) so it can be unit-tested without constructing a
 * tRPC context or hitting the LiveBlocks cloud.
 *
 * Order matters: the room id is validated as org-scoped FIRST (cheap, no I/O),
 * THEN membership is verified, THEN the token is minted. A non-org-scoped room
 * never triggers a membership lookup or a cloud call.
 */
export async function authorizeRoomForMember({
	userId,
	roomId,
	userInfo,
	ports,
}: AuthorizeRoomForMemberArgs): Promise<{ token: string }> {
	const roomOrg = organizationIdFromRoomId(roomId);
	if (!roomOrg) {
		throw new Error(`Room id is not org-scoped: ${roomId}`);
	}

	const organizationId = await ports.requireMembership();

	return authorizeRoom({
		userId,
		organizationId,
		roomId,
		userInfo: { ...userInfo, organizationId },
		liveblocks: ports.liveblocks,
	});
}

export const collabRouter = {
	/**
	 * Mint a short-lived LiveBlocks session token for an org-scoped collaboration
	 * room. The caller never sees `LIVEBLOCKS_SECRET_KEY`; the token grants access
	 * only when the caller is a verified active member of the room's org.
	 *
	 * Room ids are `org:{organizationId}:dashboard:{dashboardId}` (see
	 * `@rox/collab` `dashboardRoomId`). The org is derived from the id and
	 * cross-checked against the caller's membership server-side.
	 */
	authRoom: protectedProcedure
		.input(z.object({ roomId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			return authorizeRoomForMember({
				userId: ctx.session.user.id,
				roomId: input.roomId,
				userInfo: {
					name: ctx.session.user.name ?? ctx.session.user.email ?? "",
					avatarUrl: ctx.session.user.image ?? null,
				},
				ports: {
					requireMembership: () => requireActiveOrgMembership(ctx),
				},
			});
		}),
} satisfies TRPCRouterRecord;
