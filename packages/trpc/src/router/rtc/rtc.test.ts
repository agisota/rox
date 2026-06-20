import { describe, expect, mock, test } from "bun:test";
import { voiceRoomName } from "@rox/rtc";

import { mintVoiceTokenForMember } from "./rtc";

const credentials = {
	apiKey: "devkey",
	apiSecret: "devsecretdevsecretdevsecret",
};

/**
 * Decode a JWT payload without pulling `livekit-server-sdk` into the trpc test
 * bundle. The cryptographic verification of LiveKit tokens already lives in
 * `packages/rtc/src/token.test.ts`; here we only assert the core wires the
 * caller identity + org-scoped room grant through correctly.
 */
function decodeJwtPayload(jwt: string): {
	sub?: string;
	video?: { room?: string; roomJoin?: boolean };
} {
	const payload = jwt.split(".")[1] ?? "";
	const json = Buffer.from(payload, "base64url").toString("utf8");
	return JSON.parse(json);
}

describe("mintVoiceTokenForMember (rtc.token core)", () => {
	test("mints a LiveKit token for a member of the room's org", async () => {
		const roomName = voiceRoomName("org_1", "general");
		const requireMembership = mock(async () => "org_1");

		const jwt = await mintVoiceTokenForMember({
			userId: "user_1",
			roomName,
			displayName: "Ada",
			ports: { requireMembership, credentials },
		});

		const claims = decodeJwtPayload(jwt);
		expect(claims.sub).toBe("user_1");
		expect(claims.video?.room).toBe(roomName);
		expect(claims.video?.roomJoin).toBe(true);
		expect(requireMembership).toHaveBeenCalledTimes(1);
	});

	test("rejects a non-org-scoped room before any membership/cloud work", async () => {
		const requireMembership = mock(async () => "org_1");

		await expect(
			mintVoiceTokenForMember({
				userId: "user_1",
				roomName: "freeform",
				ports: { requireMembership, credentials },
			}),
		).rejects.toThrow(/not org-scoped/);
		expect(requireMembership).not.toHaveBeenCalled();
	});

	test("denies when the caller is not a member of the room's org", async () => {
		const requireMembership = mock(async () => "org_2");

		await expect(
			mintVoiceTokenForMember({
				userId: "user_1",
				roomName: voiceRoomName("org_1", "general"),
				ports: { requireMembership, credentials },
			}),
		).rejects.toThrow(/belongs to org org_1, not org_2/);
	});

	test("propagates a membership-check rejection", async () => {
		const requireMembership = mock(async () => {
			throw new Error("FORBIDDEN: not a member");
		});

		await expect(
			mintVoiceTokenForMember({
				userId: "user_1",
				roomName: voiceRoomName("org_1", "general"),
				ports: { requireMembership, credentials },
			}),
		).rejects.toThrow(/not a member/);
	});
});
