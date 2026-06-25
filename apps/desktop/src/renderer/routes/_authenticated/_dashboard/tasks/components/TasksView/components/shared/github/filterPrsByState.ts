import type { PrStateFilter } from "./StateFilterBar";
import type { PrListItem } from "./types";

/**
 * Pure, transport-agnostic post-filter for the segmented PR state bar. Lives in
 * its own module (not inline in the hook) so the segment logic — including the
 * "На ревью" segment — is unit-testable and reusable across platforms over the
 * normalized {@link PrListItem} shape.
 *
 * - `open`    → open + draft PRs
 * - `review`  → open/draft PRs whose `reviewDecision === 'review_required'`
 * - `merged`  → merged PRs
 * - `closed`  → closed PRs
 */
export function filterPrsByState(
	prs: PrListItem[],
	stateFilter: PrStateFilter,
): PrListItem[] {
	switch (stateFilter) {
		case "open":
			return prs.filter((pr) => pr.state === "open" || pr.state === "draft");
		case "review":
			return prs.filter(
				(pr) =>
					(pr.state === "open" || pr.state === "draft") &&
					pr.reviewDecision === "review_required",
			);
		case "merged":
			return prs.filter((pr) => pr.state === "merged");
		case "closed":
			return prs.filter((pr) => pr.state === "closed");
	}
}
