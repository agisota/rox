import { describe, expect, test } from "bun:test";

import type { UnifiedSearchHit } from "./unifiedSearchResults";
import {
	mapUnifiedSearchResults,
	toUnifiedSearchResult,
	UNIFIED_SEARCH_DEFAULT_KINDS,
	unifiedSearchHref,
	unifiedSearchKindLabel,
} from "./unifiedSearchResults";

const hit = (over: Partial<UnifiedSearchHit> = {}): UnifiedSearchHit => ({
	id: "e1",
	kind: "task",
	slug: "fix-login",
	title: "Fix login",
	status: "active",
	snippet: "…the login button…",
	...over,
});

describe("unifiedSearchResults — mapping", () => {
	test("maps a hit to a view model (kind label, title, snippet, deep link)", () => {
		const vm = toUnifiedSearchResult(hit());
		expect(vm).toEqual({
			id: "e1",
			kind: "task",
			kindLabel: "Задача",
			title: "Fix login",
			snippet: "…the login button…",
			href: "rox://tasks/fix-login",
		});
	});

	test("preserves order across a list of hits", () => {
		const rows = mapUnifiedSearchResults([
			hit({ id: "a", title: "A" }),
			hit({ id: "b", title: "B", kind: "note", slug: "note-b" }),
		]);
		expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
		expect(rows[1]?.kindLabel).toBe("Заметка");
	});

	test("blank/whitespace snippet collapses to null (no empty snippet row)", () => {
		expect(toUnifiedSearchResult(hit({ snippet: "   " })).snippet).toBeNull();
		expect(
			toUnifiedSearchResult(hit({ snippet: undefined })).snippet,
		).toBeNull();
	});
});

describe("unifiedSearchResults — kind labels", () => {
	test("known kinds render RU labels", () => {
		expect(unifiedSearchKindLabel("note")).toBe("Заметка");
		expect(unifiedSearchKindLabel("project")).toBe("Проект");
		expect(unifiedSearchKindLabel("contact")).toBe("Контакт");
		expect(unifiedSearchKindLabel("file")).toBe("Файл");
		expect(unifiedSearchKindLabel("feed")).toBe("Лента");
	});

	test("unmapped kind falls back to the raw kind string (no crash)", () => {
		expect(unifiedSearchKindLabel("osint_entity")).toBe("osint_entity");
	});
});

describe("unifiedSearchResults — deep links", () => {
	test("task + note kinds build a rox:// deep link from the slug", () => {
		expect(unifiedSearchHref(hit({ kind: "task", slug: "t" }))).toBe(
			"rox://tasks/t",
		);
		expect(unifiedSearchHref(hit({ kind: "note", slug: "n" }))).toBe(
			"rox://notes/n",
		);
	});

	test("a slug-less hit is non-navigable (href null)", () => {
		expect(unifiedSearchHref(hit({ slug: null }))).toBeNull();
	});

	test("a kind without an openable route is non-navigable (href null)", () => {
		// `project` is a real kind but has no desktop deep-link route yet — we do
		// not fabricate a route that would 404.
		expect(unifiedSearchHref(hit({ kind: "project", slug: "p" }))).toBeNull();
	});

	test("slug is URL-encoded into the deep link", () => {
		expect(unifiedSearchHref(hit({ kind: "task", slug: "a b/c" }))).toBe(
			"rox://tasks/a%20b%2Fc",
		);
	});
});

describe("unifiedSearchResults — kinds filter", () => {
	test("the default kinds are the addressable Project-OS object kinds", () => {
		expect([...UNIFIED_SEARCH_DEFAULT_KINDS]).toEqual([
			"note",
			"task",
			"project",
			"contact",
			"feed",
			"file",
		]);
	});

	test("excludes internal/non-object kinds (activity_event, tag)", () => {
		const kinds = new Set<string>(UNIFIED_SEARCH_DEFAULT_KINDS);
		expect(kinds.has("activity_event")).toBe(false);
		expect(kinds.has("tag")).toBe(false);
	});
});
