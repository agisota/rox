import { describe, expect, it } from "bun:test";
import {
	type CollapsibleGroupKey,
	isGroupCollapsed,
	normalizeCollapseState,
	toggleGroupCollapsed,
} from "./group-collapse";
import type { SessionAgeGroupKey } from "./group-sessions";

const ALL_KEYS: readonly SessionAgeGroupKey[] = [
	"today",
	"yesterday",
	"last7Days",
	"last30Days",
	"older",
];

describe("isGroupCollapsed", () => {
	it("treats absent state as fully expanded", () => {
		expect(isGroupCollapsed(undefined, "today")).toBe(false);
		expect(isGroupCollapsed([], "today")).toBe(false);
	});

	it("reports a collapsed key", () => {
		expect(isGroupCollapsed(["older"], "older")).toBe(true);
		expect(isGroupCollapsed(["older"], "today")).toBe(false);
	});
});

describe("toggleGroupCollapsed", () => {
	it("collapses an expanded group", () => {
		expect(toggleGroupCollapsed(undefined, "today")).toEqual(["today"]);
	});

	it("expands a collapsed group", () => {
		expect(toggleGroupCollapsed(["today", "older"], "today")).toEqual([
			"older",
		]);
	});

	it("is idempotent across a round trip", () => {
		const once = toggleGroupCollapsed([], "older");
		const twice = toggleGroupCollapsed(once, "older");
		expect(twice).toEqual([]);
	});

	it("de-duplicates rather than bloating the stored array", () => {
		const next = toggleGroupCollapsed(["today", "today"], "older");
		expect(next.filter((k) => k === "today")).toHaveLength(1);
		expect(next).toContain("older");
	});
});

describe("normalizeCollapseState", () => {
	it("returns empty for non-array input", () => {
		expect(normalizeCollapseState(null, ALL_KEYS)).toEqual([]);
		expect(normalizeCollapseState("today", ALL_KEYS)).toEqual([]);
	});

	it("drops unknown and duplicate keys", () => {
		const raw = ["today", "today", "bogus", 42, "older"] as unknown;
		expect(normalizeCollapseState(raw, ALL_KEYS)).toEqual(["today", "older"]);
	});

	it("respects a restricted valid-key set", () => {
		const valid: CollapsibleGroupKey[] = ["older"];
		expect(normalizeCollapseState(["today", "older"], valid)).toEqual([
			"older",
		]);
	});
});
