import { describe, expect, it } from "bun:test";
import {
	GENERIC_ERROR_NOTICE,
	NEEDS_USER_KEY_NOTICE,
	NOT_CONFIGURED_NOTICE,
	deriveQuickChatReply,
} from "./deriveQuickChatReply";

describe("deriveQuickChatReply", () => {
	it("returns the model reply verbatim on status ok", () => {
		expect(
			deriveQuickChatReply({ status: "ok", sessionId: "s", reply: "Привет!" }),
		).toBe("Привет!");
	});

	it("maps needs-user-key to the bring-your-own-key notice", () => {
		expect(
			deriveQuickChatReply({ status: "needs-user-key", sessionId: "s" }),
		).toBe(NEEDS_USER_KEY_NOTICE);
	});

	it("maps not-configured to the unavailable notice", () => {
		expect(
			deriveQuickChatReply({ status: "not-configured", sessionId: "s" }),
		).toBe(NOT_CONFIGURED_NOTICE);
	});

	it("maps a thrown/null result to the generic error notice", () => {
		expect(deriveQuickChatReply(null)).toBe(GENERIC_ERROR_NOTICE);
	});
});
