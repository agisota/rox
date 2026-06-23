import { Liveblocks } from "@liveblocks/node";

import { requireLiveblocksSecretKey } from "./env";
import { organizationIdFromRoomId, type RoxUserMeta } from "./types";

/** A LiveBlocks session, structurally — the subset `authorizeRoom` uses. */
interface LiveblocksSession {
	readonly FULL_ACCESS: readonly string[];
	/** Read + presence scope (`["room:read","room:presence:write","comments:read"]`). */
	readonly READ_ACCESS: readonly string[];
	allow(roomIdOrPattern: string, perms: readonly string[]): LiveblocksSession;
	authorize(): Promise<{ status: number; body: string }>;
}

/**
 * The LiveBlocks node client, structurally — only `prepareSession`. Declared
 * structurally (not `Pick<Liveblocks, ...>`) so tests can inject a plain fake
 * without re-implementing the SDK's private members.
 */
export interface LiveblocksRoomClient {
	prepareSession(
		userId: string,
		options: { userInfo: Record<string, unknown> },
	): LiveblocksSession;
}

export interface AuthorizeRoomArgs {
	/** Authenticated user id (better-auth). */
	userId: string;
	/** Organization the caller is an active member of. */
	organizationId: string;
	/** The room the caller wants to enter. Must be org-scoped. */
	roomId: string;
	/** Public-facing user info attached to the session for presence. */
	userInfo: RoxUserMeta["info"];
	/**
	 * Optional injected LiveBlocks node client — tests pass a mock so they never
	 * hit the LiveBlocks cloud. Defaults to a real client built from the secret.
	 */
	liveblocks?: LiveblocksRoomClient;
	/** Permission to grant. Defaults to full access (dashboard rooms). */
	access?: "full" | "read";
}

export interface AuthorizeRoomResult {
	/** Short-lived session token the client uses to open the room. */
	token: string;
}

/**
 * Grant a user a scoped LiveBlocks session for a single room.
 *
 * Authorization is purely id-derived: the room id carries its org
 * (`org:{organizationId}:...`), so we grant access only when the room's org
 * matches the caller's verified org membership. No separate room→org lookup and
 * no new authz model — the caller (the tRPC `collab.authRoom` procedure) is
 * responsible for proving `organizationId` is one the user actually belongs to.
 */
export async function authorizeRoom({
	userId,
	organizationId,
	roomId,
	userInfo,
	liveblocks,
	access,
}: AuthorizeRoomArgs): Promise<AuthorizeRoomResult> {
	const roomOrg = organizationIdFromRoomId(roomId);
	if (!roomOrg) {
		throw new Error(`Room id is not org-scoped: ${roomId}`);
	}
	if (roomOrg !== organizationId) {
		throw new Error(
			`Room ${roomId} belongs to org ${roomOrg}, not ${organizationId}`,
		);
	}

	const client =
		liveblocks ?? new Liveblocks({ secret: requireLiveblocksSecretKey() });

	const session = client.prepareSession(userId, {
		userInfo: { ...userInfo, organizationId },
	});
	// `read` → LiveBlocks' documented read+presence scope (`READ_ACCESS`);
	// everything else (incl. dashboard rooms) keeps full access.
	const perms =
		(access ?? "full") === "read" ? session.READ_ACCESS : session.FULL_ACCESS;
	session.allow(roomId, perms);

	const { body, status } = await session.authorize();
	if (status !== 200) {
		throw new Error(`LiveBlocks session denied (status ${status})`);
	}
	const parsed = JSON.parse(body) as { token: string };
	return { token: parsed.token };
}
