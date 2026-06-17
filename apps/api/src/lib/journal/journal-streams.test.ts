import { describe, expect, test } from "bun:test";
import { dayBounds, sanitizeStreams } from "./journal-streams";

describe("dayBounds", () => {
	test("computes a 24h UTC window from a YYYY-MM-DD day", () => {
		const { start, end } = dayBounds("2026-06-16");
		expect(start.toISOString()).toBe("2026-06-16T00:00:00.000Z");
		expect(end.toISOString()).toBe("2026-06-17T00:00:00.000Z");
	});
});

describe("sanitizeStreams", () => {
	test("keeps a well-formed payload and drops empty entries", () => {
		const result = sanitizeStreams({
			reflection: "  день  ",
			learnings: [{ text: "вывод" }, { text: "  " }],
			memorySuggestions: [{ body: "факт", category: "projects" }],
			tips: [{ text: "совет" }],
		});
		expect(result.reflection).toBe("день");
		expect(result.learnings).toEqual([{ text: "вывод" }]);
		expect(result.memorySuggestions).toEqual([
			{ body: "факт", category: "projects" },
		]);
		expect(result.tips).toEqual([{ text: "совет" }]);
	});

	test("coerces an unknown category to general", () => {
		const result = sanitizeStreams({
			reflection: "r",
			memorySuggestions: [{ body: "b", category: "nonsense" as never }],
		});
		expect(result.memorySuggestions).toEqual([
			{ body: "b", category: "general" },
		]);
	});

	test("defaults missing/invalid fields to empty arrays + empty reflection", () => {
		const result = sanitizeStreams(null);
		expect(result).toEqual({
			reflection: "",
			learnings: [],
			memorySuggestions: [],
			tips: [],
		});
	});

	test("drops memory suggestions with empty bodies", () => {
		const result = sanitizeStreams({
			memorySuggestions: [
				{ body: "  ", category: "projects" },
				{ body: "ok", category: "identity" },
			],
		});
		expect(result.memorySuggestions).toEqual([
			{ body: "ok", category: "identity" },
		]);
	});
});
