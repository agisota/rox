/**
 * Single typed contract for the unified PR / Issue list panes.
 *
 * The host service (`workspaceCreation.searchPullRequests` /
 * `searchGitHubIssues`) and the electron `projects.searchPullRequests` path
 * historically returned *different* shapes (host = paged with
 * `authorLogin`/`isDraft`/`repoMismatch`, electron = a flat array with a
 * remapped state). The `usePullRequestSearch` / `useIssueSearch` adapters
 * normalize whatever the active transport returns into these types so every
 * consumer (rows, detail cross-chips, RunInWorkspace handoff) reads one shape.
 *
 * The host `searchPullRequests` / `searchGitHubIssues` JSON now returns the
 * rich signal directly (`reviewDecision` + `statusCheckRollup` → checks summary,
 * comment count, labels, `updatedAt`). Fields still degrade to `null` / `[]`
 * when GitHub has no data or the transport (Octokit fallback) cannot supply
 * them, so every consumer must treat them as optional.
 */

export type PrState = "open" | "merged" | "closed" | "draft" | "queued";

export type ReviewDecision =
	| "approved"
	| "changes_requested"
	| "review_required";

export type ChecksStatus = "passing" | "failing" | "pending" | "none";

export interface PrChecksSummary {
	status: ChecksStatus;
	/** Number of successful checks. */
	passed: number;
	/** Total number of checks reported. */
	total: number;
}

/** Normalized pull-request row, transport-agnostic. */
export interface PrListItem {
	prNumber: number;
	title: string;
	url: string;
	state: PrState;
	isDraft: boolean;
	authorLogin: string | null;
	/** GitHub review decision; null when GitHub has no decision yet. */
	reviewDecision: ReviewDecision | null;
	/** Collapsed status-check rollup; null when the PR has no checks. */
	checks: PrChecksSummary | null;
	/** Total comment count; null when the transport could not supply it. */
	commentCount: number | null;
	/** ISO timestamp of the last update, for relative-time rendering. */
	updatedAt: string | null;
}

/** Normalized issue row, transport-agnostic. */
export interface IssueListItem {
	issueNumber: number;
	title: string;
	url: string;
	state: "open" | "closed";
	authorLogin: string | null;
	/** Repo labels surfaced as colored chips; empty when GitHub has none. */
	labels: IssueLabel[];
	/** ISO timestamp of the last update, for relative-time rendering. */
	updatedAt: string | null;
}

export interface IssueLabel {
	name: string;
	/** Hex color WITHOUT leading `#`, GitHub-style. May be null. */
	color: string | null;
}

/**
 * Why a PR/Issue fetch failed, classified so the error card can show the
 * correct remediation (offline vs. `gh auth login`) instead of a raw message.
 */
export type GithubFetchErrorKind = "offline" | "gh-auth" | "unknown";

export interface GithubFetchError {
	kind: GithubFetchErrorKind;
	/** Human RU message for the error card body. */
	message: string;
	/** Original error message, kept for the selectable detail line. */
	raw: string;
}
