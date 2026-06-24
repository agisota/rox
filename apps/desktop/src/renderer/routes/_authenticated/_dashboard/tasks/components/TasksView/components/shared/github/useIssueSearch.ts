import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { classifyGithubError } from "./classifyGithubError";
import type { IssueStateFilter } from "./StateFilterBar";
import type { GithubFetchError, IssueListItem } from "./types";

const PAGE_SIZE = 30;

export interface UseIssueSearchResult {
	issues: IssueListItem[];
	totalCount: number;
	shownCount: number;
	repoMismatch: string | null;
	isInitialLoad: boolean;
	isFetching: boolean;
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	fetchNextPage: () => void;
	error: GithubFetchError | null;
	manualRetry: () => void;
	disabled: boolean;
}

/**
 * Typed adapter over the host `workspaceCreation.searchGitHubIssues` contract.
 * Symmetric with {@link usePullRequestSearch}: normalizes rows into
 * {@link IssueListItem}, applies the segmented open/closed filter client-side,
 * and classifies failures for the resilient error card.
 *
 * NOTE: the host procedure does not return `labels`, so `labels` is always `[]`
 * here; rendering real label chips needs a backend change (needsShared).
 */
export function useIssueSearch(
	projectFilter: string | null,
	searchQuery: string,
	stateFilter: IssueStateFilter,
): UseIssueSearchResult {
	const isOnline = useOnlineStatus();
	const hostUrl = useHostUrl(null);
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const includeClosed = stateFilter !== "open";

	const enabled = !!projectFilter && !!hostUrl;

	const query = useInfiniteQuery({
		queryKey: [
			"tasks",
			"searchGitHubIssues",
			projectFilter,
			hostUrl,
			debouncedQuery.trim(),
			includeClosed,
		],
		queryFn: async ({ pageParam }) => {
			if (!hostUrl || !projectFilter) {
				return {
					issues: [],
					totalCount: 0,
					hasNextPage: false,
					page: pageParam,
				};
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchGitHubIssues.query({
				projectId: projectFilter,
				query: debouncedQuery.trim() || undefined,
				limit: PAGE_SIZE,
				includeClosed,
				page: pageParam,
			});
		},
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.hasNextPage ? lastPage.page + 1 : undefined,
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		placeholderData: keepPreviousData,
		enabled,
		retry: false,
	});

	const normalized = useMemo<IssueListItem[]>(() => {
		const raw = query.data?.pages.flatMap((p) => p.issues) ?? [];
		return raw.map((issue) => ({
			issueNumber: issue.issueNumber,
			title: issue.title,
			url: issue.url,
			state: issue.state.toLowerCase() === "closed" ? "closed" : "open",
			authorLogin: issue.authorLogin,
			// Host does not return labels yet — see needsShared.
			labels: [],
		}));
	}, [query.data]);

	const filtered = useMemo<IssueListItem[]>(() => {
		if (stateFilter === "open") {
			return normalized.filter((issue) => issue.state === "open");
		}
		return normalized.filter((issue) => issue.state === "closed");
	}, [normalized, stateFilter]);

	const totalCount = query.data?.pages[0]?.totalCount ?? 0;
	const repoMismatch = useMemo(() => {
		const first = query.data?.pages[0];
		return first && "repoMismatch" in first
			? (first.repoMismatch ?? null)
			: null;
	}, [query.data]);

	const error = useMemo<GithubFetchError | null>(() => {
		if (!query.error) return null;
		return classifyGithubError(query.error, isOnline);
	}, [query.error, isOnline]);

	const manualRetry = useCallback(() => {
		void query.refetch();
	}, [query]);

	const fetchNextPage = useCallback(() => {
		void query.fetchNextPage();
	}, [query]);

	return {
		issues: filtered,
		totalCount,
		shownCount: filtered.length,
		repoMismatch,
		isInitialLoad: query.isFetching && normalized.length === 0,
		isFetching: query.isFetching,
		isFetchingNextPage: query.isFetchingNextPage,
		hasNextPage: query.hasNextPage,
		fetchNextPage,
		error,
		manualRetry,
		disabled: !enabled,
	};
}
