import { z } from "zod";
import { logger } from "../../../../lib/logger";
import { protectedProcedure } from "../../../index";
import { normalizeGitHubQuery } from "../normalize-github-query";
import { githubSearchInputSchema } from "../schemas";
import {
	type ResolvedGithubRepo,
	resolveGithubRepo,
} from "../shared/project-helpers";
import type { ExecGh } from "../utils/exec-gh";
import {
	normalizeReviewDecision,
	statusCheckRollupSchema,
	summarizeStatusCheckRollup,
	type WireChecksSummary,
	type WireReviewDecision,
} from "./github-enrich";

interface PullRequestResult {
	prNumber: number;
	title: string;
	url: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	authorLogin: string | null;
	/** GitHub review decision; null when no review is required/decided. */
	reviewDecision: WireReviewDecision;
	/** Collapsed status-check rollup; null when the PR has no checks. */
	checks: WireChecksSummary | null;
	/** Total comment count; null when the transport could not supply it. */
	commentCount: number | null;
	/** ISO timestamp of the last update, for relative-time rendering. */
	updatedAt: string | null;
}

interface PullRequestsPage {
	pullRequests: PullRequestResult[];
	totalCount: number;
	hasNextPage: boolean;
	page: number;
	repoMismatch?: string;
}

function normalizePullRequestState(
	state: string,
	mergedAt: string | null | undefined,
): "open" | "closed" | "merged" {
	if (mergedAt) return "merged";
	return state.toLowerCase() === "closed" ? "closed" : "open";
}

const ghPrViewSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.string(),
	isDraft: z.boolean().optional(),
	author: z.object({ login: z.string() }).nullable().optional(),
	mergedAt: z.string().nullable().optional(),
	reviewDecision: z.string().nullable().optional(),
	statusCheckRollup: statusCheckRollupSchema,
	comments: z.array(z.unknown()).nullable().optional(),
	updatedAt: z.string().nullable().optional(),
});

// `gh pr view` returns the rich signal in one call: review decision, the full
// status-check rollup, the comment array (we only need its length), and the
// `updatedAt` timestamp the row uses for relative time.
const PR_VIEW_FIELDS =
	"number,title,url,state,isDraft,author,mergedAt,reviewDecision,statusCheckRollup,comments,updatedAt";

async function ghDirectLookup(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	prNumber: number,
): Promise<PullRequestResult> {
	const raw = await execGh(
		[
			"pr",
			"view",
			String(prNumber),
			"--repo",
			`${repo.owner}/${repo.name}`,
			"--json",
			PR_VIEW_FIELDS,
		],
		{ cwd: repo.repoPath ?? undefined },
	);
	const pr = ghPrViewSchema.parse(raw);
	return {
		prNumber: pr.number,
		title: pr.title,
		url: pr.url,
		state: normalizePullRequestState(pr.state, pr.mergedAt),
		isDraft: pr.isDraft ?? false,
		authorLogin: pr.author?.login ?? null,
		reviewDecision: normalizeReviewDecision(pr.reviewDecision),
		checks: summarizeStatusCheckRollup(pr.statusCheckRollup),
		commentCount: pr.comments?.length ?? null,
		updatedAt: pr.updatedAt ?? null,
	};
}

const searchIssuesItemSchema = z.object({
	number: z.number(),
	title: z.string(),
	html_url: z.string(),
	state: z.string(),
	draft: z.boolean().optional(),
	user: z.object({ login: z.string() }).nullable().optional(),
	comments: z.number().nullable().optional(),
	updated_at: z.string().nullable().optional(),
	pull_request: z
		.object({
			merged_at: z.string().nullable().optional(),
		})
		.optional(),
});

const searchIssuesResponseSchema = z.object({
	total_count: z.number(),
	items: z.array(searchIssuesItemSchema),
});

/**
 * `gh pr list --json number,reviewDecision,statusCheckRollup` returns review +
 * checks in a single call. The `search/issues` API cannot surface those fields,
 * so we enrich the search rows with this list, keyed by PR number. Best-effort:
 * any failure leaves review/checks null and the row degrades to state + draft.
 */
const ghPrListReviewSchema = z.array(
	z.object({
		number: z.number(),
		reviewDecision: z.string().nullable().optional(),
		statusCheckRollup: statusCheckRollupSchema,
	}),
);

interface PrReviewChecks {
	reviewDecision: WireReviewDecision;
	checks: WireChecksSummary | null;
}

async function ghListReviewChecks(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	searchQuery: string,
	includeClosed: boolean,
	perPage: number,
): Promise<Map<number, PrReviewChecks>> {
	const byNumber = new Map<number, PrReviewChecks>();
	try {
		const args = [
			"pr",
			"list",
			"--repo",
			`${repo.owner}/${repo.name}`,
			"--state",
			includeClosed ? "all" : "open",
			"--limit",
			String(perPage),
			"--json",
			"number,reviewDecision,statusCheckRollup",
		];
		if (searchQuery) {
			args.push("--search", searchQuery);
		}
		const raw = await execGh(args, { cwd: repo.repoPath ?? undefined });
		const parsed = ghPrListReviewSchema.parse(raw);
		for (const node of parsed) {
			byNumber.set(node.number, {
				reviewDecision: normalizeReviewDecision(node.reviewDecision),
				checks: summarizeStatusCheckRollup(node.statusCheckRollup),
			});
		}
	} catch (err) {
		logger.warn(
			"[workspaceCreation.searchPullRequests] review/checks enrichment failed; rows degrade",
			err,
		);
	}
	return byNumber;
}

async function ghApiSearchPullRequests(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	query: string,
	includeClosed: boolean,
	page: number,
	perPage: number,
): Promise<{
	items: PullRequestResult[];
	totalCount: number;
	hasNextPage: boolean;
}> {
	const stateFilter = includeClosed ? "" : " is:open";
	const q =
		`repo:${repo.owner}/${repo.name} is:pr${stateFilter}${query ? ` ${query}` : ""}`.trim();
	const args = [
		"api",
		"-X",
		"GET",
		"search/issues",
		"-f",
		`q=${q}`,
		"-F",
		`per_page=${perPage}`,
		"-F",
		`page=${page}`,
		"-f",
		"sort=updated",
		"-f",
		"order=desc",
	];
	const raw = await execGh(args, { cwd: repo.repoPath ?? undefined });
	const parsed = searchIssuesResponseSchema.parse(raw);
	// Review decision + checks roll-up aren't in the search payload — fetch them
	// once via `gh pr list` and merge by number. Empty map on failure → nulls.
	const reviewChecks = await ghListReviewChecks(
		execGh,
		repo,
		query,
		includeClosed,
		perPage,
	);
	const items: PullRequestResult[] = parsed.items
		.filter((item) => !!item.pull_request)
		.map((item) => {
			const enrich = reviewChecks.get(item.number);
			return {
				prNumber: item.number,
				title: item.title,
				url: item.html_url,
				state: normalizePullRequestState(
					item.state,
					item.pull_request?.merged_at,
				),
				isDraft: item.draft ?? false,
				authorLogin: item.user?.login ?? null,
				reviewDecision: enrich?.reviewDecision ?? null,
				checks: enrich?.checks ?? null,
				commentCount: item.comments ?? null,
				updatedAt: item.updated_at ?? null,
			};
		});
	const hasNextPage = page * perPage < parsed.total_count;
	return { items, totalCount: parsed.total_count, hasNextPage };
}

export const searchPullRequests = protectedProcedure
	.input(githubSearchInputSchema)
	.query(async ({ ctx, input }): Promise<PullRequestsPage> => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const limit = input.limit ?? 30;
		const page = input.page ?? 1;

		const raw = input.query?.trim() ?? "";
		const normalized = normalizeGitHubQuery(raw, repo, "pull");

		if (normalized.repoMismatch) {
			return {
				pullRequests: [],
				totalCount: 0,
				hasNextPage: false,
				page,
				repoMismatch: `${repo.owner}/${repo.name}`,
			};
		}

		const effectiveQuery = normalized.query;

		// gh-first uses the user's local `gh auth login`; falls back to
		// Octokit when gh is missing, unauthed, or errors.
		try {
			if (normalized.isDirectLookup) {
				const prNumber = Number.parseInt(effectiveQuery, 10);
				const pr = await ghDirectLookup(ctx.execGh, repo, prNumber);
				return {
					pullRequests: [pr],
					totalCount: 1,
					hasNextPage: false,
					page,
				};
			}
			const result = await ghApiSearchPullRequests(
				ctx.execGh,
				repo,
				effectiveQuery,
				input.includeClosed ?? false,
				page,
				limit,
			);
			return {
				pullRequests: result.items,
				totalCount: result.totalCount,
				hasNextPage: result.hasNextPage,
				page,
			};
		} catch (ghErr) {
			logger.warn(
				"[workspaceCreation.searchPullRequests] gh path failed; falling back to Octokit",
				ghErr,
			);
		}

		const octokit = await ctx.github();

		try {
			if (normalized.isDirectLookup) {
				const prNumber = Number.parseInt(effectiveQuery, 10);
				const { data: pr } = await octokit.pulls.get({
					owner: repo.owner,
					repo: repo.name,
					pull_number: prNumber,
				});
				const state = normalizePullRequestState(pr.state, pr.merged_at);
				return {
					pullRequests: [
						{
							prNumber: pr.number,
							title: pr.title,
							url: pr.html_url,
							state,
							isDraft: pr.draft ?? false,
							authorLogin: pr.user?.login ?? null,
							// Octokit's REST PR object lacks the GraphQL rollup; the
							// renderer degrades gracefully when these are null.
							reviewDecision: null,
							checks: null,
							commentCount: pr.comments ?? null,
							updatedAt: pr.updated_at ?? null,
						},
					],
					totalCount: 1,
					hasNextPage: false,
					page,
				};
			}

			const stateFilter = input.includeClosed ? "" : " is:open";
			const query =
				`repo:${repo.owner}/${repo.name} is:pr${stateFilter} ${effectiveQuery}`.trim();
			const { data } = await octokit.search.issuesAndPullRequests({
				q: query,
				per_page: limit,
				page,
				sort: "updated",
				order: "desc",
			});
			const pullRequests = data.items
				.filter((item) => item.pull_request)
				.map((item) => {
					const state = normalizePullRequestState(
						item.state,
						item.pull_request?.merged_at,
					);
					return {
						prNumber: item.number,
						title: item.title,
						url: item.html_url,
						state,
						isDraft: item.draft ?? false,
						authorLogin: item.user?.login ?? null,
						// Search results over Octokit don't carry review/checks.
						reviewDecision: null,
						checks: null,
						commentCount: item.comments ?? null,
						updatedAt: item.updated_at ?? null,
					};
				});
			const hasNextPage = page * limit < data.total_count;
			return {
				pullRequests,
				totalCount: data.total_count,
				hasNextPage,
				page,
			};
		} catch (err) {
			// Both gh and Octokit failed — rethrow so the renderer's toast
			// fires instead of the dropdown silently rendering "no results".
			logger.warn(
				"[workspaceCreation.searchPullRequests] octokit fallback failed",
				err,
			);
			throw err;
		}
	});
