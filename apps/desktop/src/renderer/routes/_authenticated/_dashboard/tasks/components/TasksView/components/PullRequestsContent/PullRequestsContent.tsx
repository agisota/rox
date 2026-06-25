import { Button } from "@rox/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GoGitPullRequest } from "react-icons/go";
import { LuMinus } from "react-icons/lu";
import {
	type LinkedPR,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	GithubEmptyState,
	GithubErrorCard,
	GithubNoProjectState,
	GithubSkeletonRows,
	type PrListItem,
	PrRow,
	type PrStateFilter,
	RepoMismatchBanner,
	StateFilterBar,
	usePullRequestSearch,
	VirtualGithubList,
} from "../shared/github";

interface PullRequestsContentProps {
	projectFilter: string | null;
	searchQuery: string;
	onCollapse?: () => void;
}

export function PullRequestsContent({
	projectFilter,
	searchQuery,
	onCollapse,
}: PullRequestsContentProps) {
	const [stateFilter, setStateFilter] = useState<PrStateFilter>("open");
	const navigate = useNavigate();
	const updateDraft = useNewWorkspaceDraftStore((s) => s.updateDraft);
	const resetDraft = useNewWorkspaceDraftStore((s) => s.resetDraft);
	const openModal = useOpenNewWorkspaceModal();

	const {
		pullRequests,
		totalCount,
		shownCount,
		repoMismatch,
		isInitialLoad,
		isFetching,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
		error,
		manualRetry,
	} = usePullRequestSearch(projectFilter, searchQuery, stateFilter);

	const handleAddToWorkspace = (pr: PrListItem) => {
		if (!projectFilter) return;
		const linkedPR: LinkedPR = {
			prNumber: pr.prNumber,
			title: pr.title,
			url: pr.url,
			state: pr.state,
		};
		resetDraft();
		updateDraft({ selectedProjectId: projectFilter, linkedPR });
		openModal(projectFilter);
	};

	const handleOpenUrl = (url: string) => {
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const handleOpenPreview = (prNumber: number) => {
		if (!projectFilter) return;
		navigate({
			to: "/tasks/pr/$prNumber",
			params: { prNumber: String(prNumber) },
			search: { project: projectFilter },
		});
	};

	if (!projectFilter) {
		return (
			<GithubNoProjectState
				icon={GoGitPullRequest}
				message="Выберите проект, чтобы увидеть PR."
			/>
		);
	}

	const countLabel = isInitialLoad
		? "Загрузка…"
		: error
			? "—"
			: `${shownCount} из ${totalCount}`;

	return (
		<div className="@container flex h-full flex-col overflow-hidden">
			<div className="flex items-center gap-2 border-b border-border/60 bg-background/60 px-4 py-2 shrink-0 backdrop-blur-xl">
				<GoGitPullRequest className="size-3.5 text-muted-foreground" />
				<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Pull requests
				</span>
				{onCollapse && (
					<Button
						variant="ghost"
						size="icon-xs"
						title="Свернуть"
						className="ml-auto"
						onClick={onCollapse}
					>
						<LuMinus className="size-3.5" />
					</Button>
				)}
			</div>

			<StateFilterBar
				kind="pr"
				value={stateFilter}
				onChange={setStateFilter}
				countLabel={countLabel}
				isFetching={isFetching}
				onRefresh={manualRetry}
			/>

			{repoMismatch && <RepoMismatchBanner kind="pr" repo={repoMismatch} />}

			<div className="flex min-h-0 flex-1 flex-col">
				{error ? (
					<GithubErrorCard error={error} onRetry={manualRetry} />
				) : isInitialLoad ? (
					<GithubSkeletonRows />
				) : pullRequests.length === 0 ? (
					<GithubEmptyState
						icon={GoGitPullRequest}
						message={
							stateFilter === "open"
								? "Нет открытых PR."
								: stateFilter === "review"
									? "Нет PR на ревью."
									: "PR не найдены."
						}
					/>
				) : (
					<VirtualGithubList
						items={pullRequests}
						getKey={(pr) => pr.prNumber}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						onReachEnd={fetchNextPage}
						renderRow={(pr) => (
							<PrRow
								pr={pr}
								onOpen={handleOpenPreview}
								onOpenUrl={handleOpenUrl}
								onAddToWorkspace={handleAddToWorkspace}
							/>
						)}
					/>
				)}
			</div>
		</div>
	);
}
