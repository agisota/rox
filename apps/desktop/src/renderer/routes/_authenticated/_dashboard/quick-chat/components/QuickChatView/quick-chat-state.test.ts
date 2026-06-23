import { describe, expect, it } from "bun:test";
import { resolveQuickChatOutcome, shouldBlockSend } from "./quick-chat-state";

describe("resolveQuickChatOutcome", () => {
	it("maps an ok status to a real reply bubble", () => {
		expect(resolveQuickChatOutcome("ok")).toBe("reply");
	});

	it("maps needs-user-key to an informational notice bubble", () => {
		expect(resolveQuickChatOutcome("needs-user-key")).toBe("notice");
	});

	it("maps not-configured to the inline configure affordance, NOT a bubble", () => {
		// This is the core of BUG 2: a not-configured house model must surface an
		// actionable banner ("configure"), never a dead assistant bubble.
		expect(resolveQuickChatOutcome("not-configured")).toBe("configure");
	});

	it("never returns 'notice' for not-configured (no dead-end bubble)", () => {
		expect(resolveQuickChatOutcome("not-configured")).not.toBe("notice");
		expect(resolveQuickChatOutcome("not-configured")).not.toBe("reply");
	});

	it("degrades an unknown status to the configure banner (never undefined)", () => {
		// Simulate a status the server may add before this client is updated; the
		// `default` branch must fall back to the actionable banner, not a dead
		// bubble or `undefined`.
		const unknownStatus = "some-future-status" as Parameters<
			typeof resolveQuickChatOutcome
		>[0];
		expect(resolveQuickChatOutcome(unknownStatus)).toBe("configure");
	});
});

describe("shouldBlockSend", () => {
	it("blocks empty input", () => {
		expect(
			shouldBlockSend({
				trimmedInputLength: 0,
				isSending: false,
				notConfigured: false,
			}),
		).toBe(true);
	});

	it("blocks while a request is in flight", () => {
		expect(
			shouldBlockSend({
				trimmedInputLength: 5,
				isSending: true,
				notConfigured: false,
			}),
		).toBe(true);
	});

	it("blocks while the model is not configured (so the user can't re-hit the dead end)", () => {
		expect(
			shouldBlockSend({
				trimmedInputLength: 5,
				isSending: false,
				notConfigured: true,
			}),
		).toBe(true);
	});

	it("allows a normal send with text, idle, and a configured model", () => {
		expect(
			shouldBlockSend({
				trimmedInputLength: 5,
				isSending: false,
				notConfigured: false,
			}),
		).toBe(false);
	});
});
