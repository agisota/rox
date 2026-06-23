/**
 * Pure UI-decision helpers for {@link QuickChatView}.
 *
 * Extracted so the "what does each completion status do to the UI" logic is unit
 * testable without rendering the full component (which pulls in tRPC, the router,
 * and a zustand store). The component imports {@link resolveQuickChatOutcome} so
 * the test and the view share one source of truth.
 */

/** Completion status returned by the `chat.complete` tRPC procedure. */
export type QuickChatCompletionStatus =
	| "ok"
	| "needs-user-key"
	| "not-configured";

/**
 * What the view should do with a completion result:
 * - `reply`     — append the assistant's real reply bubble.
 * - `notice`    — append an informational assistant bubble (e.g. needs-user-key).
 * - `configure` — DO NOT append a bubble; surface the inline "not configured"
 *                 banner + CTA and disable send instead of dead-ending.
 */
export type QuickChatOutcome = "reply" | "notice" | "configure";

/**
 * Map a completion status to its UI outcome.
 *
 * The key behavior this encodes: `"not-configured"` must NOT become a dead
 * assistant bubble — it returns `"configure"` so the caller shows an actionable
 * banner the user can act on. `"needs-user-key"` stays an informational notice
 * bubble (it already tells the user how to proceed), and `"ok"` is a real reply.
 */
export function resolveQuickChatOutcome(
	status: QuickChatCompletionStatus,
): QuickChatOutcome {
	switch (status) {
		case "ok":
			return "reply";
		case "needs-user-key":
			return "notice";
		case "not-configured":
			return "configure";
	}
}

/** True when send should be blocked because the house model isn't configured. */
export function shouldBlockSend(args: {
	trimmedInputLength: number;
	isSending: boolean;
	notConfigured: boolean;
}): boolean {
	return args.trimmedInputLength === 0 || args.isSending || args.notConfigured;
}
