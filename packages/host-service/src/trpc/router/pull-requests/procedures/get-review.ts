import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger } from "../../../../lib/logger";
import {
	fetchPullRequestChecks,
	fetchPullRequestChecksFromGh,
	fetchPullRequestReviewDecision,
	fetchPullRequestReviewDecisionFromGh,
} from "../../../../runtime/pull-requests/utils/github-query";
import type { GitHubPullRequestNode } from "../../../../runtime/pull-requests/utils/github-query/types";
import {
	computeChecksStatus,
	mapReviewDecision,
	parseCheckContexts,
} from "../../../../runtime/pull-requests/utils/pull-request-mappers";
import { protectedProcedure } from "../../../index";
import type { IssueComment, PullRequestReviewThread } from "../../git/types";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "../../git/utils/graphql";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";

const getReviewInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

const ghPullRequestReviewSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	headRefName: z.string(),
	headRefOid: z.string(),
	baseRefName: z.string(),
	headRepositoryOwner: z.object({ login: z.string() }).nullable(),
	isCrossRepository: z.boolean(),
	isDraft: z.boolean(),
	author: z.object({ login: z.string() }).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

function ghStateToNodeState(state: string): GitHubPullRequestNode["state"] {
	const upper = state.toUpperCase();
	if (upper === "MERGED") return "MERGED";
	if (upper === "CLOSED") return "CLOSED";
	return "OPEN";
}

/**
 * Host-scoped review payload for a PR resolved by `(projectId, prNumber)` — the
 * non-workspace analog of `git.getPullRequest` + `git.getPullRequestThreads`.
 *
 * Reuses the same GraphQL/REST review + checks computation as the runtime PR
 * manager, so the detail page can mount the existing `PRHeader` / `ChecksSection`
 * / `CommentsSection` over the resulting `NormalizedPR` without opening a
 * workspace.
 */
export const getReview = protectedProcedure
	.meta({ timeoutMs: 30_000 })
	.input(getReviewInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);

		let raw: unknown;
		try {
			raw = await execGh([
				"pr",
				"view",
				String(input.prNumber),
				"--repo",
				`${repo.owner}/${repo.name}`,
				"--json",
				"number,title,body,url,state,author,headRefName,headRefOid,baseRefName,headRepositoryOwner,isCrossRepository,isDraft,createdAt,updatedAt",
			]);
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		const pr = ghPullRequestReviewSchema.parse(raw);
		const nodeState = ghStateToNodeState(pr.state);

		// Review decision + checks: prefer `gh`, fall back to Octokit — mirrors the
		// runtime PR manager's dual-path strategy. Degrade to empty/pending on
		// failure rather than failing the whole detail view.
		let reviewDecision: ReturnType<typeof mapReviewDecision> = null;
		let checks: ReturnType<typeof parseCheckContexts> = [];
		try {
			const [decision, checkNodes] = await Promise.all([
				fetchPullRequestReviewDecisionFromGh(
					execGh,
					repo,
					pr.number,
					nodeState,
				),
				fetchPullRequestChecksFromGh(execGh, repo, pr.headRefOid),
			]);
			reviewDecision = mapReviewDecision(decision);
			checks = parseCheckContexts(checkNodes);
		} catch (ghError) {
			try {
				const octokit = await ctx.github();
				const [decision, checkNodes] = await Promise.all([
					fetchPullRequestReviewDecision(octokit, repo, pr.number, nodeState),
					fetchPullRequestChecks(octokit, repo, pr.headRefOid),
				]);
				reviewDecision = mapReviewDecision(decision);
				checks = parseCheckContexts(checkNodes);
			} catch (error) {
				logger.warn(
					"[pull-requests.getReview] Failed to fetch review/check state",
					{
						owner: repo.owner,
						name: repo.name,
						prNumber: pr.number,
						ghError,
						error,
					},
				);
			}
		}

		// Threads + conversation comments: reuse the exact GraphQL query + REST
		// pagination used by `git.getPullRequestThreads`, so the renderer's existing
		// thread normalizer applies unchanged.
		const octokit = await ctx.github();

		let reviewThreads: PullRequestReviewThread[] = [];
		try {
			const result: GraphQLThreadsResult = await octokit.graphql(
				REVIEW_THREADS_QUERY,
				{ owner: repo.owner, name: repo.name, prNumber: pr.number },
			);
			reviewThreads = parseGraphQLThreads(result);
		} catch (error) {
			logger.warn(
				"[pull-requests.getReview] Failed to fetch review threads",
				error,
			);
		}

		const conversationComments: IssueComment[] = [];
		try {
			let page = 1;
			let hasMore = true;
			while (hasMore) {
				const { data: comments } = await octokit.issues.listComments({
					owner: repo.owner,
					repo: repo.name,
					issue_number: pr.number,
					per_page: 100,
					page,
				});
				for (const c of comments) {
					const body = c.body?.trim();
					if (!body) continue;
					conversationComments.push({
						id: c.id,
						user: {
							login: c.user?.login ?? "ghost",
							avatarUrl: c.user?.avatar_url ?? "",
						},
						body,
						createdAt: c.created_at ?? "",
						htmlUrl: c.html_url ?? "",
					});
				}
				hasMore = comments.length === 100;
				page++;
			}
		} catch (error) {
			logger.warn(
				"[pull-requests.getReview] Failed to fetch conversation comments",
				error,
			);
		}

		return {
			number: pr.number,
			title: pr.title,
			body: pr.body ?? "",
			url: pr.url,
			state: pr.state.toLowerCase(),
			isDraft: pr.isDraft,
			branch: pr.headRefName,
			baseBranch: pr.baseRefName,
			headRepositoryOwner: pr.headRepositoryOwner?.login ?? null,
			isCrossRepository: pr.isCrossRepository,
			author: pr.author?.login ?? null,
			reviewDecision,
			checksStatus: computeChecksStatus(checks),
			checks: checks.map((c) => ({
				name: c.name,
				status: c.status,
				url: c.url,
			})),
			reviewThreads,
			conversationComments,
		};
	});
