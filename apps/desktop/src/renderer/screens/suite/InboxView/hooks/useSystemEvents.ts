import type {
	SelectAutomation,
	SelectAutomationRun,
	SelectGithubPullRequest,
	SelectV2Workspace,
} from "@rox/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import type { InboxItem } from "../types";
import {
	mergeSystemEvents,
	type SystemAgentApprovalRow,
	type SystemAutomationRunRow,
	type SystemPullRequestRow,
} from "../utils/normalizeSystemEvents";

/**
 * The "Система" aggregator. Pulls the three real notification seams already
 * present in the renderer and normalizes them into the unified `source: "system"`
 * {@link InboxItem} stream via the pure {@link mergeSystemEvents}:
 *
 *   1. PR/checks      — the Electric `githubPullRequests` mirror (url + review +
 *                       checks roll-up). Open PRs that need attention are unread.
 *   2. Automation runs — Electric `automationRuns` joined to their `automations`
 *                        for the title; freshly finished/failed runs are unread.
 *   3. Agent gates     — the chat-runtime attention store (`v2-notifications`):
 *                        a chat source in `review` is an agent waiting for input.
 *
 * Cache-first (AGENTS.md #9): every live query renders its persisted rows
 * immediately; we never gate on `isReady`. No polling, no seeded rows — an empty
 * "Система" is honest.
 */
export interface UseSystemEventsResult {
	items: InboxItem[];
	/** Unread system events (drives the rail badge + sidebar badge). */
	unreadCount: number;
}

/** A PR still wants attention while it is open/draft and not green-and-approved. */
function isPullRequestUnread(pr: SelectGithubPullRequest): boolean {
	if (pr.state !== "open") return false;
	if (pr.reviewDecision === "CHANGES_REQUESTED") return true;
	if (pr.checksStatus === "failure" || pr.checksStatus === "pending")
		return true;
	return pr.reviewDecision !== "APPROVED";
}

/** A run is unread until acknowledged: a terminal status (dispatched/failed). */
function isAutomationRunUnread(run: SelectAutomationRun): boolean {
	return (
		run.status === "dispatched" ||
		run.status === "dispatch_failed" ||
		run.status === "skipped_offline"
	);
}

export function useSystemEvents(): UseSystemEventsResult {
	const collections = useCollections();

	const { data: prRows = [] } = useLiveQuery(
		(q) => q.from({ pr: collections.githubPullRequests }),
		[collections.githubPullRequests],
	);
	const { data: automationRunRows = [] } = useLiveQuery(
		(q) => q.from({ run: collections.automationRuns }),
		[collections.automationRuns],
	);
	const { data: automationRows = [] } = useLiveQuery(
		(q) => q.from({ a: collections.automations }),
		[collections.automations],
	);
	const { data: workspaceRows = [] } = useLiveQuery(
		(q) => q.from({ w: collections.v2Workspaces }),
		[collections.v2Workspaces],
	);

	// The chat-runtime agent-attention signal (process-local zustand store).
	const notificationSources = useV2NotificationStore((s) => s.sources);

	const pullRequests = useMemo<SystemPullRequestRow[]>(() => {
		return (prRows as SelectGithubPullRequest[])
			.filter((pr) => pr != null)
			.map((pr) => ({
				id: pr.nodeId || `${pr.repositoryId}#${pr.prNumber}`,
				prNumber: pr.prNumber,
				title: pr.title,
				url: pr.url,
				state: (pr.isDraft && pr.state === "open"
					? "draft"
					: pr.state) as SystemPullRequestRow["state"],
				reviewDecision: pr.reviewDecision ?? null,
				checksStatus:
					(pr.checksStatus as SystemPullRequestRow["checksStatus"]) ?? null,
				updatedAt: pr.updatedAt ?? pr.createdAt ?? null,
				unread: isPullRequestUnread(pr),
			}));
	}, [prRows]);

	const automationRuns = useMemo<SystemAutomationRunRow[]>(() => {
		const nameById = new Map(
			(automationRows as SelectAutomation[])
				.filter((a) => a != null)
				.map((a) => [a.id, a.name]),
		);
		return (automationRunRows as SelectAutomationRun[])
			.filter((run) => run != null)
			.map((run) => ({
				id: run.id,
				automationId: run.automationId,
				title: run.title || nameById.get(run.automationId) || "Автоматизация",
				status: run.status,
				at: run.dispatchedAt ?? run.scheduledFor ?? run.createdAt ?? null,
				unread: isAutomationRunUnread(run),
			}));
	}, [automationRunRows, automationRows]);

	const agentApprovals = useMemo<SystemAgentApprovalRow[]>(() => {
		const nameById = new Map(
			(workspaceRows as SelectV2Workspace[])
				.filter((w) => w != null)
				.map((w) => [w.id, w.name]),
		);
		return Object.values(notificationSources)
			.filter(
				(entry) => entry.source.type === "chat" && entry.status === "review",
			)
			.map((entry) => ({
				id: entry.sourceKey,
				workspaceId: entry.workspaceId,
				title: `${nameById.get(entry.workspaceId) ?? "Агент"}: нужен ответ`,
				at: entry.occurredAt,
			}));
	}, [notificationSources, workspaceRows]);

	const items = useMemo(
		() => mergeSystemEvents({ pullRequests, automationRuns, agentApprovals }),
		[pullRequests, automationRuns, agentApprovals],
	);

	const unreadCount = useMemo(
		() => items.reduce((sum, item) => sum + (item.unreadCount > 0 ? 1 : 0), 0),
		[items],
	);

	return { items, unreadCount };
}
