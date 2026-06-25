import type { InboxItem } from "../types";

/**
 * Pure normalization of the three "system" notification sources into the
 * unified {@link InboxItem} stream (`source: "system"`). Kept React/tRPC/Electric
 * free so the merge + sort + dedupe contract is unit-testable without booting
 * the renderer client. The hook (`useSystemEvents`) is the thin adapter that
 * pulls the live rows (host PR search, Electric `automations`/`automationRuns`,
 * the chat-runtime agent-attention store) and feeds them in here.
 *
 * Each row carries a `systemAction` so the reader card knows where its primary
 * "go to source" button leads — without re-deriving the target from the title.
 */

/** A pull-request row (host `searchPullRequests` or the Electric mirror). */
export interface SystemPullRequestRow {
	/** Stable id for dedupe (the PR node id / `${repo}#${number}`). */
	id: string;
	prNumber: number;
	title: string;
	/** Web URL opened in the browser. */
	url: string;
	state: "open" | "closed" | "merged" | "draft";
	/** "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null. */
	reviewDecision: string | null;
	/** Roll-up of the PR's checks: "none" | "pending" | "success" | "failure". */
	checksStatus: "none" | "pending" | "success" | "failure" | null;
	/** Time of the latest PR event (drives sort + relative time). */
	updatedAt: Date | string | number | null;
	/** True while this PR still wants the user's attention (open + actionable). */
	unread: boolean;
}

/** An automation run row (Electric `automation_runs` joined to its automation). */
export interface SystemAutomationRunRow {
	id: string;
	automationId: string;
	/** Run title (falls back to the automation name). */
	title: string;
	/**
	 * The dispatch lifecycle status (DB `automation_run_status`):
	 * `dispatching` | `dispatched` | `skipped_offline` | `dispatch_failed`.
	 */
	status: string;
	/** Latest run event time. */
	at: Date | string | number | null;
	/** True for a freshly-finished/failed run the user has not acknowledged. */
	unread: boolean;
}

/** A pending agent approval/question from the chat runtime. */
export interface SystemAgentApprovalRow {
	/** Stable id (the chat source key — `chat:${sessionId}`). */
	id: string;
	/** Workspace the agent is waiting in (the "reply" navigation target). */
	workspaceId: string;
	/** Short human label for the workspace/agent. */
	title: string;
	/** When the agent started waiting. */
	at: Date | string | number | null;
}

function toDate(value: Date | string | number | null): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Human one-line status for a PR review/check roll-up. */
function describePullRequest(row: SystemPullRequestRow): string {
	if (row.reviewDecision === "CHANGES_REQUESTED") return "Запрошены изменения";
	if (row.checksStatus === "failure") return "Проверки упали";
	if (row.checksStatus === "pending") return "Проверки выполняются";
	if (row.reviewDecision === "APPROVED") return "Одобрен — можно мержить";
	if (row.state === "merged") return "Влит";
	if (row.state === "closed") return "Закрыт";
	if (row.state === "draft") return "Черновик";
	return "Ожидает ревью";
}

/** Normalize one pull-request row into a system inbox item. */
export function normalizePullRequestEvent(
	row: SystemPullRequestRow,
): InboxItem {
	return {
		key: `system:pr:${row.id}`,
		source: "system",
		threadId: `pr:${row.id}`,
		title: `PR #${row.prNumber}: ${row.title}`,
		preview: describePullRequest(row),
		timestamp: toDate(row.updatedAt),
		unreadCount: row.unread ? 1 : 0,
		systemAction: { kind: "open-pr", url: row.url },
	};
}

/** Human one-line status for an automation run (DB `automation_run_status`). */
function describeAutomationRun(row: SystemAutomationRunRow): string {
	switch (row.status) {
		case "dispatched":
			return "Прогон запущен";
		case "dispatching":
			return "Прогон запускается";
		case "skipped_offline":
			return "Пропущен — хост офлайн";
		case "dispatch_failed":
			return "Запуск не удался";
		default:
			return `Статус: ${row.status}`;
	}
}

/** Normalize one automation run row into a system inbox item. */
export function normalizeAutomationRunEvent(
	row: SystemAutomationRunRow,
): InboxItem {
	return {
		key: `system:automation:${row.id}`,
		source: "system",
		threadId: `automation:${row.automationId}`,
		title: row.title,
		preview: describeAutomationRun(row),
		timestamp: toDate(row.at),
		unreadCount: row.unread ? 1 : 0,
		systemAction: { kind: "open-automation", automationId: row.automationId },
	};
}

/** Normalize one pending agent approval/question into a system inbox item. */
export function normalizeAgentApprovalEvent(
	row: SystemAgentApprovalRow,
): InboxItem {
	return {
		key: `system:agent:${row.id}`,
		source: "system",
		threadId: `agent:${row.id}`,
		title: row.title,
		preview: "Агент ждёт вашего ответа",
		timestamp: toDate(row.at),
		// A pending agent gate is by definition something to act on.
		unreadCount: 1,
		systemAction: { kind: "reply-agent", workspaceId: row.workspaceId },
	};
}

export interface SystemEventSources {
	pullRequests?: readonly SystemPullRequestRow[];
	automationRuns?: readonly SystemAutomationRunRow[];
	agentApprovals?: readonly SystemAgentApprovalRow[];
}

/**
 * Merge + sort + dedupe the three system sources into one stream. Rows are
 * de-duplicated by `key` (`system:${kind}:${id}`) so a source that double-reports
 * never yields two rows, collapsed by `threadId` so the same PR/automation thread
 * surfaces once (keeping the newest event), and sorted newest-first by
 * `timestamp` (nulls last).
 */
export function mergeSystemEvents(sources: SystemEventSources): InboxItem[] {
	const byThread = new Map<string, InboxItem>();
	const consider = (item: InboxItem) => {
		const existing = byThread.get(item.threadId);
		if (!existing) {
			byThread.set(item.threadId, item);
			return;
		}
		const a = existing.timestamp?.getTime() ?? 0;
		const b = item.timestamp?.getTime() ?? 0;
		// Keep the newer event for a thread; carry forward any unread signal so a
		// stale-but-unread row never silently drops its badge.
		const winner = b >= a ? item : existing;
		byThread.set(item.threadId, {
			...winner,
			unreadCount: Math.max(existing.unreadCount, item.unreadCount),
		});
	};

	for (const row of sources.pullRequests ?? [])
		consider(normalizePullRequestEvent(row));
	for (const row of sources.automationRuns ?? [])
		consider(normalizeAutomationRunEvent(row));
	for (const row of sources.agentApprovals ?? [])
		consider(normalizeAgentApprovalEvent(row));

	return [...byThread.values()].sort((x, y) => {
		const xt = x.timestamp?.getTime() ?? 0;
		const yt = y.timestamp?.getTime() ?? 0;
		return yt - xt;
	});
}
