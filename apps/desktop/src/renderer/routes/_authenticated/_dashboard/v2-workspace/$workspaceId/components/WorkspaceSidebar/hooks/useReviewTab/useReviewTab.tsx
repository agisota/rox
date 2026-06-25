import { workspaceTrpc } from "@rox/workspace-client";
import { useMemo } from "react";
import { LuMessageSquare } from "react-icons/lu";
import type { CommentPaneData, DiffFocusSide } from "../../../../types";
import {
	coerceCheckStatus,
	computeChecksRollup,
} from "../../components/PRActionHeader/utils/computeChecksStatus";
import type { SidebarTabDefinition } from "../../types";
import { ReviewTabContent } from "./components/ReviewTabContent";
import {
	computeDurationText,
	normalizeReviewDecision,
	normalizeThreadsToComments,
} from "./normalize";
import type { NormalizedComment, NormalizedPR } from "./types";

interface UseReviewTabParams {
	workspaceId: string;
	onOpenComment?: (comment: CommentPaneData) => void;
	onOpenInDiff?: (
		path: string,
		line?: number,
		openInNewTab?: boolean,
		side?: DiffFocusSide,
	) => void;
}

export function useReviewTab({
	workspaceId,
	onOpenComment,
	onOpenInDiff,
}: UseReviewTabParams): SidebarTabDefinition {
	const prQuery = workspaceTrpc.git.getPullRequest.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId,
			refetchInterval: 10_000,
			refetchOnWindowFocus: true,
			staleTime: 10_000,
		},
	);

	const hasPR = prQuery.isSuccess && prQuery.data != null;
	const threadsQuery = workspaceTrpc.git.getPullRequestThreads.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId && hasPR,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
		},
	);

	const pr = useMemo<NormalizedPR | null>(() => {
		const raw = prQuery.data;
		if (!raw) return null;
		return {
			number: raw.number,
			url: raw.url,
			title: raw.title,
			state: raw.isDraft ? "draft" : raw.state,
			reviewDecision: normalizeReviewDecision(raw.reviewDecision),
			checksStatus: computeChecksRollup(raw.checks).overall,
			checks: raw.checks.map((c) => ({
				name: c.name,
				// The DB stores the already-resolved effective status (success/failure/
				// pending/skipped/cancelled) in the `status` field, even though the
				// tRPC type calls it CheckStatusState.  Fall back to coercing it.
				status: coerceCheckStatus(c.status, c.conclusion),
				url: c.detailsUrl ?? undefined,
				durationText: computeDurationText(c.startedAt, c.completedAt),
			})),
		};
	}, [prQuery.data]);

	const comments = useMemo<NormalizedComment[]>(() => {
		const data = threadsQuery.data;
		if (!data) return [];
		return normalizeThreadsToComments(data);
	}, [threadsQuery.data]);

	const openReviewCount = comments.filter(
		(c) => c.kind === "review" && !c.isResolved,
	).length;

	const content = (
		<ReviewTabContent
			workspaceId={workspaceId}
			pr={pr}
			comments={comments}
			isLoading={prQuery.isLoading}
			isError={prQuery.isError}
			isCommentsLoading={threadsQuery.isLoading}
			onOpenComment={onOpenComment}
			onOpenInDiff={onOpenInDiff}
		/>
	);

	return {
		id: "review",
		label: "Ревью",
		icon: LuMessageSquare,
		badge: openReviewCount > 0 ? openReviewCount : undefined,
		content,
	};
}
