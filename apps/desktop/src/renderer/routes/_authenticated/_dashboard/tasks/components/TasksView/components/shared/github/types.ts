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
 * Phase-1 NOTE: `reviewDecision` / `checks` are present on the type but stay
 * `null` until the host `searchPullRequests` JSON is extended to include
 * `reviewDecision` + `statusCheckRollup` (gh already supports both). Until then
 * the row renders the structural signal it *can* derive (state + draft) and the
 * richer pills no-op. This keeps the renderer ready without a backend change.
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
	/** Phase-1 placeholder — populated once host returns reviewDecision. */
	reviewDecision: ReviewDecision | null;
	/** Phase-1 placeholder — populated once host returns statusCheckRollup. */
	checks: PrChecksSummary | null;
	/** Phase-1 placeholder — populated once host returns comment counts. */
	commentCount: number | null;
}

/** Normalized issue row, transport-agnostic. */
export interface IssueListItem {
	issueNumber: number;
	title: string;
	url: string;
	state: "open" | "closed";
	authorLogin: string | null;
	/**
	 * Phase-1 placeholder — the host `searchGitHubIssues` procedure does not
	 * return labels today, so this is always `[]`. Surfacing real labels as
	 * chips needs a shared backend change (see surface summary → needsShared).
	 */
	labels: IssueLabel[];
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
