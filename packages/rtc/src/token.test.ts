import { describe, expect, test } from "bun:test";
import { TokenVerifier } from "livekit-server-sdk";

import { mintVoiceToken } from "./token";
import { voiceRoomName } from "./types";

const credentials = {
	apiKey: "devkey",
	apiSecret: "devsecretdevsecretdevsecret",
};

describe("mintVoiceToken", () => {
	test("mints a token granting roomJoin for the org-scoped room", async () => {
		const roomName = voiceRoomName("org_1", "general");
		const jwt = await mintVoiceToken({
			userId: "user_1",
			organizationId: "org_1",
			roomName,
			displayName: "Ada",
			credentials,
		});

		const verifier = new TokenVerifier(
			credentials.apiKey,
			credentials.apiSecret,
		);
		const claims = await verifier.verify(jwt);
		expect(claims.sub).toBe("user_1");
		expect(claims.name).toBe("Ada");
		expect(claims.video?.room).toBe(roomName);
		expect(claims.video?.roomJoin).toBe(true);
	});

	test("rejects an empty organization id", async () => {
		await expect(
			mintVoiceToken({
				userId: "user_1",
				organizationId: "",
				roomName: voiceRoomName("org_1", "general"),
				credentials,
			}),
		).rejects.toThrow(/organizationId is required/);
	});

	test("rejects a room whose org does not match the caller", async () => {
		await expect(
			mintVoiceToken({
				userId: "user_1",
				organizationId: "org_2",
				roomName: voiceRoomName("org_1", "general"),
				credentials,
			}),
		).rejects.toThrow(/belongs to org org_1, not org_2/);
	});

	test("rejects a non-org-scoped room name", async () => {
		await expect(
			mintVoiceToken({
				userId: "user_1",
				organizationId: "org_1",
				roomName: "freeform",
				credentials,
			}),
		).rejects.toThrow(/not org-scoped/);
	});
});
