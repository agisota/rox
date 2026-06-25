import { describe, expect, test } from "bun:test";
import {
	countFacets,
	emptyFacetCounts,
	facetForKind,
	facetsForScope,
	filterResultsByFacet,
	searchFacetLabel,
	searchKindLabel,
	totalFacetCount,
} from "./facets";
import type { SearchResponse, SearchResult } from "./types";

const result = (
	kind: SearchResult["kind"],
	facet: SearchResult["facet"],
	id: string,
	score = 1,
): SearchResult => ({
	id,
	kind,
	facet,
	title: `t-${id}`,
	snippet: null,
	score,
	updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("emptyFacetCounts", () => {
	test("is a fresh zeroed record each call", () => {
		const a = emptyFacetCounts();
		a.titles = 5;
		expect(emptyFacetCounts()).toEqual({
			titles: 0,
			messages: 0,
			toolCalls: 0,
			files: 0,
		});
	});
});

describe("facetsForScope", () => {
	test("chat scope only yields the messages facet", () => {
		expect(facetsForScope("chat")).toEqual(["messages"]);
	});

	test("global / project scopes yield every facet", () => {
		expect(facetsForScope("global")).toEqual([
			"titles",
			"messages",
			"toolCalls",
			"files",
		]);
		expect(facetsForScope("project")).toEqual([
			"titles",
			"messages",
			"toolCalls",
			"files",
		]);
	});
});

describe("facetForKind", () => {
	test("maps every entity kind to its facet", () => {
		expect(facetForKind("knowledge")).toBe("titles");
		expect(facetForKind("note")).toBe("titles");
		expect(facetForKind("journal")).toBe("titles");
		expect(facetForKind("message")).toBe("messages");
		expect(facetForKind("task")).toBe("toolCalls");
		expect(facetForKind("file")).toBe("files");
	});
});

describe("countFacets / totalFacetCount", () => {
	test("tallies per facet and totals across facets", () => {
		const results = [
			result("knowledge", "titles", "a"),
			result("journal", "titles", "b"),
			result("message", "messages", "c"),
			result("task", "toolCalls", "d"),
		];
		const counts = countFacets(results);
		expect(counts).toEqual({
			titles: 2,
			messages: 1,
			toolCalls: 1,
			files: 0,
		});
		expect(totalFacetCount(counts)).toBe(4);
	});
});

describe("filterResultsByFacet", () => {
	const response: SearchResponse = {
		results: [
			result("knowledge", "titles", "a"),
			result("message", "messages", "b"),
			result("file", "files", "c"),
		],
		facetCounts: { titles: 1, messages: 1, toolCalls: 0, files: 1 },
	};

	test("null active facet returns every result", () => {
		expect(filterResultsByFacet(response, null)).toHaveLength(3);
	});

	test("narrows to a single facet without touching counts", () => {
		const only = filterResultsByFacet(response, "messages");
		expect(only).toHaveLength(1);
		expect(only[0]?.id).toBe("b");
	});

	test("empty when no result matches the active facet", () => {
		expect(filterResultsByFacet(response, "toolCalls")).toEqual([]);
	});
});

describe("labels (RU)", () => {
	test("facet labels are the Russian segment names", () => {
		expect(searchFacetLabel("titles")).toBe("Заголовки");
		expect(searchFacetLabel("messages")).toBe("Сообщения");
		expect(searchFacetLabel("toolCalls")).toBe("Вызовы инструментов");
		expect(searchFacetLabel("files")).toBe("Файлы");
	});

	test("kind labels are Russian", () => {
		expect(searchKindLabel("task")).toBe("Задача");
		expect(searchKindLabel("file")).toBe("Файл");
		expect(searchKindLabel("message")).toBe("Сообщение");
	});
});
