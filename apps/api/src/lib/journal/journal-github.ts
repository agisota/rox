/**
 * GitHub profile summary for the journal seed — journal-memory epic.
 *
 * Builds a compact GitHub profile summary from already-synced data (the GitHub
 * App keeps `github_repositories` / `github_pull_requests` fresh), so the
 * first-day journal seed needs no live Octokit call. Also owns the sentinel used
 * to mark a seed entry in `sourceSessionIds`. Orchestration lives in
 * `journal-generation.ts`.
 */

import { db } from "@rox/db/client";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
} from "@rox/db/schema";
import { desc, eq } from "drizzle-orm";
import {
	type GithubProfilePr,
	type GithubProfileRepo,
	type GithubProfileSummary,
	MAX_SEED_PRS,
	MAX_SEED_REPOS,
} from "./journal-seed";

/** Sentinel stored in `sourceSessionIds` to mark a GitHub-seed entry. */
export const SEED_SOURCE_MARKER = "seed:github";

/** True when a journal entry was produced by the GitHub seed (not real sessions). */
export function isSeedEntry(
	sourceSessionIds: readonly string[] | null | undefined,
): boolean {
	return (
		Array.isArray(sourceSessionIds) &&
		sourceSessionIds.includes(SEED_SOURCE_MARKER)
	);
}

/**
 * Build a compact GitHub profile summary for an org from already-synced data
 * (the GitHub App keeps `github_repositories` / `github_pull_requests` fresh),
 * so the seed needs no live Octokit call. Returns `null` when the org has no
 * GitHub installation.
 */
export async function buildGithubProfileSummary(
	organizationId: string,
): Promise<GithubProfileSummary | null> {
	const [installation] = await db
		.select({
			accountLogin: githubInstallations.accountLogin,
			accountType: githubInstallations.accountType,
		})
		.from(githubInstallations)
		.where(eq(githubInstallations.organizationId, organizationId))
		.limit(1);
	if (!installation) return null;

	const repoRows = await db
		.select({
			fullName: githubRepositories.fullName,
			isPrivate: githubRepositories.isPrivate,
			defaultBranch: githubRepositories.defaultBranch,
		})
		.from(githubRepositories)
		.where(eq(githubRepositories.organizationId, organizationId))
		.limit(MAX_SEED_REPOS);

	const prRows = await db
		.select({
			title: githubPullRequests.title,
			state: githubPullRequests.state,
			headBranch: githubPullRequests.headBranch,
		})
		.from(githubPullRequests)
		.where(eq(githubPullRequests.organizationId, organizationId))
		.orderBy(desc(githubPullRequests.updatedAt))
		.limit(MAX_SEED_PRS);

	const repos: GithubProfileRepo[] = repoRows.map((r) => ({
		fullName: r.fullName,
		isPrivate: r.isPrivate,
		defaultBranch: r.defaultBranch,
	}));
	const recentPrs: GithubProfilePr[] = prRows.map((p) => ({
		title: p.title,
		state: p.state,
		headBranch: p.headBranch,
	}));

	return {
		login: installation.accountLogin,
		accountType: installation.accountType,
		repos,
		recentPrs,
	};
}
