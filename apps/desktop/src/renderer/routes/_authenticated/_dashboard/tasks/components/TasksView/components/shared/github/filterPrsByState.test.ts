import { describe, expect, it } from "bun:test";
import { filterPrsByState } from "./filterPrsByState";
import type { PrListItem, ReviewDecision } from "./types";

function pr(
	prNumber: number,
	state: PrListItem["state"],
	reviewDecision: ReviewDecision | null = null,
): PrListItem {
	return {
		prNumber,
		title: `PR ${prNumber}`,
		url: `https://example.test/pr/${prNumber}`,
		state,
		isDraft: state === "draft",
		authorLogin: null,
		reviewDecision,
		checks: null,
		commentCount: null,
		updatedAt: null,
	};
}

const rows: PrListItem[] = [
	pr(1, "open", "review_required"),
	pr(2, "open", "approved"),
	pr(3, "draft", "review_required"),
	pr(4, "open", null),
	pr(5, "merged", "approved"),
	pr(6, "closed", "changes_requested"),
];

describe("filterPrsByState", () => {
	it("open: keeps open + draft, drops merged/closed", () => {
		expect(filterPrsByState(rows, "open").map((p) => p.prNumber)).toEqual([
			1, 2, 3, 4,
		]);
	});

	it("review: only open/draft PRs requiring review", () => {
		expect(filterPrsByState(rows, "review").map((p) => p.prNumber)).toEqual([
			1, 3,
		]);
	});

	it("review: excludes approved / no-decision / merged / closed", () => {
		const result = filterPrsByState(rows, "review");
		expect(result.every((p) => p.reviewDecision === "review_required")).toBe(
			true,
		);
		expect(result.some((p) => p.state === "merged")).toBe(false);
		expect(result.some((p) => p.state === "closed")).toBe(false);
	});

	it("merged: only merged PRs", () => {
		expect(filterPrsByState(rows, "merged").map((p) => p.prNumber)).toEqual([
			5,
		]);
	});

	it("closed: only closed PRs", () => {
		expect(filterPrsByState(rows, "closed").map((p) => p.prNumber)).toEqual([
			6,
		]);
	});
});
