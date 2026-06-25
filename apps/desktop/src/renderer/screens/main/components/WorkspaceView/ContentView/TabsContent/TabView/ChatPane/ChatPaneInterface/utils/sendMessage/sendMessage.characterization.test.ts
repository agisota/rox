import { describe, expect, it, mock } from "bun:test";
import { sendMessageForSession, toSendFailureMessage } from "./sendMessage";

/**
 * Characterization tests for the LEGACY-only session-readiness state machine,
 * pinned ahead of the #737 ChatPane shell merge. This is the single biggest
 * behavioral divergence the merge must preserve, so every branch of
 * `sendMessageForSession` and the auth-status mapping of `toSendFailureMessage`
 * is locked here.
 *
 * A sibling `sendMessage.test.ts` already covers the happy ready-session path,
 * the fresh-session path, and the ensure-failure throw. This file fills the
 * remaining branches the issue calls out:
 *   - current session + not ready + ensure RESOLVES true -> sends to current
 *   - no current session + onStartFreshSession returns { created: false }
 *   - the wider set of error shapes `toSendFailureMessage` must detect
 */

const SESSION_PERSIST_ERROR_MESSAGE =
	"Chat session failed to initialize. Please wait a moment and retry.";
const SESSION_CREATE_ERROR_MESSAGE =
	"Failed to create a chat session. Please retry.";
const AUTH_FAILURE_MESSAGE =
	"Model authentication failed. Reconnect OAuth or set an API key in the model picker, then retry.";

describe("sendMessageForSession (legacy state machine)", () => {
	it("ensures readiness then sends to the current session when ensure resolves true", async () => {
		const ensureSessionReady = mock(async () => true);
		const onStartFreshSession = mock(async () => ({
			created: true as const,
			sessionId: "fresh",
		}));
		const sendToCurrentSession = mock(async () => "current-value");
		const sendToSession = mock(async () => "other-value");

		const result = await sendMessageForSession({
			currentSessionId: "session-current",
			isSessionReady: false,
			ensureSessionReady,
			onStartFreshSession,
			sendToCurrentSession,
			sendToSession,
		});

		expect(result).toEqual({
			targetSessionId: "session-current",
			value: "current-value",
		});
		expect(ensureSessionReady).toHaveBeenCalledTimes(1);
		expect(sendToCurrentSession).toHaveBeenCalledTimes(1);
		expect(sendToSession).toHaveBeenCalledTimes(0);
		expect(onStartFreshSession).toHaveBeenCalledTimes(0);
	});

	it("throws the persist error when ensure resolves false (does not send)", async () => {
		const ensureSessionReady = mock(async () => false);
		const sendToCurrentSession = mock(async () => "current-value");
		const sendToSession = mock(async () => "other-value");

		await expect(
			sendMessageForSession({
				currentSessionId: "session-current",
				isSessionReady: false,
				ensureSessionReady,
				onStartFreshSession: mock(async () => ({
					created: true as const,
					sessionId: "fresh",
				})),
				sendToCurrentSession,
				sendToSession,
			}),
		).rejects.toThrow(SESSION_PERSIST_ERROR_MESSAGE);

		expect(sendToCurrentSession).toHaveBeenCalledTimes(0);
		expect(sendToSession).toHaveBeenCalledTimes(0);
	});

	it("creates a fresh session and sends to it when no current session exists", async () => {
		const onStartFreshSession = mock(async () => ({
			created: true as const,
			sessionId: "s1",
		}));
		const sendToSession = mock(
			async (sessionId: string) => `sent:${sessionId}`,
		);
		const sendToCurrentSession = mock(async () => "current-value");
		const ensureSessionReady = mock(async () => true);

		const result = await sendMessageForSession({
			currentSessionId: null,
			isSessionReady: false,
			ensureSessionReady,
			onStartFreshSession,
			sendToCurrentSession,
			sendToSession,
		});

		expect(result).toEqual({ targetSessionId: "s1", value: "sent:s1" });
		expect(sendToSession).toHaveBeenCalledWith("s1");
		// No current session -> ensureSessionReady guard is skipped entirely.
		expect(ensureSessionReady).toHaveBeenCalledTimes(0);
		expect(sendToCurrentSession).toHaveBeenCalledTimes(0);
	});

	it("throws the default create error when onStartFreshSession reports created:false with no message", async () => {
		const onStartFreshSession = mock(async () => ({ created: false as const }));
		const sendToSession = mock(async () => "other-value");
		const sendToCurrentSession = mock(async () => "current-value");

		await expect(
			sendMessageForSession({
				currentSessionId: null,
				isSessionReady: false,
				ensureSessionReady: mock(async () => true),
				onStartFreshSession,
				sendToCurrentSession,
				sendToSession,
			}),
		).rejects.toThrow(SESSION_CREATE_ERROR_MESSAGE);

		expect(sendToSession).toHaveBeenCalledTimes(0);
		expect(sendToCurrentSession).toHaveBeenCalledTimes(0);
	});

	it("surfaces the supplied errorMessage when fresh-session creation fails with one", async () => {
		const onStartFreshSession = mock(async () => ({
			created: false as const,
			errorMessage: "Quota exceeded, slow down",
		}));

		await expect(
			sendMessageForSession({
				currentSessionId: null,
				isSessionReady: false,
				ensureSessionReady: mock(async () => true),
				onStartFreshSession,
				sendToCurrentSession: mock(async () => "current-value"),
				sendToSession: mock(async () => "other-value"),
			}),
		).rejects.toThrow("Quota exceeded, slow down");
	});

	it("treats a created:true result missing a sessionId as a creation failure", async () => {
		const onStartFreshSession = mock(async () => ({
			created: true as const,
			sessionId: "",
		}));

		await expect(
			sendMessageForSession({
				currentSessionId: null,
				isSessionReady: false,
				ensureSessionReady: mock(async () => true),
				onStartFreshSession,
				sendToCurrentSession: mock(async () => "current-value"),
				sendToSession: mock(async () => "other-value"),
			}),
		).rejects.toThrow(SESSION_CREATE_ERROR_MESSAGE);
	});
});

describe("toSendFailureMessage (auth-status mapping)", () => {
	it("returns the auth message for nested data.statusCode 401", () => {
		expect(toSendFailureMessage({ data: { statusCode: 401 } })).toBe(
			AUTH_FAILURE_MESSAGE,
		);
	});

	it("returns the auth message for a string code '401'", () => {
		expect(toSendFailureMessage({ code: "401" })).toBe(AUTH_FAILURE_MESSAGE);
	});

	it("returns the auth message for a string code '403'", () => {
		expect(toSendFailureMessage({ code: "403" })).toBe(AUTH_FAILURE_MESSAGE);
	});

	it("returns the auth message for response.data.status 403", () => {
		expect(toSendFailureMessage({ response: { data: { status: 403 } } })).toBe(
			AUTH_FAILURE_MESSAGE,
		);
	});

	it("keeps the original string message for non-auth errors", () => {
		expect(toSendFailureMessage("network blip, retrying")).toBe(
			"network blip, retrying",
		);
	});

	it("falls back to a generic message for a status-less object error", () => {
		expect(toSendFailureMessage({})).toBe("Failed to send message");
	});

	it("does not treat a non-auth status (500) as an auth failure", () => {
		expect(toSendFailureMessage({ status: 500 })).toBe(
			"Failed to send message",
		);
	});

	it("preserves an Error message when no auth status is present", () => {
		expect(toSendFailureMessage(new Error("boom"))).toBe("boom");
	});
});
