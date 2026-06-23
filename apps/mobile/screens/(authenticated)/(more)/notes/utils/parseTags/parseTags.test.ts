import { describe, expect, test } from "bun:test";
import {
	collectTags,
	formatTags,
	normalizeTag,
	parseTags,
	toggleTag,
} from "./parseTags";

describe("normalizeTag", () => {
	test("trims and collapses internal whitespace", () => {
		expect(normalizeTag("  hello   world ")).toBe("hello world");
	});

	test("clamps to 40 characters", () => {
		expect(normalizeTag("a".repeat(50))).toHaveLength(40);
	});
});

describe("parseTags", () => {
	test("splits on commas and keeps multi-word tags", () => {
		expect(parseTags("work, deep work, urgent")).toEqual([
			"work",
			"deep work",
			"urgent",
		]);
	});

	test("dedupes case-insensitively, preserving first casing", () => {
		expect(parseTags("Work, work, WORK")).toEqual(["Work"]);
	});

	test("drops blank segments", () => {
		expect(parseTags(",  , work, ")).toEqual(["work"]);
	});

	test("returns empty for empty input", () => {
		expect(parseTags("")).toEqual([]);
	});
});

describe("formatTags", () => {
	test("round-trips with parseTags", () => {
		const tags = ["work", "deep work"];
		expect(parseTags(formatTags(tags))).toEqual(tags);
	});
});

describe("toggleTag", () => {
	test("adds a tag not present", () => {
		expect(toggleTag(["a"], "b")).toEqual(["a", "b"]);
	});

	test("removes a tag already present (case-insensitive)", () => {
		expect(toggleTag(["a", "b"], "A")).toEqual(["b"]);
	});
});

describe("collectTags", () => {
	test("collects distinct tags sorted, ignoring null/undefined", () => {
		expect(
			collectTags([["work", "urgent"], null, ["Urgent", "home"], undefined]),
		).toEqual(["home", "urgent", "work"]);
	});

	test("returns empty for no notes", () => {
		expect(collectTags([])).toEqual([]);
	});
});
