import { describe, expect, mock, test } from "bun:test";
import { dashboardRoomId, noteRoomId } from "@rox/collab";

// collab.ts imports `db` from @rox/db/client (the note-room ACL resolver), which
// inits the real neon() client at module load. Stub it BEFORE importing the
// router so these tests (which inject ports directly) never touch a live DB.
mock.module("@rox/db/client", () => ({ db: {}, dbWs: {} }));

const { authorizeRoomForMember } = await import("./collab");

const userInfo = { name: "Ada", avatarUrl: null };

/**
 * A fake LiveBlocks node client mirroring `packages/collab/src/auth.test.ts`,
 * so this router test never touches the LiveBlocks cloud.
 */
function fakeLiveblocks() {
	const granted: Array<{ room: string; perms: readonly string[] }> = [];
	const authorize = mock(async () => ({
		status: 200,
		body: JSON.stringify({ token: "lb_session_token" }),
	}));
	const session = {
		FULL_ACCESS: ["room:write"] as const,
		READ_ACCESS: ["room:read", "room:presence:write", "comments:read"] as const,
		allow(room: string, perms: readonly string[]) {
			granted.push({ room, perms });
			return session;
		},
		authorize,
	};
	const prepareSession = mock(() => session);
	return { client: { prepareSession }, granted, prepareSession, authorize };
}

describe("authorizeRoomForMember (collab.authRoom core)", () => {
	test("mints a token for a member of the room's org", async () => {
		const lb = fakeLiveblocks();
		const roomId = dashboardRoomId("org_1", "dash_42");
		const requireMembership = mock(async () => "org_1");

		const result = await authorizeRoomForMember({
			userId: "user_1",
			roomId,
			userInfo,
			ports: { requireMembership, liveblocks: lb.client },
		});

		expect(result.token).toBe("lb_session_token");
		expect(requireMembership).toHaveBeenCalledTimes(1);
		expect(lb.granted).toEqual([{ room: roomId, perms: ["room:write"] }]);
	});

	test("rejects a non-org-scoped room before any membership/cloud work", async () => {
		const lb = fakeLiveblocks();
		const requireMembership = mock(async () => "org_1");

		await expect(
			authorizeRoomForMember({
				userId: "user_1",
				roomId: "freeform-room",
				userInfo,
				ports: { requireMembership, liveblocks: lb.client },
			}),
		).rejects.toThrow(/not org-scoped/);
		expect(requireMembership).not.toHaveBeenCalled();
		expect(lb.prepareSession).not.toHaveBeenCalled();
	});

	test("denies when the caller is not a member of the room's org", async () => {
		const lb = fakeLiveblocks();
		const roomId = dashboardRoomId("org_1", "dash_42");
		// Membership check authorizes a DIFFERENT org than the room carries.
		const requireMembership = mock(async () => "org_2");

		await expect(
			authorizeRoomForMember({
				userId: "user_1",
				roomId,
				userInfo,
				ports: { requireMembership, liveblocks: lb.client },
			}),
		).rejects.toThrow(/belongs to org org_1, not org_2/);
		expect(lb.prepareSession).not.toHaveBeenCalled();
	});

	test("propagates a membership-check rejection (e.g. not a member)", async () => {
		const lb = fakeLiveblocks();
		const roomId = dashboardRoomId("org_1", "dash_42");
		const requireMembership = mock(async () => {
			throw new Error("FORBIDDEN: not a member");
		});

		await expect(
			authorizeRoomForMember({
				userId: "user_1",
				roomId,
				userInfo,
				ports: { requireMembership, liveblocks: lb.client },
			}),
		).rejects.toThrow(/not a member/);
		expect(lb.prepareSession).not.toHaveBeenCalled();
	});

	test("denies a note room when resolveRoomAccess returns 'deny' (N1)", async () => {
		const lb = fakeLiveblocks();
		const roomId = noteRoomId("org_1", "note_42");
		const requireMembership = mock(async () => "org_1");
		const resolveRoomAccess = mock(async () => "deny" as const);

		await expect(
			authorizeRoomForMember({
				userId: "user_1",
				roomId,
				userInfo,
				ports: { requireMembership, liveblocks: lb.client, resolveRoomAccess },
			}),
		).rejects.toThrow(/Access denied to room/);
		expect(resolveRoomAccess).toHaveBeenCalledWith(roomId, "org_1");
		expect(lb.prepareSession).not.toHaveBeenCalled();
	});

	test("grants read perms when resolveRoomAccess returns 'read' (N1 viewer)", async () => {
		const lb = fakeLiveblocks();
		const roomId = noteRoomId("org_1", "note_42");
		const requireMembership = mock(async () => "org_1");
		const resolveRoomAccess = mock(async () => "read" as const);

		const result = await authorizeRoomForMember({
			userId: "user_1",
			roomId,
			userInfo,
			ports: { requireMembership, liveblocks: lb.client, resolveRoomAccess },
		});

		expect(result.token).toBe("lb_session_token");
		expect(lb.granted).toEqual([
			{
				room: roomId,
				perms: ["room:read", "room:presence:write", "comments:read"],
			},
		]);
	});

	test("grants full perms when resolveRoomAccess returns 'full' (N1 owner/editor)", async () => {
		const lb = fakeLiveblocks();
		const roomId = noteRoomId("org_1", "note_42");
		const requireMembership = mock(async () => "org_1");
		const resolveRoomAccess = mock(async () => "full" as const);

		await authorizeRoomForMember({
			userId: "user_1",
			roomId,
			userInfo,
			ports: { requireMembership, liveblocks: lb.client, resolveRoomAccess },
		});

		expect(lb.granted).toEqual([{ room: roomId, perms: ["room:write"] }]);
	});

	test("non-note rooms keep full access without resolveRoomAccess", async () => {
		const lb = fakeLiveblocks();
		const roomId = dashboardRoomId("org_1", "dash_42");
		const requireMembership = mock(async () => "org_1");

		await authorizeRoomForMember({
			userId: "user_1",
			roomId,
			userInfo,
			ports: { requireMembership, liveblocks: lb.client },
		});

		expect(lb.granted).toEqual([{ room: roomId, perms: ["room:write"] }]);
	});
});
