import type {
	NotificationInput,
	NotificationKind,
} from "renderer/stores/notification-feed";
import type { AgentLifecycleEvent } from "shared/notification-types";

/**
 * Pure event → feed-entry mapping for the bell. Free of React, tRPC, env, and
 * Electron-IPC imports so the transport-shape → {@link NotificationInput}
 * contract is unit-testable in `bun:test` without booting the renderer client
 * graph (mirrors the `applyCommsStreamEvent` / `map-event-type` split already in
 * the codebase).
 *
 * NO FABRICATION: every field is derived from the real event payload (the comms
 * SSE envelope and the agent-lifecycle hook event). The only synthesized text is
 * the static RU label/preview fallback used when the producer cannot resolve a
 * richer title from cache.
 */

/** The comms SSE envelope the renderer already consumes (`consumeCommsStream`). */
export interface CommsEnvelope {
	organizationId: string;
	threadId: string;
	messageId: string;
	/** `email` | `inapp` | `mesh` | `xmpp` (per the comms event bus). */
	transport: string;
	authorUserId: string | null;
	at: number;
}

/** RU titles per kind (single source so panel + entries stay consistent). */
export const NOTIFICATION_TITLE: Record<NotificationKind, string> = {
	mail: "Новое письмо",
	chat: "Новое сообщение",
	mention: "Вас упомянули",
	agent: "Агент завершил работу",
	automation: "Автоматизация выполнена",
	"pr-review": "Запрос ревью PR",
};

/**
 * Map one comms SSE frame to a feed entry. `email` → a mail notification routed
 * to the mail surface; every other transport → a chat notification routed to the
 * unified inbox. Returns `null` for a frame with no usable thread id (it can
 * never produce a navigable entry).
 *
 * `resolveTitle` lets the caller inject a richer, cache-derived preview (e.g.
 * the thread subject) without coupling this pure module to React Query; when it
 * returns nothing the static RU fallback is used.
 */
export function mapCommsEnvelope(
	event: CommsEnvelope,
	resolveTitle?: (source: "mail" | "chat", threadId: string) => string | null,
): NotificationInput | null {
	if (!event.threadId) return null;

	const isMail = event.transport === "email";
	const source = isMail ? "mail" : "chat";
	const kind: NotificationKind = isMail ? "mail" : "chat";
	const at = Number.isFinite(event.at) ? event.at : Date.now();
	const resolved = resolveTitle?.(source, event.threadId)?.trim() || null;

	return {
		// One entry per delivered message: the message id is globally unique, so a
		// reconnect re-delivering the same frame is de-duped by the store.
		id: `comms:${event.messageId}`,
		kind,
		title: NOTIFICATION_TITLE[kind],
		body: resolved ?? (isMail ? "Открыть почту" : "Открыть переписку"),
		at,
		target: isMail ? { to: "/email" } : { to: "/inbox" },
	};
}

/**
 * Map an agent-lifecycle hook event to a feed entry. Only the meaningful,
 * user-facing transitions surface in the bell:
 *   - `Stop`              → "agent finished"
 *   - `PermissionRequest` / `PendingQuestion` → "needs your input" (a stand-in
 *     for the PR-review / approval gate until a dedicated review event exists)
 * `Start` and any unknown type return `null` (the working spinner is feedback
 * enough; the bell is for completed/attention moments). Returns `null` without a
 * `workspaceId` since the entry could not deep-link.
 */
export function mapAgentLifecycle(
	event: AgentLifecycleEvent,
	resolveWorkspaceName?: (workspaceId: string) => string | null,
): NotificationInput | null {
	const workspaceId = event.workspaceId;
	if (!workspaceId) return null;

	const name = resolveWorkspaceName?.(workspaceId)?.trim() || null;
	const at = Date.now();
	// A stable-ish id per (workspace, terminal, type) so rapid duplicate hooks of
	// the same transition collapse, while distinct events still appear.
	const idScope = event.terminalId ?? event.paneId ?? event.sessionId ?? "ws";

	if (event.eventType === "Stop") {
		return {
			id: `agent:${workspaceId}:${idScope}:stop:${at}`,
			kind: "agent",
			title: NOTIFICATION_TITLE.agent,
			body: name ? `Воркспейс «${name}»` : "Открыть воркспейс",
			at,
			target: { to: "/v2-workspace/$workspaceId", workspaceId },
		};
	}

	if (
		event.eventType === "PermissionRequest" ||
		event.eventType === "PendingQuestion"
	) {
		return {
			id: `agent:${workspaceId}:${idScope}:review:${at}`,
			kind: "pr-review",
			title: "Агент ждёт ответа",
			body: name ? `Воркспейс «${name}»` : "Требуется ваше решение",
			at,
			target: { to: "/v2-workspace/$workspaceId", workspaceId },
		};
	}

	return null;
}
