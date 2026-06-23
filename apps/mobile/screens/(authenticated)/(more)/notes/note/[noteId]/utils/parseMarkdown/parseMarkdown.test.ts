import { describe, expect, test } from "bun:test";
import { parseMarkdown } from "./parseMarkdown";

describe("parseMarkdown", () => {
	test("classifies headings by level", () => {
		expect(parseMarkdown("# Title")).toEqual([
			{ kind: "heading", level: 1, text: "Title" },
		]);
		expect(parseMarkdown("### Small")).toEqual([
			{ kind: "heading", level: 3, text: "Small" },
		]);
	});

	test("classifies bullet list items", () => {
		expect(parseMarkdown("- one\n* two\n+ three")).toEqual([
			{ kind: "bullet", text: "one" },
			{ kind: "bullet", text: "two" },
			{ kind: "bullet", text: "three" },
		]);
	});

	test("treats other lines as paragraphs and skips blanks", () => {
		expect(parseMarkdown("hello\n\nworld")).toEqual([
			{ kind: "paragraph", text: "hello" },
			{ kind: "paragraph", text: "world" },
		]);
	});

	test("returns an empty list for empty input", () => {
		expect(parseMarkdown("")).toEqual([]);
		expect(parseMarkdown("   \n  ")).toEqual([]);
	});
});
