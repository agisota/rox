import type { NormalizedComment } from "./types";

/**
 * Thread/comment normalization shared between the workspace-scoped review tab
 * (`useReviewTab`) and the host-scoped PR detail view. Both consume the same
 * `{ reviewThreads, conversationComments }` shape returned by
 * `git.getPullRequestThreads` / `pullRequests.getReview`.
 */
export interface ReviewThreadsData {
	reviewThreads: Array<{
		id: string;
		isResolved: boolean;
		isOutdated: boolean;
		diffSide: "LEFT" | "RIGHT";
		line: number | null;
		path: string;
		comments: Array<{
			id: string;
			author: { login: string; avatarUrl: string };
			body: string;
			createdAt: string;
		}>;
	}>;
	conversationComments: Array<{
		id: number;
		user: { login: string; avatarUrl: string };
		body: string;
		createdAt: string;
		htmlUrl: string;
	}>;
}

export function normalizeReviewDecision(
	decision: string | null,
): "approved" | "changes_requested" | "pending" {
	if (decision === "approved") return "approved";
	if (decision === "changes_requested") return "changes_requested";
	return "pending";
}

export function computeDurationText(
	startedAt: string | null,
	completedAt: string | null,
): string | undefined {
	if (!startedAt || !completedAt) return undefined;
	const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
	if (Number.isNaN(ms) || ms < 0) return undefined;
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.round(seconds / 60);
	return `${minutes}m`;
}

export function normalizeThreadsToComments(
	data: ReviewThreadsData,
): NormalizedComment[] {
	const comments: NormalizedComment[] = [];

	for (const thread of data.reviewThreads) {
		const first = thread.comments[0];
		if (!first) continue;
		comments.push({
			id: first.id,
			authorLogin: first.author.login,
			avatarUrl: first.author.avatarUrl || undefined,
			body: first.body,
			createdAt: first.createdAt,
			url: undefined,
			kind: "review",
			path: thread.path || undefined,
			line: thread.line ?? undefined,
			diffSide: thread.diffSide,
			isResolved: thread.isResolved,
			isOutdated: thread.isOutdated,
			threadId: thread.id,
		});
	}

	for (const c of data.conversationComments) {
		comments.push({
			id: String(c.id),
			authorLogin: c.user.login,
			avatarUrl: c.user.avatarUrl || undefined,
			body: c.body,
			createdAt: c.createdAt,
			url: c.htmlUrl || undefined,
			kind: "conversation",
			isResolved: false,
			threadId: undefined,
		});
	}

	comments.sort((a, b) => {
		const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
		const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
		return ta - tb;
	});

	return comments;
}
