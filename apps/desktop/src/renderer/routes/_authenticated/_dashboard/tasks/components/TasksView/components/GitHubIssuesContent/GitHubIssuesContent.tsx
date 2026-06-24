import { Button } from "@rox/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { GoIssueOpened } from "react-icons/go";
import { LuMinus } from "react-icons/lu";
import {
	type LinkedIssue,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	GithubEmptyState,
	GithubErrorCard,
	GithubNoProjectState,
	GithubSkeletonRows,
	type IssueListItem,
	IssueRow,
	type IssueStateFilter,
	RepoMismatchBanner,
	StateFilterBar,
	useIssueSearch,
	VirtualGithubList,
} from "../shared/github";

export interface SelectedIssue {
	issueNumber: number;
	title: string;
	url: string;
	state: string;
}

interface GitHubIssuesContentProps {
	projectFilter: string | null;
	searchQuery: string;
	onCollapse?: () => void;
	onSelectionChange?: (
		issues: SelectedIssue[],
		clearSelection: () => void,
	) => void;
}

export function GitHubIssuesContent({
	projectFilter,
	searchQuery,
	onCollapse,
	onSelectionChange,
}: GitHubIssuesContentProps) {
	const [stateFilter, setStateFilter] = useState<IssueStateFilter>("open");
	const [selectedIssues, setSelectedIssues] = useState<
		Map<number, SelectedIssue>
	>(new Map());
	const navigate = useNavigate();
	const updateDraft = useNewWorkspaceDraftStore((s) => s.updateDraft);
	const resetDraft = useNewWorkspaceDraftStore((s) => s.resetDraft);
	const openModal = useOpenNewWorkspaceModal();

	const {
		issues,
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
	} = useIssueSearch(projectFilter, searchQuery, stateFilter);

	const clearSelection = useCallback(() => {
		setSelectedIssues(new Map());
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: clear selection only when project changes
	useEffect(() => {
		setSelectedIssues(new Map());
	}, [projectFilter]);

	useEffect(() => {
		if (!onSelectionChange) return;
		onSelectionChange(Array.from(selectedIssues.values()), clearSelection);
	}, [selectedIssues, clearSelection, onSelectionChange]);

	const toggleIssueSelection = useCallback(
		(issue: IssueListItem, checked: boolean) => {
			setSelectedIssues((prev) => {
				const next = new Map(prev);
				if (checked) {
					next.set(issue.issueNumber, {
						issueNumber: issue.issueNumber,
						title: issue.title,
						url: issue.url,
						state: issue.state,
					});
				} else {
					next.delete(issue.issueNumber);
				}
				return next;
			});
		},
		[],
	);

	const handleAddToWorkspace = (issue: IssueListItem) => {
		if (!projectFilter) return;
		const linkedIssue: LinkedIssue = {
			slug: `gh-${issue.issueNumber}`,
			title: issue.title,
			source: "github",
			url: issue.url,
			number: issue.issueNumber,
			state: issue.state,
		};
		resetDraft();
		updateDraft({
			selectedProjectId: projectFilter,
			linkedIssues: [linkedIssue],
		});
		openModal(projectFilter);
	};

	const handleOpenUrl = (url: string) => {
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const handleOpenPreview = (issueNumber: number) => {
		if (!projectFilter) return;
		navigate({
			to: "/tasks/issue/$issueNumber",
			params: { issueNumber: String(issueNumber) },
			search: { project: projectFilter },
		});
	};

	if (!projectFilter) {
		return (
			<GithubNoProjectState
				icon={GoIssueOpened}
				message="Выберите проект, чтобы увидеть Issues."
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
				<GoIssueOpened className="size-3.5 text-muted-foreground" />
				<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					GitHub issues
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
				kind="issue"
				value={stateFilter}
				onChange={setStateFilter}
				countLabel={countLabel}
				isFetching={isFetching}
				onRefresh={manualRetry}
			/>

			{repoMismatch && <RepoMismatchBanner kind="issue" repo={repoMismatch} />}

			<div className="flex min-h-0 flex-1 flex-col">
				{error ? (
					<GithubErrorCard error={error} onRetry={manualRetry} />
				) : isInitialLoad ? (
					<GithubSkeletonRows />
				) : issues.length === 0 ? (
					<GithubEmptyState
						icon={GoIssueOpened}
						message={
							stateFilter === "open"
								? "Нет открытых Issues."
								: "Issues не найдены."
						}
					/>
				) : (
					<VirtualGithubList
						items={issues}
						getKey={(issue) => issue.issueNumber}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						onReachEnd={fetchNextPage}
						renderRow={(issue) => (
							<IssueRow
								issue={issue}
								selected={selectedIssues.has(issue.issueNumber)}
								onToggleSelect={toggleIssueSelection}
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
