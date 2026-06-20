import { describe, expect, mock, test } from "bun:test";

import { authorizeRoom } from "./auth";
import { dashboardRoomId } from "./types";

const userInfo = { name: "Ada", avatarUrl: null, organizationId: "org_1" };

/**
 * A fake `@liveblocks/node` client capturing the room/permissions a session was
 * granted, so the test never touches the LiveBlocks cloud.
 */
function fakeLiveblocks() {
	const granted: Array<{ room: string; perms: readonly string[] }> = [];
	const authorize = mock(async () => ({
		status: 200,
		body: JSON.stringify({ token: "lb_session_token" }),
	}));
	const session = {
		FULL_ACCESS: ["room:write"] as const,
		allow(room: string, perms: readonly string[]) {
			granted.push({ room, perms });
			return session;
		},
		authorize,
	};
	const prepareSession = mock(() => session);
	return { client: { prepareSession }, granted, prepareSession, authorize };
}

describe("authorizeRoom", () => {
	test("grants a session for a room whose org matches the caller", async () => {
		const lb = fakeLiveblocks();
		const roomId = dashboardRoomId("org_1", "dash_42");
		const result = await authorizeRoom({
			userId: "user_1",
			organizationId: "org_1",
			roomId,
			userInfo,
			liveblocks: lb.client,
		});

		expect(result.token).toBe("lb_session_token");
		expect(lb.prepareSession).toHaveBeenCalledTimes(1);
		expect(lb.granted).toEqual([{ room: roomId, perms: ["room:write"] }]);
	});

	test("denies when the room's org does not match the caller's org", async () => {
		const lb = fakeLiveblocks();
		await expect(
			authorizeRoom({
				userId: "user_1",
				organizationId: "org_2",
				roomId: dashboardRoomId("org_1", "dash_42"),
				userInfo,
				liveblocks: lb.client,
			}),
		).rejects.toThrow(/belongs to org org_1, not org_2/);
		expect(lb.prepareSession).not.toHaveBeenCalled();
	});

	test("rejects a non-org-scoped room id", async () => {
		const lb = fakeLiveblocks();
		await expect(
			authorizeRoom({
				userId: "user_1",
				organizationId: "org_1",
				roomId: "freeform-room",
				userInfo,
				liveblocks: lb.client,
			}),
		).rejects.toThrow(/not org-scoped/);
	});

	test("throws when LiveBlocks denies the session", async () => {
		const lb = fakeLiveblocks();
		lb.authorize.mockResolvedValueOnce({ status: 403, body: "{}" });
		await expect(
			authorizeRoom({
				userId: "user_1",
				organizationId: "org_1",
				roomId: dashboardRoomId("org_1", "dash_42"),
				userInfo,
				liveblocks: lb.client,
			}),
		).rejects.toThrow(/status 403/);
	});
});
