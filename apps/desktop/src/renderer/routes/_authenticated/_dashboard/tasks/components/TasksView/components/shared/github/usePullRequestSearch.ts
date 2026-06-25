import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { classifyGithubError } from "./classifyGithubError";
import { filterPrsByState } from "./filterPrsByState";
import type { PrStateFilter } from "./StateFilterBar";
import type { GithubFetchError, PrListItem, PrState } from "./types";

const PAGE_SIZE = 30;

/**
 * Map the host wire state ("open" | "closed" | "merged") + draft flag onto the
 * normalized {@link PrState}. Centralized here so every consumer agrees.
 */
function toPrState(
	wireState: "open" | "closed" | "merged",
	isDraft: boolean,
): PrState {
	if (wireState === "merged") return "merged";
	if (wireState === "closed") return "closed";
	return isDraft ? "draft" : "open";
}

export interface UsePullRequestSearchResult {
	/** Normalized, flattened, client-filtered rows. */
	pullRequests: PrListItem[];
	totalCount: number;
	/** Rows actually shown after the segmented state filter. */
	shownCount: number;
	repoMismatch: string | null;
	isInitialLoad: boolean;
	isFetching: boolean;
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	fetchNextPage: () => void;
	/** Typed error for the resilient error card; null when healthy. */
	error: GithubFetchError | null;
	/** Force a refetch (the "Повторить" button — bypasses retry:false). */
	manualRetry: () => void;
	/** True when the query is gated off (no project / no host). */
	disabled: boolean;
}

/**
 * One typed adapter over the host `workspaceCreation.searchPullRequests`
 * contract. Normalizes every row into {@link PrListItem}, applies the segmented
 * state filter client-side, and classifies failures into a typed error so the
 * shell can render offline-vs-gh-auth remediation. `retry:false` stays for the
 * *automatic* path; the manual "Повторить" button calls {@link manualRetry}.
 */
export function usePullRequestSearch(
	projectFilter: string | null,
	searchQuery: string,
	stateFilter: PrStateFilter,
): UsePullRequestSearchResult {
	const isOnline = useOnlineStatus();
	const hostUrl = useHostUrl(null);
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	// `open` and `review` both work over the open set; only `merged`/`closed`
	// need the closed pages pulled in.
	const includeClosed = stateFilter === "merged" || stateFilter === "closed";

	const enabled = !!projectFilter && !!hostUrl;

	const query = useInfiniteQuery({
		queryKey: [
			"tasks",
			"searchPullRequests",
			projectFilter,
			hostUrl,
			debouncedQuery.trim(),
			includeClosed,
		],
		queryFn: async ({ pageParam }) => {
			if (!hostUrl || !projectFilter) {
				return {
					pullRequests: [],
					totalCount: 0,
					hasNextPage: false,
					page: pageParam,
				};
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchPullRequests.query({
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

	const normalized = useMemo<PrListItem[]>(() => {
		const raw = query.data?.pages.flatMap((p) => p.pullRequests) ?? [];
		return raw.map((pr) => ({
			prNumber: pr.prNumber,
			title: pr.title,
			url: pr.url,
			state: toPrState(pr.state, pr.isDraft),
			isDraft: pr.isDraft,
			authorLogin: pr.authorLogin,
			// Host wire already speaks the renderer vocabulary for review/checks,
			// so these pass straight through and degrade to null on no data.
			reviewDecision: pr.reviewDecision ?? null,
			checks: pr.checks ?? null,
			commentCount: pr.commentCount ?? null,
			updatedAt: pr.updatedAt ?? null,
		}));
	}, [query.data]);

	// Segmented filter applied client-side over already-fetched pages. `merged`
	// and `closed` are both fetched under includeClosed=true, then split here.
	const filtered = useMemo<PrListItem[]>(
		() => filterPrsByState(normalized, stateFilter),
		[normalized, stateFilter],
	);

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
		pullRequests: filtered,
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
