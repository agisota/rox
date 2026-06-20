import { describe, expect, it } from "bun:test";
import { MOCK_ORG_ID } from "shared/constants";
import {
	DEV_CHAT_MODELS,
	getDesktopChatModelOptions,
	isDesktopChatSessionReady,
	resolveDesktopChatOrganizationId,
} from "./dev-chat";

describe("dev chat helpers", () => {
	it("uses the mock organization in dev mode", () => {
		expect(resolveDesktopChatOrganizationId(null, true)).toBe(MOCK_ORG_ID);
		expect(resolveDesktopChatOrganizationId("org-123", true)).toBe(MOCK_ORG_ID);
	});

	it("keeps the real organization outside dev mode", () => {
		expect(resolveDesktopChatOrganizationId("org-123", false)).toBe("org-123");
		expect(resolveDesktopChatOrganizationId(null, false)).toBeNull();
	});

	it("treats local session ids as ready in dev mode", () => {
		expect(
			isDesktopChatSessionReady({
				sessionId: "session-123",
				hasPersistedSession: false,
				skipEnvValidation: true,
			}),
		).toBe(true);
		expect(
			isDesktopChatSessionReady({
				sessionId: null,
				hasPersistedSession: false,
				skipEnvValidation: true,
			}),
		).toBe(false);
	});

	it("returns the fallback model list only in dev mode", () => {
		expect(getDesktopChatModelOptions(true)).toEqual(DEV_CHAT_MODELS);
		expect(getDesktopChatModelOptions(false)).toEqual([]);
	});
});
