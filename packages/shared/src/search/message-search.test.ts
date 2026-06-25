import { describe, expect, test } from "bun:test";
import {
	filterByTitleTerm,
	normalizeMessageSearchQuery,
} from "./message-search";

describe("normalizeMessageSearchQuery", () => {
	test("returns null for empty / whitespace-only input", () => {
		expect(normalizeMessageSearchQuery("")).toBeNull();
		expect(normalizeMessageSearchQuery("   ")).toBeNull();
		expect(normalizeMessageSearchQuery("\t\n ")).toBeNull();
	});

	test("trims and collapses internal whitespace", () => {
		expect(normalizeMessageSearchQuery("  foo  bar ")).toBe("foo bar");
		expect(normalizeMessageSearchQuery("a\t\nb   c")).toBe("a b c");
	});

	test("preserves non-ASCII (Russian) content", () => {
		expect(normalizeMessageSearchQuery("  Привет   мир ")).toBe("Привет мир");
	});
});

describe("filterByTitleTerm", () => {
	const items = [
		{ id: "1", title: "Deploy the API" },
		{ id: "2", title: "Привет, мир" },
		{ id: "3", title: "deploy notes" },
	];

	test("empty / whitespace term returns every item, in input order", () => {
		expect(filterByTitleTerm(items, "")).toEqual(items);
		expect(filterByTitleTerm(items, "   ").map((i) => i.id)).toEqual([
			"1",
			"2",
			"3",
		]);
	});

	test("matches a case-insensitive substring", () => {
		expect(filterByTitleTerm(items, "DEPLOY").map((i) => i.id)).toEqual([
			"1",
			"3",
		]);
	});

	test("matches Russian content case-insensitively", () => {
		expect(filterByTitleTerm(items, "ПРИВЕТ").map((i) => i.id)).toEqual(["2"]);
	});

	test("no match yields an empty list", () => {
		expect(filterByTitleTerm(items, "zzz")).toEqual([]);
	});

	test("does not mutate the input array", () => {
		const input = [...items];
		filterByTitleTerm(input, "deploy");
		expect(input).toEqual(items);
	});
});
