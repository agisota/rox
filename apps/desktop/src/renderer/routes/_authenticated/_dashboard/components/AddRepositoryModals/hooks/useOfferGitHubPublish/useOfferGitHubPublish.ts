import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenGitHubPublish } from "renderer/stores/github-publish";

interface OfferGitHubPublishInput {
	projectId: string;
	/** Optional pre-fill; the dialog/host service defaults to the folder name. */
	suggestedName?: string;
}

/**
 * Returns an `offer` callback that opens the optional "publish to GitHub" dialog
 * for a freshly-created local project — but only when `gh` is installed AND
 * authenticated. If gh is missing/unauthed it silently does nothing, so the
 * GitHub affordance never appears for users without a configured gh CLI.
 *
 * Detection is a cached query (refetched lazily); the offer reads the latest
 * known value, so it's non-blocking and safe to call right after create.
 */
export function useOfferGitHubPublish() {
	const openPublish = useOpenGitHubPublish();
	const { data: gh } = electronTrpc.system.detectGhCli.useQuery(undefined, {
		staleTime: 30_000,
	});

	return useCallback(
		({ projectId, suggestedName }: OfferGitHubPublishInput) => {
			if (!gh?.installed || !gh.authenticated) return;
			openPublish({ projectId, suggestedName });
		},
		[gh, openPublish],
	);
}
