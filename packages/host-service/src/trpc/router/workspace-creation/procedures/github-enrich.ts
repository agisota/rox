import { z } from "zod";

/**
 * Shared wire shapes + parsers for enriching GitHub PR/issue list rows with the
 * richer signal the renderer already knows how to draw (review decision, checks
 * roll-up, comment count, labels, relative `updatedAt`).
 *
 * These are deliberately transport-agnostic: both the `gh` CLI path and the
 * Octokit fallback feed their raw payloads through the same normalizers so the
 * tRPC contract stays identical regardless of which transport answered.
 */

/** Renderer-facing review decision; null when GitHub has no decision yet. */
export type WireReviewDecision =
	| "approved"
	| "changes_requested"
	| "review_required"
	| null;

export type WireChecksStatus = "passing" | "failing" | "pending" | "none";

export interface WireChecksSummary {
	status: WireChecksStatus;
	passed: number;
	total: number;
}

/** Label as surfaced to the renderer (`color` is a hex string without `#`). */
export interface WireLabel {
	name: string;
	color: string | null;
}

/**
 * Map GitHub's `reviewDecision` enum (GraphQL / `gh` JSON) onto the renderer
 * vocabulary. GitHub emits `APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED` and
 * an empty string / null when no review is configured.
 */
export function normalizeReviewDecision(
	value: string | null | undefined,
): WireReviewDecision {
	switch (value) {
		case "APPROVED":
			return "approved";
		case "CHANGES_REQUESTED":
			return "changes_requested";
		case "REVIEW_REQUIRED":
			return "review_required";
		default:
			return null;
	}
}

/**
 * `gh pr list --json statusCheckRollup` returns a flat array of check contexts.
 * Each entry is either a CheckRun (`status`+`conclusion`) or a legacy commit
 * Status (`state`). We collapse them into a single pass/fail/pending summary so
 * the row can render the `k/n` dot without understanding GitHub internals.
 */
const statusCheckNodeSchema = z
	.object({
		// CheckRun fields
		status: z.string().nullable().optional(),
		conclusion: z.string().nullable().optional(),
		// Legacy commit Status field
		state: z.string().nullable().optional(),
	})
	.passthrough();

export const statusCheckRollupSchema = z
	.array(statusCheckNodeSchema)
	.nullable()
	.optional();

type StatusCheckNode = z.infer<typeof statusCheckNodeSchema>;

/**
 * Classify one rollup node as success / failure / pending. CheckRuns report a
 * lifecycle `status` (`QUEUED|IN_PROGRESS|COMPLETED`) plus a `conclusion`;
 * commit Statuses report a single `state` (`SUCCESS|PENDING|FAILURE|ERROR`).
 */
function classifyCheckNode(node: StatusCheckNode): WireChecksStatus {
	if (node.conclusion != null && node.conclusion !== "") {
		const c = node.conclusion.toUpperCase();
		if (c === "SUCCESS" || c === "NEUTRAL" || c === "SKIPPED") return "passing";
		if (
			c === "FAILURE" ||
			c === "TIMED_OUT" ||
			c === "CANCELLED" ||
			c === "ACTION_REQUIRED" ||
			c === "STARTUP_FAILURE"
		) {
			return "failing";
		}
		return "pending";
	}
	if (node.status != null && node.status !== "") {
		const s = node.status.toUpperCase();
		// A CheckRun without a conclusion is still running.
		return s === "COMPLETED" ? "passing" : "pending";
	}
	if (node.state != null && node.state !== "") {
		const st = node.state.toUpperCase();
		if (st === "SUCCESS") return "passing";
		if (st === "FAILURE" || st === "ERROR") return "failing";
		return "pending";
	}
	return "pending";
}

/**
 * Reduce a `statusCheckRollup` array into a {@link WireChecksSummary}. Returns
 * `null` when there are no checks so the renderer hides the indicator entirely
 * rather than drawing a misleading `0/0`.
 */
export function summarizeStatusCheckRollup(
	rollup: StatusCheckNode[] | null | undefined,
): WireChecksSummary | null {
	if (!rollup || rollup.length === 0) return null;
	let passed = 0;
	let failing = 0;
	let pending = 0;
	for (const node of rollup) {
		const status = classifyCheckNode(node);
		if (status === "passing") passed += 1;
		else if (status === "failing") failing += 1;
		else pending += 1;
	}
	const total = rollup.length;
	const status: WireChecksStatus =
		failing > 0 ? "failing" : pending > 0 ? "pending" : "passing";
	return { status, passed, total };
}

/**
 * The REST `search/issues` payload types labels as `string | { name, color }`.
 * Coerce both shapes into `{ name, color }` before {@link normalizeLabels}.
 */
export function normalizeSearchLabels(
	labels:
		| Array<string | { name?: string | null; color?: string | null }>
		| null
		| undefined,
): WireLabel[] {
	if (!labels) return [];
	return normalizeLabels(
		labels.map((l) => (typeof l === "string" ? { name: l, color: null } : l)),
	);
}

/** Normalize a `gh`/Octokit label payload into the renderer label shape. */
export function normalizeLabels(
	labels:
		| Array<{ name?: string | null; color?: string | null }>
		| null
		| undefined,
): WireLabel[] {
	if (!labels) return [];
	return labels
		.filter((l): l is { name: string; color?: string | null } => !!l?.name)
		.map((l) => ({
			name: l.name,
			// GitHub hex colors come without a leading `#`; renderer adds it.
			color: l.color && l.color.length > 0 ? l.color : null,
		}));
}
