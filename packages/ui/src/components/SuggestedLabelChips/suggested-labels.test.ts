import { describe, expect, test } from "bun:test";
import { identityGlyph } from "@rox/shared/identity-glyph";
import {
	deriveSuggestedChips,
	MAX_SUGGESTED_CHIPS,
	suggestedLabelColor,
} from "./suggested-labels";

describe("suggestedLabelColor", () => {
	test("returns the deterministic identityGlyph background", () => {
		expect(suggestedLabelColor("billing")).toBe(
			identityGlyph("billing").background,
		);
		expect(suggestedLabelColor("design")).toBe(suggestedLabelColor("design"));
	});
});

describe("deriveSuggestedChips", () => {
	test("shows fresh suggestions, capped at the chip budget", () => {
		expect(
			deriveSuggestedChips({
				suggestions: ["billing", "onboarding", "bug", "design"],
				appliedLabels: [],
				dismissed: [],
			}),
		).toEqual(["billing", "onboarding", "bug"]);
		expect(MAX_SUGGESTED_CHIPS).toBe(3);
	});

	test("hides applied labels (manual override, case-insensitive)", () => {
		expect(
			deriveSuggestedChips({
				suggestions: ["billing", "bug"],
				appliedLabels: ["Billing"],
				dismissed: [],
			}),
		).toEqual(["bug"]);
	});

	test("hides dismissed labels (case-insensitive)", () => {
		expect(
			deriveSuggestedChips({
				suggestions: ["billing", "bug"],
				appliedLabels: [],
				dismissed: ["BUG"],
			}),
		).toEqual(["billing"]);
	});

	test("drops duplicates and blanks, order-preserving", () => {
		expect(
			deriveSuggestedChips({
				suggestions: ["bug", "  ", "Bug", "design"],
				appliedLabels: [],
				dismissed: [],
			}),
		).toEqual(["bug", "design"]);
	});

	test("returns empty when everything is applied or dismissed", () => {
		expect(
			deriveSuggestedChips({
				suggestions: ["billing", "bug"],
				appliedLabels: ["billing"],
				dismissed: ["bug"],
			}),
		).toEqual([]);
	});
});
